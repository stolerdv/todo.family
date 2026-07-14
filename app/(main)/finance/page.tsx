'use client'

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import type { Account, DepositRate, Txn, TxnType, FinanceSettings, Category, Budget, Space, Credit, CreditKind, CreditDirection, CreditPayment, OpTemplate } from '@/lib/finance'
import { Dates } from '@/lib/trackerStats'
import {
  accountValue, depositValue, effectiveRate, combinedTotal, currenciesInUse, convert, rebase,
  categorySpend, categoryMeta, ACCOUNT_TYPES, typeLabel,
} from '@/lib/financeCalc'
import { fmt, isMoneyHidden, setMoneyHidden, loadMoneyHidden } from '@/lib/hideMoney'
import '../tracker/tracker.css'
import './finance.css'

const CURRENCIES = ['₸', '€', '$']
const ACCENT = '#ff7a1a' // единый янтарный акцент — цвета счетов убраны (моно-тема)
const EMOJIS = ['💵','💳','🏦','🐷','📈','💰','💶','💴','🪙','💎','🏠','🚗','📱','🎁']
const CAT_EMOJIS = ['🍔','🛒','🚗','🏠','☕','💊','🎉','👕','📱','🎁','💸','✈️','🎮','📚','🐶','💅','🍺','⛽','🚕','🏥','💼','🛠','↩️','💰','🎯','🎓','🏋️','🌸']

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

type View = { name: 'list' | 'detail' | 'credits' | 'credit-detail'; id?: string }
type Modal = null | 'account' | 'op' | 'menu' | 'rates' | 'cats' | 'budgets' | 'space' | 'reports' | 'credit' | 'credit-pay'

export default function FinancePage() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [settings, setSettings] = useState<FinanceSettings>({ baseCurrency: '', rates: {} })
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [templates, setTemplates] = useState<OpTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ name: 'list' })
  const [modal, setModal] = useState<Modal>(null)
  const [editingAcc, setEditingAcc] = useState<Account | null>(null)
  const [editingOp, setEditingOp] = useState<Txn | null>(null)
  const [editingCredit, setEditingCredit] = useState<Credit | null>(null)
  const [payingCredit, setPayingCredit] = useState<Credit | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [, forceHideRerender] = useState(0)

  const today = useMemo(() => Dates.todayKey(), [])

  // подхватываем сохранённый выбор «скрыть деньги» после гидратации (см. lib/hideMoney.ts)
  useEffect(() => { loadMoneyHidden(); forceHideRerender(n => n + 1) }, [])
  const toggleHideMoney = useCallback(() => { setMoneyHidden(!isMoneyHidden()); forceHideRerender(n => n + 1) }, [])

  const loadData = useCallback(async (sid: string) => {
    const qs = `?spaceId=${sid}`
    // курсы валют глобальные (не привязаны к spaceId) — грузятся отдельно ниже
    const [a, t, c, b, cr, tpl] = await Promise.all([
      fetch(`/api/finance/accounts${qs}`).then(r => r.json()),
      fetch(`/api/finance/txns${qs}`).then(r => r.json()),
      fetch(`/api/finance/categories${qs}`).then(r => r.json()),
      fetch(`/api/finance/budgets${qs}`).then(r => r.json()),
      fetch(`/api/finance/credits${qs}`).then(r => r.json()),
      fetch(`/api/finance/templates${qs}`).then(r => r.json()),
    ])
    setAccounts(Array.isArray(a) ? a : [])
    setTxns(Array.isArray(t) ? t : [])
    setCategories(Array.isArray(c) ? c : [])
    setBudgets(Array.isArray(b) ? b : [])
    setCredits(Array.isArray(cr) ? cr : [])
    setTemplates(Array.isArray(tpl) ? tpl : [])
  }, [])

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(me => setMyId(me?.userId ?? null)).catch(() => {})
    // курсы валют — глобальные, грузятся один раз, не зависят от активного кабинета
    fetch('/api/finance/settings').then(r => r.json()).then(s => setSettings(s && typeof s === 'object' ? s : { baseCurrency: '', rates: {} })).catch(() => {})
    fetch('/api/finance/spaces').then(r => r.json()).then(async (sp) => {
      const list: Space[] = Array.isArray(sp) ? sp : []
      setSpaces(list)
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('fin_space') : null
      const sid = list.find(s => s.id === saved)?.id ?? list[0]?.id ?? null
      setSpaceId(sid)
      if (sid) await loadData(sid)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [loadData])

  const switchSpace = useCallback(async (sid: string) => {
    if (sid === spaceId) return
    localStorage.setItem('fin_space', sid)
    setSpaceId(sid); setView({ name: 'list' }); setLoading(true)
    await loadData(sid)
    setLoading(false)
  }, [spaceId, loadData])

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2000) }, [])
  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])
  const spendable = useMemo(() => active.filter(a => a.type !== 'deposit'), [active])
  const patchAccount = (id: string, patch: Partial<Account>) => setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  const bump = (id: string, delta: number) => setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance: a.balance + delta } : a))

  const catInfo = useCallback((key: string): { emoji: string; label: string } => {
    if (key.startsWith('credit:')) return { emoji: '💳', label: 'Кредит/долг' }
    const c = categories.find(x => x.id === key)
    if (c) return { emoji: c.emoji, label: c.name }
    const b = categoryMeta(key)
    return { emoji: b.emoji, label: b.label }
  }, [categories])

  // ── кабинеты ──────────────────────────────────────────────────────────────
  const refreshSpaces = useCallback(async (): Promise<Space[]> => {
    const sp = await fetch('/api/finance/spaces').then(r => r.json()).catch(() => [])
    const list: Space[] = Array.isArray(sp) ? sp : []
    setSpaces(list)
    return list
  }, [])

  // переключиться на кабинет sid (или первый доступный) и перезагрузить данные
  const jumpToSpace = useCallback(async (preferred?: string) => {
    const list = await refreshSpaces()
    const sid = list.find(s => s.id === preferred)?.id ?? list[0]?.id ?? null
    setSpaceId(sid); setView({ name: 'list' })
    if (sid) {
      localStorage.setItem('fin_space', sid)
      setLoading(true); await loadData(sid); setLoading(false)
    }
  }, [refreshSpaces, loadData])

  const createSpace = useCallback(async (name: string, emoji: string) => {
    const res = await fetch('/api/finance/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, emoji }) })
    if (!res.ok) { showToast('Не удалось'); return }
    const { id } = await res.json()
    await jumpToSpace(id)
    showToast('Кабинет создан 🎉')
  }, [jumpToSpace, showToast])

  const renameSpace = useCallback(async (id: string, name: string) => {
    setSpaces(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    await fetch(`/api/finance/spaces/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    showToast('Сохранено')
  }, [showToast])

  const joinSpace = useCallback(async (code: string) => {
    const res = await fetch('/api/finance/spaces/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (!res.ok) { showToast(res.status === 404 ? 'Код не найден' : 'Не удалось'); return }
    const { id, name } = await res.json()
    await jumpToSpace(id)
    setModal(null)
    showToast(`Ты в кабинете «${name}» 🎉`)
  }, [jumpToSpace, showToast])

  // confirm() убран — в установленном PWA он не всплывает, кнопка выглядела нерабочей.
  // Подтверждение теперь двойным тапом прямо в SpaceSheet.
  const leaveSpace = useCallback(async (id: string) => {
    await fetch(`/api/finance/spaces/${id}/leave`, { method: 'POST' })
    setModal(null)
    await jumpToSpace()
    showToast('Ты вышел из кабинета')
  }, [jumpToSpace, showToast])

  const deleteSpace = useCallback(async (id: string) => {
    await fetch(`/api/finance/spaces/${id}`, { method: 'DELETE' })
    setModal(null)
    await jumpToSpace()
    showToast('Кабинет удалён')
  }, [jumpToSpace, showToast])

  // ── счета ─────────────────────────────────────────────────────────────────
  const saveAccount = useCallback(async (data: any, editing: Account | null, initialRate: { fromDate: string; rate: number } | null) => {
    if (editing) {
      patchAccount(editing.id, data)
      await fetch(`/api/finance/accounts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      showToast('Сохранено')
    } else {
      const res = await fetch('/api/finance/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, spaceId }) })
      const created: Account = await res.json()
      created.rates = created.rates || []
      if (initialRate && created.id) {
        const rr = await fetch('/api/finance/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: created.id, fromDate: initialRate.fromDate, rate: initialRate.rate }) })
        if (rr.ok) created.rates = [await rr.json()]
      }
      setAccounts(prev => [...prev, created])
      showToast('Счёт добавлен 💰')
    }
    setModal(null); setEditingAcc(null)
  }, [showToast, spaceId])

  const setBalance = useCallback(async (acc: Account, balance: number) => {
    patchAccount(acc.id, { balance })
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance }) })
    showToast('Баланс обновлён')
  }, [showToast])

  // пополнение депозита своими деньгами: тело += сумма
  const topUpDeposit = useCallback(async (acc: Account, amount: number) => {
    const principal = Math.round((acc.principal + amount) * 100) / 100
    patchAccount(acc.id, { principal })
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal }) })
    showToast('Депозит пополнен 💰')
  }, [showToast])

  // начислить проценты за месяц одним кликом: тело += тело × ставка/12.
  // startDate сбрасываем на сегодня, чтобы «набежавшая» оценка не задваивала уже начисленное.
  const accrueInterest = useCallback(async (acc: Account) => {
    const rate = depositValue(acc, today).currentRate
    if (rate == null || acc.principal <= 0) return
    const interest = Math.round((acc.principal * rate / 1200) * 100) / 100
    const principal = Math.round((acc.principal + interest) * 100) / 100
    patchAccount(acc.id, { principal, startDate: today })
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal, startDate: today }) })
    showToast(`+${fmt(interest, acc.currency)} процентов 📈`)
  }, [today, showToast])

  const addRate = useCallback(async (acc: Account, fromDate: string, rate: number) => {
    const res = await fetch('/api/finance/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: acc.id, fromDate, rate }) })
    if (!res.ok) { showToast('Не удалось'); return }
    const created: DepositRate = await res.json()
    patchAccount(acc.id, { rates: [...acc.rates, created].sort((a, b) => a.fromDate < b.fromDate ? -1 : 1) })
    showToast('Ставка добавлена')
  }, [showToast])

  const deleteRate = useCallback(async (acc: Account, rateId: string) => {
    patchAccount(acc.id, { rates: acc.rates.filter(r => r.id !== rateId) })
    await fetch(`/api/finance/rates/${rateId}`, { method: 'DELETE' })
  }, [])

  const archiveAccount = useCallback(async (acc: Account) => {
    patchAccount(acc.id, { archived: true })
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })
    showToast('Счёт скрыт 📦'); setView({ name: 'list' })
  }, [showToast])

  const deleteAccount = useCallback(async (acc: Account) => {
    setAccounts(prev => prev.filter(a => a.id !== acc.id))
    setTxns(prev => prev.filter(t => t.accountId !== acc.id && t.toAccountId !== acc.id))
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'DELETE' })
    setModal(null); setEditingAcc(null); setView({ name: 'list' }); showToast('Удалено')
  }, [showToast])

  // ── операции ──────────────────────────────────────────────────────────────
  const addOp = useCallback(async (data: { accountId: string; type: TxnType; amount: number; category: string; comment: string }) => {
    const res = await fetch('/api/finance/txns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { showToast('Не удалось'); return }
    const { txn, delta } = await res.json()
    setTxns(prev => [txn, ...prev]); bump(txn.accountId, delta); setModal(null)
    showToast(data.type === 'expense' ? 'Расход записан' : 'Доход записан')
  }, [showToast])

  const addTransfer = useCallback(async (data: { fromAccountId: string; toAccountId: string; amount: number; toAmount: number; comment: string }) => {
    const res = await fetch('/api/finance/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { showToast('Не удалось'); return }
    const txn: Txn = await res.json()
    setTxns(prev => [txn, ...prev])
    bump(data.fromAccountId, -data.amount); bump(data.toAccountId, data.toAmount)
    setModal(null); showToast('Перевод выполнен')
  }, [showToast])

  const deleteOp = useCallback(async (t: Txn) => {
    const res = await fetch(`/api/finance/txns/${t.id}`, { method: 'DELETE' })
    const r = await res.json()
    setTxns(prev => prev.filter(x => x.id !== t.id))
    if (r && Array.isArray(r.reverts)) r.reverts.forEach((rv: any) => bump(rv.accountId, rv.delta))
    if (r?.creditId) setCredits(prev => prev.map(c => c.id === r.creditId ? { ...c, remaining: c.remaining + Math.abs(t.amount), archived: false } : c))
  }, [])

  // редактирование расхода/дохода (не перевод) — сумма/категория/комментарий/дата
  const editOp = useCallback(async (t: Txn, patch: { amount: number; category: string; comment: string; day: string }) => {
    const res = await fetch(`/api/finance/txns/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (!res.ok) { showToast('Не удалось сохранить'); return }
    const { txn, balanceDelta } = await res.json()
    setTxns(prev => prev.map(x => x.id === t.id ? txn : x))
    if (balanceDelta) bump(t.accountId, balanceDelta)
    showToast('Операция изменена')
  }, [showToast])

  // ── настройки ───────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (baseCurrency: string, rates: Record<string, number>) => {
    setSettings({ baseCurrency, rates })
    await fetch('/api/finance/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseCurrency, rates }) })
    setModal(null); showToast('Курсы сохранены — теперь одинаковые во всех кабинетах')
  }, [showToast])

  const addCategory = useCallback(async (kind: 'expense' | 'income', name: string, emoji: string) => {
    const res = await fetch('/api/finance/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, kind, name, emoji }) })
    if (!res.ok) return
    const created = await res.json()
    setCategories(prev => [...prev, created])
  }, [spaceId])

  const deleteCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id))
    setBudgets(prev => prev.filter(b => b.categoryId !== id))
    await fetch(`/api/finance/categories/${id}`, { method: 'DELETE' })
  }, [])

  const editCategory = useCallback(async (id: string, name: string, emoji: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name, emoji } : c))
    await fetch(`/api/finance/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, emoji }) })
  }, [])

  // ── шаблоны операций (быстрые чипсы в форме «+ Новая операция») ─────────────
  const saveTemplateFn = useCallback(async (t: { kind: 'expense' | 'income'; name: string; accountId: string; category: string; amount: number; comment: string }) => {
    const res = await fetch('/api/finance/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, ...t }) })
    if (!res.ok) { showToast(res.status === 400 ? 'Достигнут лимит шаблонов (5)' : 'Не удалось сохранить шаблон'); return }
    const created: OpTemplate = await res.json()
    setTemplates(prev => [...prev, created])
    showToast('Шаблон сохранён')
  }, [spaceId, showToast])

  const deleteTemplateFn = useCallback(async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/finance/templates/${id}`, { method: 'DELETE' })
  }, [])

  const setBudget = useCallback(async (categoryId: string, amount: number) => {
    setBudgets(prev => {
      const rest = prev.filter(b => b.categoryId !== categoryId)
      return amount > 0 ? [...rest, { id: categoryId, categoryId, amount }] : rest
    })
    await fetch('/api/finance/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId, amount }) })
  }, [])

  // ── кредиты / долги / рассрочки ─────────────────────────────────────────────
  const patchCredit = (id: string, patch: Partial<Credit>) => setCredits(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const saveCredit = useCallback(async (data: any, editing: Credit | null) => {
    if (editing) {
      patchCredit(editing.id, data)
      await fetch(`/api/finance/credits/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      showToast('Сохранено')
    } else {
      const res = await fetch('/api/finance/credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, spaceId }) })
      if (!res.ok) { showToast('Не удалось'); return }
      const created: Credit = await res.json()
      setCredits(prev => [created, ...prev])
      showToast('Добавлено')
    }
    setModal(null); setEditingCredit(null)
  }, [showToast, spaceId])

  const deleteCreditFn = useCallback(async (c: Credit) => {
    setCredits(prev => prev.filter(x => x.id !== c.id))
    await fetch(`/api/finance/credits/${c.id}`, { method: 'DELETE' })
    setModal(null); setEditingCredit(null); setView({ name: 'credits' }); showToast('Удалено')
  }, [showToast])

  const closeCreditFn = useCallback(async (c: Credit) => {
    patchCredit(c.id, { archived: true })
    await fetch(`/api/finance/credits/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })
    showToast('Закрыто')
  }, [showToast])

  // платёж по кредиту/долгу: списывает/зачисляет на выбранный счёт и уменьшает остаток.
  // Если указан счёт — сервер также пишет связанную операцию в finance_txns (виднее в истории).
  const payCreditFn = useCallback(async (c: Credit, data: { accountId: string | null; amount: number; day: string; comment: string; advanceNextPayment: boolean }) => {
    const res = await fetch(`/api/finance/credits/${c.id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { showToast('Не удалось'); return }
    const { payment, credit, txn }: { payment: CreditPayment; credit: Credit; txn: Txn | null } = await res.json()
    patchCredit(c.id, { remaining: credit.remaining, archived: credit.archived, nextPaymentDate: credit.nextPaymentDate, payments: [payment, ...c.payments] })
    if (data.accountId) bump(data.accountId, c.direction === 'owe' ? -Math.abs(data.amount) : Math.abs(data.amount))
    if (txn) setTxns(prev => [txn, ...prev])
    setModal(null); setPayingCredit(null)
    showToast(credit.archived ? 'Оплачено полностью 🎉' : 'Платёж записан')
  }, [showToast])

  const deleteCreditPaymentFn = useCallback(async (c: Credit, p: CreditPayment) => {
    const res = await fetch(`/api/finance/credits/payments/${p.id}`, { method: 'DELETE' })
    if (!res.ok) return
    const r = await res.json()
    patchCredit(c.id, { remaining: c.remaining + Math.abs(p.amount), archived: false, payments: c.payments.filter(x => x.id !== p.id) })
    if (r.accountId && r.accountDelta) bump(r.accountId, r.accountDelta)
    if (r.txnId) setTxns(prev => prev.filter(t => t.id !== r.txnId))
  }, [])

  const detailAcc = view.name === 'detail' ? accounts.find(a => a.id === view.id) : null
  const detailCredit = view.name === 'credit-detail' ? credits.find(c => c.id === view.id) : null
  const openAccountSheet = (a: Account | null) => { setEditingAcc(a); setModal('account') }
  const openCreditSheet = (c: Credit | null) => { setEditingCredit(c); setModal('credit') }

  return (
    <div className="tk-root">
      {loading ? <FinanceSkeleton /> : (
        <main className="tk-view">
          {view.name === 'list' && (
            <SpaceBar spaces={spaces} spaceId={spaceId} onSwitch={switchSpace} onManage={() => setModal('space')} />
          )}
          {view.name === 'list' && (
            <ListView
              active={active} txns={txns} settings={settings} categories={categories} budgets={budgets} accounts={accounts} credits={credits}
              today={today} catInfo={catInfo}
              onOpenAccount={id => setView({ name: 'detail', id })}
              onAddAccount={() => openAccountSheet(null)}
              onOpenCredits={() => setView({ name: 'credits' })}
              onSettings={() => setModal('menu')}
              onDeleteOp={deleteOp} onEditOp={setEditingOp}
              moneyHidden={isMoneyHidden()} onToggleHideMoney={toggleHideMoney}
            />
          )}
          {view.name === 'detail' && detailAcc && (
            <DetailView
              acc={detailAcc} txns={txns.filter(t => t.accountId === detailAcc.id || t.toAccountId === detailAcc.id)} today={today} catInfo={catInfo}
              accountName={id => accounts.find(a => a.id === id)?.name ?? ''}
              onBack={() => setView({ name: 'list' })}
              onEdit={openAccountSheet} onArchive={archiveAccount} onSetBalance={setBalance}
              onAddRate={addRate} onDeleteRate={deleteRate} onDeleteOp={deleteOp} onEditOp={setEditingOp}
              onTopUp={topUpDeposit} onAccrue={accrueInterest}
            />
          )}
          {view.name === 'credits' && (
            <CreditsListView
              credits={credits} today={today}
              onOpen={id => setView({ name: 'credit-detail', id })}
              onAdd={() => openCreditSheet(null)}
              onBack={() => setView({ name: 'list' })}
            />
          )}
          {view.name === 'credit-detail' && detailCredit && (
            <CreditDetailView
              credit={detailCredit} accounts={spendable} today={today}
              onBack={() => setView({ name: 'credits' })}
              onEdit={openCreditSheet} onClose={closeCreditFn}
              onPay={() => { setPayingCredit(detailCredit); setModal('credit-pay') }}
              onDeletePayment={p => deleteCreditPaymentFn(detailCredit, p)}
              accountName={id => accounts.find(a => a.id === id)?.name ?? ''}
            />
          )}
        </main>
      )}

      {!loading && view.name === 'list' && active.length > 0 && (
        <button className="tk-fab" onClick={() => (spendable.length ? setModal('op') : openAccountSheet(null))} aria-label="Новая операция">+</button>
      )}
      {!loading && view.name === 'credits' && (
        <button className="tk-fab" onClick={() => openCreditSheet(null)} aria-label="Новый кредит или долг">+</button>
      )}

      {modal === 'account' && <AccountSheet editing={editingAcc} today={today} onClose={() => { setModal(null); setEditingAcc(null) }} onSave={saveAccount} onDelete={deleteAccount} />}
      {modal === 'op' && (
        <OperationSheet
          accounts={spendable} categories={categories} credits={credits} today={today} templates={templates}
          onClose={() => setModal(null)} onSave={addOp} onTransfer={addTransfer} onAddAccount={() => openAccountSheet(null)}
          onPayCredit={payCreditFn} onSaveTemplate={saveTemplateFn} onDeleteTemplate={deleteTemplateFn}
        />
      )}
      {modal === 'menu' && <SettingsMenu onClose={() => setModal(null)} onReports={() => setModal('reports')} onRates={() => setModal('rates')} onCats={() => setModal('cats')} onBudgets={() => setModal('budgets')} onSpaces={() => setModal('space')} onCredits={() => { setModal(null); setView({ name: 'credits' }) }} />}
      {modal === 'reports' && <ReportsSheet accounts={active} txns={txns} categories={categories} settings={settings} today={today} onClose={() => setModal('menu')} />}
      {editingOp && <EditOpSheet t={editingOp} categories={categories} onClose={() => setEditingOp(null)} onSave={patch => { editOp(editingOp, patch); setEditingOp(null) }} />}
      {modal === 'space' && (
        <SpaceSheet
          spaces={spaces} spaceId={spaceId} myId={myId}
          onClose={() => setModal(null)} onSwitch={id => { setModal(null); switchSpace(id) }}
          onCreate={createSpace} onRename={renameSpace} onJoin={joinSpace} onLeave={leaveSpace} onDelete={deleteSpace}
        />
      )}
      {modal === 'rates' && <RatesSheet settings={settings} onClose={() => setModal('menu')} onSave={saveSettings} />}
      {modal === 'cats' && <CategoriesSheet categories={categories} onClose={() => setModal('menu')} onAdd={addCategory} onDelete={deleteCategory} onEdit={editCategory} />}
      {modal === 'budgets' && <BudgetsSheet categories={categories} budgets={budgets} txns={txns} accounts={accounts} settings={settings} today={today} onClose={() => setModal('menu')} onSet={setBudget} />}
      {modal === 'credit' && <CreditSheet editing={editingCredit} today={today} onClose={() => { setModal(null); setEditingCredit(null) }} onSave={saveCredit} onDelete={deleteCreditFn} />}
      {modal === 'credit-pay' && payingCredit && (
        <PaymentSheet credit={payingCredit} accounts={spendable} today={today}
          onClose={() => { setModal(null); setPayingCredit(null) }}
          onSave={data => payCreditFn(payingCredit, data)} />
      )}
      {toast && <div className="tk-toast">{toast}</div>}
    </div>
  )
}

// ── Скелетон загрузки (повторяет раскладку списка) ───────────────────────────
function FinanceSkeleton() {
  return (
    <main className="tk-view" aria-busy="true">
      <div className="tk-skel-chips">
        <div className="tk-skel tk-skel-chip" style={{ width: 110 }} />
        <div className="tk-skel tk-skel-chip" style={{ width: 90 }} />
        <div className="tk-skel tk-skel-chip" style={{ width: 44 }} />
      </div>
      <div className="tk-skel-hero">
        <div className="tk-skel-main">
          <div className="tk-skel tk-skel-line" style={{ width: '35%' }} />
          <div className="tk-skel tk-skel-line" style={{ width: '55%', height: 22 }} />
        </div>
      </div>
      <div className="tk-list">
        {[0, 1, 2].map(i => (
          <div key={i} className="tk-skel-row">
            <div className="tk-skel tk-skel-avatar" />
            <div className="tk-skel-main">
              <div className="tk-skel tk-skel-line" style={{ width: `${55 - i * 8}%`, height: 14 }} />
              <div className="tk-skel tk-skel-line" style={{ width: `${30 + i * 7}%`, height: 10 }} />
            </div>
            <div className="tk-skel tk-skel-line" style={{ width: 70, height: 16 }} />
          </div>
        ))}
      </div>
      <div className="tk-skel tk-skel-line" style={{ width: 130, margin: '24px 4px 10px' }} />
      <div className="tk-list">
        {[0, 1].map(i => (
          <div key={i} className="tk-skel-row">
            <div className="tk-skel tk-skel-circle" />
            <div className="tk-skel-main">
              <div className="tk-skel tk-skel-line" style={{ width: `${45 - i * 10}%`, height: 12 }} />
            </div>
            <div className="tk-skel tk-skel-line" style={{ width: 56, height: 14 }} />
          </div>
        ))}
      </div>
    </main>
  )
}

// ── Список ───────────────────────────────────────────────────────────────────
function ListView({ active, txns, settings, categories, budgets, accounts, credits, today, catInfo, onOpenAccount, onAddAccount, onOpenCredits, onSettings, onDeleteOp, onEditOp, moneyHidden, onToggleHideMoney }: {
  active: Account[]; txns: Txn[]; settings: FinanceSettings; categories: Category[]; budgets: Budget[]; accounts: Account[]; credits: Credit[]
  today: string; catInfo: (k: string) => { emoji: string; label: string }
  onOpenAccount: (id: string) => void; onAddAccount: () => void; onOpenCredits: () => void; onSettings: () => void; onDeleteOp: (t: Txn) => void; onEditOp: (t: Txn) => void
  moneyHidden: boolean; onToggleHideMoney: () => void
}) {
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null)
  const gear = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={onToggleHideMoney} aria-label={moneyHidden ? 'Показать деньги' : 'Скрыть деньги'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tk-muted)', fontSize: 20, padding: 4 }}>{moneyHidden ? '🙈' : '👁'}</button>
      <button onClick={onSettings} aria-label="Настройки" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tk-muted)', fontSize: 22, padding: 4 }}>⚙</button>
    </div>
  )
  if (!active.length) {
    return (
      <>
        <div className="tk-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h1 className="tk-page-title">Финансы</h1>{gear}</div>
        <div className="tk-empty">
          <div className="tk-em">💰</div>
          <h3>Добавь свои счета</h3>
          <p>Наличные, карты, накопления, депозит — всё в одном месте. Сразу видно, сколько где денег.</p>
          <button className="tk-btn-primary" onClick={onAddAccount}>+ Добавить счёт</button>
        </div>
      </>
    )
  }

  const currencies = currenciesInUse(active)
  const multi = currencies.length > 1
  const realBase = settings.baseCurrency || currencies[0]
  const effBase = displayCurrency || realBase
  const effSettings: FinanceSettings = rebase({ baseCurrency: realBase, rates: settings.rates }, effBase)
  const byCur: Record<string, { total: number; free: number; deposits: number }> = {}
  for (const a of active) {
    const v = accountValue(a, today)
    const g = (byCur[a.currency] ??= { total: 0, free: 0, deposits: 0 })
    g.total += v; if (a.type === 'deposit') g.deposits += v; else g.free += v
  }
  const combined = combinedTotal(active, today, effSettings)
  const nameOf = (id: string) => active.find(a => a.id === id)?.name ?? accounts.find(a => a.id === id)?.name ?? ''
  const curOf = (id: string) => active.find(a => a.id === id)?.currency ?? ''
  const activeBudgets = budgets.map(b => ({ b, c: categories.find(c => c.id === b.categoryId) })).filter(x => x.c)

  return (
    <>
      <div className="tk-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 className="tk-page-title">Финансы</h1>{gear}
      </div>

      <div className="fin-total-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="tk-k">Всего ≈ (в {effBase})</div>
          <div className="tk-seg" style={{ transform: 'scale(0.88)', transformOrigin: 'right center' }}>
            {CURRENCIES.map(c => <button key={c} type="button" className={effBase === c ? 'tk-sel' : ''} onClick={() => setDisplayCurrency(c === realBase ? null : c)}>{c}</button>)}
          </div>
        </div>
        <div className="fin-big">≈ {fmt(combined.total, effBase)}</div>
        {combined.missing.length > 0 && (
          <div style={{ color: '#ffb454', fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>
            Нет курса для: {combined.missing.join(', ')} — открой ⚙ → Курсы валют
          </div>
        )}
        {!multi && byCur[currencies[0]].deposits > 0 ? (
          <div className="fin-total-split">
            <div><div className="lbl">💵 Свободные</div><div className="amt">{fmt(byCur[currencies[0]].free, currencies[0])}</div></div>
            <div><div className="lbl">📈 В депозитах</div><div className="amt">{fmt(byCur[currencies[0]].deposits, currencies[0])}</div></div>
          </div>
        ) : multi && (
          <div className="fin-total-split" style={{ flexWrap: 'wrap', gap: 14 }}>
            {currencies.map(c => <div key={c} style={{ minWidth: 90 }}><div className="lbl">{c}</div><div className="amt">{fmt(byCur[c].total, c)}</div></div>)}
          </div>
        )}
      </div>

      {activeBudgets.length > 0 && (
        <>
          <div className="tk-section-label">Бюджеты на месяц</div>
          <div className="tk-block">
            {activeBudgets.map(({ b, c }) => {
              const spent = categorySpend(b.categoryId, txns, accounts, effSettings, today)
              const limit = convert(b.amount, realBase, effSettings) ?? b.amount
              const pct = Math.min(100, Math.round(spent / limit * 100))
              const over = spent > limit
              return (
                <div key={b.id} style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                    <span>{c!.emoji} {c!.name}</span>
                    <span style={{ color: over ? 'var(--tk-danger)' : 'var(--tk-muted)', fontWeight: 700 }}>{fmt(spent, effBase)} / {fmt(limit, effBase)}</span>
                  </div>
                  <div className="tk-mini-track"><div className="tk-mini-fill" style={{ width: pct + '%', background: over ? 'var(--tk-danger)' : 'var(--tk-good)' }} /></div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {(() => {
        const activeCredits = credits.filter(c => !c.archived)
        if (!activeCredits.length) return null

        // «вы должны» / «вам должны» — переводим всё в effBase, чтобы не мешать валюты через « + »
        let oweSum = 0, owedSum = 0
        const oweMissing = new Set<string>(), owedMissing = new Set<string>()
        for (const c of activeCredits) {
          const conv = convert(c.remaining, c.currency, effSettings)
          if (c.direction === 'owe') { if (conv === null) oweMissing.add(c.currency); else oweSum += conv }
          else { if (conv === null) owedMissing.add(c.currency); else owedSum += conv }
        }

        // платежи, которые нужно внести в текущем месяце (включая просроченные с прошлых месяцев)
        const withMonthly = activeCredits.filter(c => c.monthlyPayment != null)
        const monthKey = today.slice(0, 7)
        const duePayments = withMonthly.filter(c => c.nextPaymentDate && c.nextPaymentDate.slice(0, 7) <= monthKey)
        let monthSum = 0
        const monthMissing = new Set<string>()
        for (const c of duePayments) {
          const conv = convert(c.monthlyPayment!, c.currency, effSettings)
          if (conv === null) monthMissing.add(c.currency); else monthSum += conv
        }

        return (
          <>
            <div className="tk-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Кредиты и долги</span>
              <button onClick={onOpenCredits} style={{ background: 'none', border: 'none', color: 'var(--tk-accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Все →</button>
            </div>
            <div className="tk-block" style={{ padding: '10px 16px' }}>
              {(oweSum > 0 || oweMissing.size > 0) && (
                <div className="fin-kv"><span className="k">Вы должны</span><span className="v" style={{ color: 'var(--tk-danger)' }}>{fmt(oweSum, effBase)}{oweMissing.size > 0 ? ` (нет курса: ${Array.from(oweMissing).join(', ')})` : ''}</span></div>
              )}
              {(owedSum > 0 || owedMissing.size > 0) && (
                <div className="fin-kv"><span className="k">Вам должны</span><span className="v" style={{ color: 'var(--tk-good)' }}>{fmt(owedSum, effBase)}{owedMissing.size > 0 ? ` (нет курса: ${Array.from(owedMissing).join(', ')})` : ''}</span></div>
              )}
              {withMonthly.length > 0 && (
                duePayments.length > 0 ? (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--tk-line)' }}>
                    <div className="fin-kv" style={{ marginBottom: 0 }}>
                      <span className="k">Платежи в этом месяце</span>
                      <span className="v" style={{ color: '#ffb454' }}>{fmt(monthSum, effBase)}{monthMissing.size > 0 ? ` (нет курса: ${Array.from(monthMissing).join(', ')})` : ''}</span>
                    </div>
                    <p className="tk-hint" style={{ marginTop: 4, marginBottom: 0 }}>{duePayments.map(c => c.name).join(', ')}</p>
                  </div>
                ) : (
                  <p className="tk-hint" style={{ color: 'var(--tk-good)', marginTop: 8, marginBottom: 0 }}>Все платежи в этом месяце закрыты 🎉</p>
                )
              )}
            </div>
          </>
        )
      })()}

      <div className="tk-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Счета</span>
        <button onClick={onAddAccount} style={{ background: 'none', border: 'none', color: 'var(--tk-accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ счёт</button>
      </div>
      <div className="tk-list">{active.map(a => <AccountRow key={a.id} a={a} today={today} effBase={effBase} effSettings={effSettings} onOpen={onOpenAccount} />)}</div>

      {txns.length > 0 && (
        <>
          <div className="tk-section-label">Последние операции</div>
          <div className="tk-block" style={{ padding: '6px 16px' }}>
            {txns.slice(0, 30).map(t => <OpRow key={t.id} t={t} info={catInfo(t.category)} fromName={nameOf(t.accountId)} toName={t.toAccountId ? nameOf(t.toAccountId) : ''} currency={curOf(t.accountId)} onDelete={onDeleteOp} onEdit={onEditOp} />)}
          </div>
        </>
      )}
    </>
  )
}

function AccountRow({ a, today, effBase, effSettings, onOpen }: { a: Account; today: string; effBase: string; effSettings: FinanceSettings; onOpen: (id: string) => void }) {
  const val = accountValue(a, today)
  const dep = a.type === 'deposit' ? depositValue(a, today) : null
  const converted = a.currency !== effBase ? convert(val, a.currency, effSettings) : null
  return (
    <div className="fin-acc" onClick={() => onOpen(a.id)}>
      <div className="emo" style={{ background: 'var(--tk-card-2)', color: ACCENT }}>{a.emoji}</div>
      <div className="mid">
        <div className="nm">{a.name}</div>
        <div className="sub"><span>{typeLabel(a.type)}</span>{dep && dep.currentRate != null && <span className="fin-chip rate">{dep.currentRate}%</span>}</div>
      </div>
      <div className="right">
        <div className="val">{fmt(val, a.currency)}</div>
        {converted != null && <div className="val-sub">≈ {fmt(converted, effBase)}</div>}
        {dep && dep.interest > 0 && <div className="val-sub">+{fmt(dep.interest, a.currency)}</div>}
      </div>
    </div>
  )
}

function OpRow({ t, info, fromName, toName, currency, onDelete, onEdit }: {
  t: Txn; info: { emoji: string; label: string }; fromName: string; toName: string; currency: string
  onDelete: (t: Txn) => void; onEdit?: (t: Txn) => void
}) {
  const isTransfer = t.type === 'transfer'
  const isCreditPayment = t.category.startsWith('credit:')
  const income = t.type === 'income'
  const emoji = isTransfer ? '🔄' : info.emoji
  const label = isTransfer ? 'Перевод' : info.label
  const sub = isTransfer ? `${fromName} → ${toName}` : fromName
  const color = isTransfer ? 'var(--tk-muted)' : (income ? 'var(--tk-good)' : 'var(--tk-text)')
  const sign = isTransfer ? '' : (income ? '+' : '−')
  const canEdit = !isTransfer && !isCreditPayment && !!onEdit
  return (
    <div className="fin-kv" style={{ gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--tk-card-2)', display: 'grid', placeItems: 'center', fontSize: 17, flex: '0 0 auto' }}>{emoji}</div>
      <div
        style={{ flex: 1, minWidth: 0, cursor: canEdit ? 'pointer' : 'default' }}
        onClick={() => canEdit && onEdit!(t)}
      >
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</div>
        <div style={{ color: 'var(--tk-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}{t.comment ? ` · ${t.comment}` : ''} · {Dates.humanShort(t.day)}{t.authorName ? ` · ${t.authorName}` : ''}
        </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color, whiteSpace: 'nowrap' }}>{sign}{fmt(t.amount, currency)}</div>
      <button onClick={() => onDelete(t)} aria-label="Удалить" style={{ background: 'none', border: 'none', color: 'var(--tk-faint)', cursor: 'pointer', fontSize: 15, padding: 4 }}>✕</button>
    </div>
  )
}

// ── Шторка редактирования операции (расход/доход) ─────────────────────────────────
function EditOpSheet({ t, categories, onClose, onSave }: {
  t: Txn; categories: Category[]; onClose: () => void; onSave: (patch: { amount: number; category: string; comment: string; day: string }) => void
}) {
  const [amount, setAmount] = useState(String(t.amount))
  const [category, setCategory] = useState(t.category)
  const [comment, setComment] = useState(t.comment)
  const [day, setDay] = useState(t.day)
  const [submitting, setSubmitting] = useState(false)
  const cats = categories.filter(c => c.kind === (t.type === 'income' ? 'income' : 'expense'))
  const [err, setErr] = useState('')

  const submit = () => {
    if (submitting) return
    if (!(parseMoney(amount) > 0)) { setErr('Введите сумму больше нуля'); return }
    setErr('')
    setSubmitting(true)
    onSave({ amount: parseMoney(amount), category, comment: comment.trim(), day })
  }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Изменить {t.type === 'income' ? 'доход' : 'расход'}</h2>
        <div className="tk-field">
          <label>Сумма</label>
          <input className="tk-input" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }} />
        </div>
        <div className="tk-field">
          <label>Категория</label>
          <div className="tk-emoji-picker">
            {cats.map(c => (
              <button key={c.id} type="button" className={`tk-emoji-opt ${category === c.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => setCategory(c.id)}>
                <span style={{ fontSize: 17 }}>{c.emoji}</span>{c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="tk-field"><label>Дата</label><input className="tk-input" type="date" value={day} onChange={e => setDay(e.target.value)} /></div>
        <div className="tk-field"><label>Комментарий</label><input className="tk-input" maxLength={100} value={comment} onChange={e => setComment(e.target.value)} /></div>
        {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" disabled={submitting} style={{ opacity: submitting ? .5 : 1 }} onClick={submit}>
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  )
}

// ── Детали счёта ──────────────────────────────────────────────────────────────
function DetailView({ acc, txns, today, catInfo, accountName, onBack, onEdit, onArchive, onSetBalance, onAddRate, onDeleteRate, onDeleteOp, onEditOp, onTopUp, onAccrue }: {
  acc: Account; txns: Txn[]; today: string; catInfo: (k: string) => { emoji: string; label: string }; accountName: (id: string) => string
  onBack: () => void; onEdit: (a: Account) => void; onArchive: (a: Account) => void; onSetBalance: (a: Account, b: number) => void
  onAddRate: (a: Account, fromDate: string, rate: number) => void; onDeleteRate: (a: Account, rateId: string) => void; onDeleteOp: (t: Txn) => void; onEditOp: (t: Txn) => void
  onTopUp: (a: Account, amount: number) => void; onAccrue: (a: Account) => void
}) {
  const isDeposit = acc.type === 'deposit'
  const dep = isDeposit ? depositValue(acc, today) : null
  const val = accountValue(acc, today)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceStr, setBalanceStr] = useState(String(acc.balance))
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [topUpStr, setTopUpStr] = useState('')
  const [newRate, setNewRate] = useState('')
  const [newRateDate, setNewRateDate] = useState(today)
  const sortedRates = [...acc.rates].sort((a, b) => a.fromDate < b.fromDate ? -1 : 1)
  const currentRateId = (() => { let id: string | null = null; for (const r of sortedRates) if (r.fromDate <= today) id = r.id; return id })()
  const effNow = dep?.currentRate != null ? effectiveRate(dep.currentRate, acc.capitalization) : null
  const monthInterest = dep?.currentRate != null && acc.principal > 0 ? Math.round((acc.principal * dep.currentRate / 1200) * 100) / 100 : 0

  return (
    <>
      <button className="tk-back" onClick={onBack}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Назад</button>
      <div className="tk-detail-hero">
        <div className="tk-emoji" style={{ background: 'var(--tk-card-2)', color: ACCENT }}>{acc.emoji}</div>
        <div><h1>{acc.name}</h1><div className="tk-sub">{typeLabel(acc.type)} · {acc.currency}</div></div>
      </div>

      <div className="tk-block">
        <div style={{ color: 'var(--tk-muted)', fontSize: 13, fontWeight: 600 }}>{isDeposit ? 'Сейчас на депозите' : 'Баланс'}</div>
        <div className="fin-hero-amount">{fmt(val, acc.currency)}</div>
        {dep && dep.interest > 0 && <div className="fin-hero-note">+{fmt(dep.interest, acc.currency)} процентами</div>}
        {!isDeposit && (editingBalance ? (
          <div className="fin-add-rate" style={{ marginTop: 14 }}>
            <input className="tk-input" inputMode="decimal" autoFocus value={balanceStr} onChange={e => setBalanceStr(e.target.value)} />
            <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={() => { onSetBalance(acc, parseMoney(balanceStr)); setEditingBalance(false) }}>ОК</button>
          </div>
        ) : (
          <button className="tk-btn-ghost" style={{ marginTop: 14 }} onClick={() => { setBalanceStr(String(acc.balance)); setEditingBalance(true) }}>Изменить баланс вручную</button>
        ))}
      </div>

      {isDeposit && (
        <>
          <div className="tk-block">
            <div className="fin-kv"><span className="k">Тело депозита</span><span className="v">{fmt(acc.principal, acc.currency)}</span></div>
            <div className="fin-kv"><span className="k">Проценты идут с</span><span className="v">{acc.startDate ? Dates.human(acc.startDate) : '—'}</span></div>
            <div className="fin-kv"><span className="k">Ставка сейчас</span><span className="v" style={{ color: 'var(--tk-good)' }}>{dep?.currentRate != null ? dep.currentRate + '%' : '—'}</span></div>
            <div className="fin-kv"><span className="k">Капитализация</span><span className="v">{acc.capitalization === 'monthly' ? 'ежемесячная' : 'нет'}</span></div>
            {effNow != null && acc.capitalization === 'monthly' && <div className="fin-kv"><span className="k">Эффективно годовых</span><span className="v" style={{ color: 'var(--tk-good)' }}>≈ {effNow.toFixed(1)}%</span></div>}
            <div className="fin-kv"><span className="k">Набежало (оценка)</span><span className="v" style={{ color: 'var(--tk-good)' }}>+{fmt(dep?.interest ?? 0, acc.currency)}</span></div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {topUpOpen ? (
                <div className="fin-add-rate">
                  <input className="tk-input" inputMode="decimal" autoFocus placeholder={`Сумма, ${acc.currency}`} value={topUpStr} onChange={e => setTopUpStr(e.target.value)} />
                  <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={() => { const v = parseMoney(topUpStr); if (v > 0) { onTopUp(acc, v); setTopUpStr(''); setTopUpOpen(false) } }}>ОК</button>
                </div>
              ) : (
                <button className="tk-btn-ghost" onClick={() => setTopUpOpen(true)}>➕ Пополнить депозит</button>
              )}
              {monthInterest > 0 && (
                <button className="tk-btn-ghost" onClick={() => onAccrue(acc)}>📈 Начислить % за месяц (+{fmt(monthInterest, acc.currency)})</button>
              )}
            </div>
            {monthInterest > 0 && <p className="tk-hint" style={{ marginTop: 8 }}>Проценты за месяц = тело × ставка ÷ 12. После начисления «набежало» считается заново с сегодняшнего дня.</p>}
          </div>
          <div className="tk-block">
            <h3>Ставки по датам</h3>
            <p className="tk-hint">Банк поменял ставку — просто добавь её с даты. Сумма пересчитается сама.</p>
            {sortedRates.length === 0 && <p className="tk-hint">Пока нет ставок. Добавь первую ниже.</p>}
            {sortedRates.map(r => (
              <div key={r.id} className={`fin-rate-row ${r.id === currentRateId ? 'current' : ''}`}>
                <span className="rr-date">с {Dates.humanShort(r.fromDate)}{r.id === currentRateId ? ' · сейчас' : ''}</span>
                <span className="rr-rate">{r.rate}%</span>
                <button className="rr-del" onClick={() => onDeleteRate(acc, r.id)} aria-label="Удалить">✕</button>
              </div>
            ))}
            <div className="fin-add-rate">
              <input className="tk-input" type="date" value={newRateDate} max={today} onChange={e => setNewRateDate(e.target.value)} />
              <input className="tk-input" inputMode="decimal" placeholder="%" style={{ maxWidth: 90 }} value={newRate} onChange={e => setNewRate(e.target.value)} />
              <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={() => { const v = parseMoney(newRate); if (v > 0 && newRateDate) { onAddRate(acc, newRateDate, v); setNewRate('') } }}>+</button>
            </div>
          </div>
        </>
      )}

      <div className="tk-block" style={{ padding: '6px 16px' }}>
        <div style={{ padding: '10px 0 4px', color: 'var(--tk-faint)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>История операций{txns.length ? ` · ${txns.length}` : ''}</div>
        {txns.length > 0
          ? txns.map(t => <OpRow key={t.id} t={t} info={catInfo(t.category)} fromName={accountName(t.accountId)} toName={t.toAccountId ? accountName(t.toAccountId) : ''} currency={acc.currency} onDelete={onDeleteOp} onEdit={onEditOp} />)
          : <p className="tk-hint" style={{ padding: '4px 0 10px' }}>Пока нет операций по этому счёту. {isDeposit ? 'Пополнения и переводы появятся здесь.' : 'Добавь операцию через «+».'}</p>}
      </div>

      <div className="tk-sheet-actions" style={{ marginTop: 8 }}>
        <button className="tk-btn-ghost" onClick={() => onEdit(acc)}>✏️ Изменить счёт</button>
        <button className="tk-btn-ghost" onClick={() => onArchive(acc)}>📦 Скрыть счёт (сохранить историю)</button>
      </div>
    </>
  )
}

// ── Быстрая операция ────────────────────────────────────────────────────────────
function OperationSheet({ accounts, categories, credits, today, templates, onClose, onSave, onTransfer, onAddAccount, onPayCredit, onSaveTemplate, onDeleteTemplate }: {
  accounts: Account[]; categories: Category[]; credits: Credit[]; today: string; templates: OpTemplate[]
  onClose: () => void
  onSave: (d: { accountId: string; type: TxnType; amount: number; category: string; comment: string }) => void
  onTransfer: (d: { fromAccountId: string; toAccountId: string; amount: number; toAmount: number; comment: string }) => void
  onAddAccount: () => void
  onPayCredit: (c: Credit, d: { accountId: string | null; amount: number; day: string; comment: string; advanceNextPayment: boolean }) => void
  onSaveTemplate: (t: { kind: 'expense' | 'income'; name: string; accountId: string; category: string; amount: number; comment: string }) => void
  onDeleteTemplate: (id: string) => void
}) {
  const [type, setType] = useState<TxnType | 'credit'>('expense')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [toId, setToId] = useState(accounts[1]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const activeCredits = credits.filter(c => !c.archived)
  const [creditId, setCreditId] = useState('')
  const selectedCredit = activeCredits.find(c => c.id === creditId)
  const creditMatching = selectedCredit ? accounts.filter(a => a.currency === selectedCredit.currency) : []
  const creditPickList = creditMatching.length ? creditMatching : accounts
  const [creditAccountId, setCreditAccountId] = useState<string | null>(null)

  const cats = categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'))
  const from = accounts.find(a => a.id === accountId)
  const to = accounts.find(a => a.id === toId)
  const isTransfer = type === 'transfer'
  const isCredit = type === 'credit'
  const crossCur = isTransfer && from && to && from.currency !== to.currency

  const selectCredit = (c: Credit) => {
    setCreditId(c.id)
    const def = c.monthlyPayment ?? c.remaining
    setAmount(def > 0 ? String(def) : '')
    const matching = accounts.filter(a => a.currency === c.currency)
    setCreditAccountId((matching.length ? matching : accounts)[0]?.id ?? null)
  }

  const templatesOfType = templates.filter(t => t.kind === type)
  const applyTemplate = (t: OpTemplate) => {
    setAccountId(accounts.some(a => a.id === t.accountId) ? t.accountId : accounts[0]?.id ?? '')
    setCategory(t.category)
    setAmount(String(t.amount))
    setComment(t.comment)
  }
  const canSaveTemplate = (type === 'expense' || type === 'income') && !!accountId && parseMoney(amount) > 0 && templatesOfType.length < 5

  // защита от двойной отправки — повторные тапы до ответа сервера дублировали операцию
  const submit = () => {
    if (submitting) return
    if (isCredit) {
      if (!selectedCredit) { setErr('Выбери кредит или долг'); return }
      if (!(parseMoney(amount) > 0)) { setErr('Введите сумму платежа'); return }
    } else if (isTransfer) {
      if (!accountId || !toId) { setErr('Выбери, откуда и куда переводить'); return }
      if (accountId === toId) { setErr('Счета отправления и получения должны отличаться'); return }
      if (!(parseMoney(amount) > 0)) { setErr('Введите сумму перевода'); return }
      if (crossCur && !(parseMoney(toAmount) > 0)) { setErr('Введите сумму зачисления в валюте получателя'); return }
    } else {
      if (!accountId) { setErr('Выбери счёт'); return }
      if (!(parseMoney(amount) > 0)) { setErr('Введите сумму больше нуля'); return }
    }
    setErr('')
    setSubmitting(true)
    if (isCredit) {
      const amt = parseMoney(amount)
      const isMonthly = selectedCredit!.monthlyPayment != null && Math.abs(amt - selectedCredit!.monthlyPayment) < 0.005
      const isFull = amt >= selectedCredit!.remaining - 0.005
      onPayCredit(selectedCredit!, { accountId: creditAccountId, amount: amt, day: today, comment: comment.trim(), advanceNextPayment: isMonthly && !isFull })
    } else if (isTransfer) {
      onTransfer({ fromAccountId: accountId, toAccountId: toId, amount: parseMoney(amount), toAmount: crossCur ? parseMoney(toAmount) : parseMoney(amount), comment: comment.trim() })
    } else {
      onSave({ accountId, type: type as TxnType, amount: parseMoney(amount), category: category || (cats[0]?.id ?? ''), comment: comment.trim() })
    }
  }

  const accountPicker = (value: string, set: (id: string) => void, exclude?: string) => (
    <div className="tk-emoji-picker">
      {accounts.filter(a => a.id !== exclude).map(a => (
        <button key={a.id} type="button" className={`tk-emoji-opt ${value === a.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => set(a.id)}>
          <span style={{ fontSize: 17 }}>{a.emoji}</span>{a.name}
        </button>
      ))}
    </div>
  )

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Новая операция</h2>

        <div className="tk-field">
          <div className="tk-seg">
            <button type="button" className={type === 'expense' ? 'tk-sel' : ''} onClick={() => { setType('expense'); setCategory('') }}>Расход</button>
            <button type="button" className={type === 'income' ? 'tk-sel' : ''} onClick={() => { setType('income'); setCategory('') }}>Доход</button>
            <button type="button" className={type === 'transfer' ? 'tk-sel' : ''} onClick={() => setType('transfer')}>Перевод</button>
            <button type="button" className={type === 'credit' ? 'tk-sel' : ''} onClick={() => setType('credit')}>Кредит</button>
          </div>
        </div>

        {!accounts.length ? (
          <div className="tk-field"><p className="tk-hint">Сначала добавь счёт.</p><button className="tk-btn-primary" onClick={onAddAccount}>+ Добавить счёт</button></div>
        ) : isCredit ? (
          !activeCredits.length ? (
            <div className="tk-field"><p className="tk-hint">Нет активных кредитов или долгов. Добавь через ⚙ → Кредиты и долги.</p></div>
          ) : (
            <>
              <div className="tk-field">
                <label>Какой</label>
                <div className="tk-emoji-picker">
                  {activeCredits.map(c => (
                    <button key={c.id} type="button" className={`tk-emoji-opt ${creditId === c.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => selectCredit(c)}>
                      💳 {c.name} · {fmt(c.remaining, c.currency)}
                    </button>
                  ))}
                </div>
              </div>
              {selectedCredit && (
                <>
                  <div className="tk-field">
                    <label>Сумма ({selectedCredit.currency})</label>
                    <input className="tk-input" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center' }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {selectedCredit.monthlyPayment != null && (
                        <button type="button" className="tk-emoji-opt" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => setAmount(String(selectedCredit.monthlyPayment))}>
                          Платёж {fmt(selectedCredit.monthlyPayment, selectedCredit.currency)}
                        </button>
                      )}
                      <button type="button" className="tk-emoji-opt" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => setAmount(String(selectedCredit.remaining))}>
                        Закрыть полностью {fmt(selectedCredit.remaining, selectedCredit.currency)}
                      </button>
                    </div>
                  </div>
                  <div className="tk-field">
                    <label>{selectedCredit.direction === 'owe' ? 'Списать со счёта' : 'Зачислить на счёт'}</label>
                    <div className="tk-emoji-picker">
                      <button type="button" className={`tk-emoji-opt ${creditAccountId === null ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', fontSize: 14, fontWeight: 600 }} onClick={() => setCreditAccountId(null)}>Без счёта</button>
                      {creditPickList.map(a => (
                        <button key={a.id} type="button" className={`tk-emoji-opt ${creditAccountId === a.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => setCreditAccountId(a.id)}>
                          <span style={{ fontSize: 17 }}>{a.emoji}</span>{a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="tk-field"><label>Комментарий (необязательно)</label><input className="tk-input" maxLength={100} value={comment} onChange={e => setComment(e.target.value)} /></div>
                </>
              )}
            </>
          )
        ) : isTransfer ? (
          <>
            <div className="tk-field"><label>Откуда</label>{accountPicker(accountId, setAccountId, toId)}</div>
            <div className="tk-field"><label>Куда</label>{accountPicker(toId, setToId, accountId)}</div>
            <div className="tk-field">
              <label>Сумма{from ? `, ${from.currency}` : ''}</label>
              <input className="tk-input" inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center' }} />
            </div>
            {crossCur && (
              <div className="tk-field">
                <label>Сколько зачислить, {to!.currency}</label>
                <input className="tk-input" inputMode="decimal" placeholder="0" value={toAmount} onChange={e => setToAmount(e.target.value)} style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
              </div>
            )}
            <div className="tk-field"><label>Комментарий (необязательно)</label><input className="tk-input" maxLength={100} value={comment} onChange={e => setComment(e.target.value)} /></div>
          </>
        ) : (
          <>
            {templatesOfType.length > 0 && (
              <div className="tk-field">
                <label>Шаблоны</label>
                <div className="tk-emoji-picker">
                  {templatesOfType.map(t => (
                    <button key={t.id} type="button" className="tk-emoji-opt" style={{ width: 'auto', padding: '0 6px 0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => applyTemplate(t)}>
                      {t.name}
                      <span
                        role="button" aria-label={`Удалить шаблон «${t.name}»`}
                        onClick={e => { e.stopPropagation(); onDeleteTemplate(t.id) }}
                        style={{ color: 'var(--tk-faint)', padding: '4px 6px', fontSize: 13 }}
                      >✕</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="tk-field"><label>{type === 'expense' ? 'Откуда' : 'Куда'}</label>{accountPicker(accountId, setAccountId)}</div>
            <div className="tk-field">
              <label>Сколько{from ? `, ${from.currency}` : ''}</label>
              <input className="tk-input" inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center' }} />
            </div>
            <div className="tk-field">
              <label>Категория</label>
              <div className="tk-emoji-picker">
                {cats.map(c => (
                  <button key={c.id} type="button" className={`tk-emoji-opt ${category === c.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => setCategory(c.id)}>
                    <span style={{ fontSize: 17 }}>{c.emoji}</span>{c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="tk-field"><label>Комментарий (необязательно)</label><input className="tk-input" maxLength={100} placeholder="Например: продукты на неделю" value={comment} onChange={e => setComment(e.target.value)} /></div>

            {savingTemplate ? (
              <div className="tk-field">
                <label>Название шаблона</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="tk-input" autoFocus maxLength={30} placeholder="Например: Такси" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={!templateName.trim()} onClick={() => {
                    onSaveTemplate({ kind: type as 'expense' | 'income', name: templateName.trim(), accountId, category: category || (cats[0]?.id ?? ''), amount: parseMoney(amount), comment: comment.trim() })
                    setSavingTemplate(false); setTemplateName('')
                  }}>✓</button>
                  <button type="button" className="tk-btn-ghost" style={{ width: 'auto', padding: '0 16px' }} onClick={() => { setSavingTemplate(false); setTemplateName('') }}>✕</button>
                </div>
              </div>
            ) : canSaveTemplate && (
              <button type="button" onClick={() => setSavingTemplate(true)} className="tk-hint" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tk-accent)', textAlign: 'left', padding: 0, marginTop: -8, marginBottom: 8 }}>
                ☆ Сохранить как шаблон
              </button>
            )}
          </>
        )}

        {accounts.length > 0 && !(isCredit && !activeCredits.length) && (
          <>
            {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
            <div className="tk-sheet-actions">
              <button className="tk-btn-primary" disabled={submitting} style={{ opacity: submitting ? .5 : 1 }} onClick={submit}>
                {submitting ? 'Сохраняем…' : isCredit ? 'Записать платёж' : isTransfer ? 'Перевести' : type === 'expense' ? 'Записать расход' : 'Записать доход'}
              </button>
              <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Меню настроек ────────────────────────────────────────────────────────────────
function SettingsMenu({ onClose, onReports, onRates, onCats, onBudgets, onSpaces, onCredits }: { onClose: () => void; onReports: () => void; onRates: () => void; onCats: () => void; onBudgets: () => void; onSpaces: () => void; onCredits: () => void }) {
  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Настройки</h2>
        <div className="tk-sheet-actions">
          <button className="tk-btn-ghost" onClick={onCredits}>💳 Кредиты и долги</button>
          <button className="tk-btn-ghost" onClick={onReports}>📊 Тенденции и отчёты</button>
          <button className="tk-btn-ghost" onClick={onSpaces}>👥 Кабинеты и доступ</button>
          <button className="tk-btn-ghost" onClick={onRates}>💱 Курсы валют</button>
          <button className="tk-btn-ghost" onClick={onCats}>🏷 Категории</button>
          <button className="tk-btn-ghost" onClick={onBudgets}>🎯 Бюджеты на месяц</button>
          <button className="tk-btn-ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

// ── Кабинеты: панель переключения ────────────────────────────────────────────────
function SpaceBar({ spaces, spaceId, onSwitch, onManage }: {
  spaces: Space[]; spaceId: string | null; onSwitch: (id: string) => void; onManage: () => void
}) {
  if (!spaces.length) return null
  const chip = (active: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', flex: '0 0 auto',
    padding: '8px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 700,
    background: active ? 'var(--tk-accent)' : 'var(--tk-card)',
    color: active ? '#fff' : 'var(--tk-muted)',
    border: `1px solid ${active ? 'var(--tk-accent)' : 'var(--tk-line)'}`,
  })
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
      {spaces.map(s => (
        <button key={s.id} style={chip(s.id === spaceId)} onClick={() => onSwitch(s.id)}>
          <span>{s.emoji}</span>{s.name}{s.members.length > 1 && <span style={{ opacity: .7, fontWeight: 600 }}>· {s.members.length}</span>}
        </button>
      ))}
      <button style={chip(false)} onClick={onManage} aria-label="Кабинеты и доступ">👥 ⋯</button>
    </div>
  )
}

// ── Кабинеты: управление и доступ ────────────────────────────────────────────────
const SPACE_EMOJIS = ['👤', '👨‍👩‍👧', '💼', '🏢', '💰', '✈️', '🏠', '🎯']

function SpaceSheet({ spaces, spaceId, myId, onClose, onSwitch, onCreate, onRename, onJoin, onLeave, onDelete }: {
  spaces: Space[]; spaceId: string | null; myId: string | null
  onClose: () => void; onSwitch: (id: string) => void
  onCreate: (name: string, emoji: string) => void; onRename: (id: string, name: string) => void
  onJoin: (code: string) => void; onLeave: (id: string) => void; onDelete: (id: string) => void
}) {
  const cur = spaces.find(s => s.id === spaceId) ?? null
  const isOwner = !!(cur && myId && cur.ownerId === myId)
  const [name, setName] = useState(cur?.name ?? '')
  const [code, setCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('💼')
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joinErr, setJoinErr] = useState('')
  const [createErr, setCreateErr] = useState('')

  const copyCode = () => {
    if (!cur) return
    navigator.clipboard?.writeText(cur.shareCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Кабинеты</h2>
        <p className="tk-hint">Отдельные пространства финансов: личный, семейный бюджет, бизнес. У каждого — свои счета, операции, категории и курсы. Кабинет можно вести вдвоём: поделись кодом доступа.</p>

        <div className="tk-block" style={{ padding: '6px 16px' }}>
          {spaces.map(s => (
            <div key={s.id} className="fin-kv" style={{ gap: 10, cursor: 'pointer' }} onClick={() => onSwitch(s.id)}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: s.id === spaceId ? 800 : 500 }}>
                {s.emoji} {s.name}
                <span style={{ color: 'var(--tk-muted)', fontSize: 12, marginLeft: 8 }}>{s.members.map(m => '@' + m.username).join(', ')}</span>
              </span>
              {s.id === spaceId && <span style={{ color: 'var(--tk-good)', fontWeight: 800 }}>✓</span>}
            </div>
          ))}
        </div>

        {cur && (
          <>
            <div className="tk-field">
              <label>Название кабинета «{cur.emoji} {cur.name}»</label>
              <div className="fin-add-rate">
                <input className="tk-input" maxLength={30} value={name} onChange={e => setName(e.target.value)} />
                <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={() => { if (name.trim() && name.trim() !== cur.name) onRename(cur.id, name.trim()) }}>ОК</button>
              </div>
            </div>
            <div className="tk-field">
              <label>Доступ для семьи</label>
              <div className="fin-add-rate">
                <input className="tk-input" readOnly value={cur.shareCode} style={{ letterSpacing: 3, fontWeight: 800, textAlign: 'center' }} />
                <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={copyCode}>{copied ? '✓' : 'Копировать'}</button>
              </div>
              <p className="tk-hint" style={{ marginTop: 8, marginBottom: 0 }}>Отправь код — на своём телефоне человек вводит его ниже в «Подключиться по коду» и получает полный доступ к этому кабинету.</p>
            </div>
          </>
        )}

        <div className="tk-field">
          <label>Подключиться по коду</label>
          <div className="fin-add-rate">
            <input className="tk-input" placeholder="Код кабинета" value={code} onChange={e => setCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
            <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={() => { if (code.trim()) { setJoinErr(''); onJoin(code) } else setJoinErr('Введите код кабинета') }}>Войти</button>
          </div>
          {joinErr && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{joinErr}</p>}
        </div>

        <div className="tk-field">
          <label>Новый кабинет</label>
          <div className="tk-emoji-picker" style={{ marginBottom: 10 }}>
            {SPACE_EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === newEmoji ? 'tk-sel' : ''}`} onClick={() => setNewEmoji(e)}>{e}</button>)}
          </div>
          <div className="fin-add-rate">
            <input className="tk-input" maxLength={30} placeholder="Например: Бизнес" value={newName} onChange={e => setNewName(e.target.value)} />
            <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={creating}
              onClick={() => { if (creating) return; if (newName.trim()) { setCreateErr(''); setCreating(true); onCreate(newName.trim(), newEmoji); setNewName('') } else setCreateErr('Введите название кабинета') }}>
              {creating ? '…' : 'Создать'}
            </button>
          </div>
          {createErr && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{createErr}</p>}
        </div>

        <div className="tk-sheet-actions">
          {cur && !isOwner && (
            <button className="tk-btn-ghost" onClick={() => confirmLeave ? onLeave(cur.id) : setConfirmLeave(true)}>
              {confirmLeave ? 'Точно выйти? Нажми ещё раз' : `🚪 Выйти из «${cur.name}»`}
            </button>
          )}
          {cur && isOwner && spaces.length > 1 && (
            <button className="tk-btn-ghost tk-btn-danger" onClick={() => confirmDelete ? onDelete(cur.id) : setConfirmDelete(true)}>
              {confirmDelete ? 'Точно удалить? Нажми ещё раз' : `🗑 Удалить «${cur.name}» навсегда`}
            </button>
          )}
          <button className="tk-btn-ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

// ── Категории ────────────────────────────────────────────────────────────────────
function CategoriesSheet({ categories, onClose, onAdd, onDelete, onEdit }: {
  categories: Category[]; onClose: () => void; onAdd: (kind: 'expense' | 'income', name: string, emoji: string) => void; onDelete: (id: string) => void
  onEdit: (id: string, name: string, emoji: string) => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🍔')
  const [err, setErr] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const list = categories.filter(c => c.kind === kind)

  const startEdit = (c: Category) => { setEditingId(c.id); setEditName(c.name); setEditEmoji(c.emoji) }
  const saveEdit = () => { if (editName.trim() && editingId) { onEdit(editingId, editName.trim(), editEmoji); setEditingId(null) } }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Категории</h2>
        <div className="tk-field">
          <div className="tk-seg">
            <button type="button" className={kind === 'expense' ? 'tk-sel' : ''} onClick={() => { setKind('expense'); setEditingId(null) }}>Расходы</button>
            <button type="button" className={kind === 'income' ? 'tk-sel' : ''} onClick={() => { setKind('income'); setEditingId(null) }}>Доходы</button>
          </div>
        </div>

        <div className="tk-block" style={{ padding: '4px 16px' }}>
          {list.map(c => editingId === c.id ? (
            <div key={c.id} style={{ padding: '10px 0' }}>
              <div className="tk-emoji-picker" style={{ marginBottom: 8, maxHeight: 100, overflowY: 'auto' }}>
                {CAT_EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === editEmoji ? 'tk-sel' : ''}`} onClick={() => setEditEmoji(e)}>{e}</button>)}
              </div>
              <div className="fin-add-rate">
                <input className="tk-input" value={editName} onChange={e => setEditName(e.target.value)} maxLength={24} autoFocus />
                <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 14px' }} onClick={saveEdit}>✓</button>
                <button className="tk-btn-ghost" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setEditingId(null)}>✕</button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="fin-kv">
              <span style={{ fontSize: 15, cursor: 'pointer', flex: 1 }} onClick={() => startEdit(c)}>{c.emoji} {c.name}</span>
              <button onClick={() => onDelete(c.id)} aria-label="Удалить" style={{ background: 'none', border: 'none', color: 'var(--tk-faint)', cursor: 'pointer', fontSize: 15 }}>✕</button>
            </div>
          ))}
          {list.length === 0 && <p className="tk-hint" style={{ padding: '10px 0' }}>Нет категорий. Добавь ниже.</p>}
        </div>

        <div className="tk-field">
          <label>Новая категория</label>
          <div className="tk-emoji-picker" style={{ marginBottom: 10, maxHeight: 120, overflowY: 'auto' }}>
            {CAT_EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === emoji ? 'tk-sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}
          </div>
          <div className="fin-add-rate">
            <input className="tk-input" placeholder="Название" value={name} onChange={e => setName(e.target.value)} maxLength={24} />
            <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={() => { if (name.trim()) { setErr(''); onAdd(kind, name.trim(), emoji); setName('') } else setErr('Введите название категории') }}>Добавить</button>
          </div>
          {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
        </div>

        <div className="tk-sheet-actions"><button className="tk-btn-ghost" onClick={onClose}>Готово</button></div>
      </div>
    </div>
  )
}

// ── Бюджеты ──────────────────────────────────────────────────────────────────────
function BudgetsSheet({ categories, budgets, txns, accounts, settings, today, onClose, onSet }: {
  categories: Category[]; budgets: Budget[]; txns: Txn[]; accounts: Account[]; settings: FinanceSettings; today: string
  onClose: () => void; onSet: (categoryId: string, amount: number) => void
}) {
  const base = settings.baseCurrency || currenciesInUse(accounts.filter(a => !a.archived))[0] || '₸'
  const effSettings: FinanceSettings = { baseCurrency: base, rates: settings.rates }
  const expense = categories.filter(c => c.kind === 'expense')
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const b of budgets) o[b.categoryId] = String(b.amount)
    return o
  })

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Бюджеты на месяц</h2>
        <p className="tk-hint">Лимит на категорию в месяц (в {base}). Пусто или 0 — без лимита.</p>
        <div className="tk-block" style={{ padding: '4px 16px' }}>
          {expense.map(c => {
            const spent = categorySpend(c.id, txns, accounts, effSettings, today)
            return (
              <div key={c.id} className="fin-kv" style={{ gap: 10 }}>
                <span style={{ flex: 1, fontSize: 14.5 }}>{c.emoji} {c.name}<br /><span style={{ color: 'var(--tk-muted)', fontSize: 11.5 }}>потрачено {fmt(spent, base)}</span></span>
                <input className="tk-input" inputMode="decimal" placeholder="—" style={{ maxWidth: 110, textAlign: 'right' }}
                  value={vals[c.id] ?? ''} onChange={e => setVals(p => ({ ...p, [c.id]: e.target.value }))}
                  onBlur={() => onSet(c.id, parseMoney(vals[c.id] ?? ''))} />
              </div>
            )
          })}
          {expense.length === 0 && <p className="tk-hint" style={{ padding: '10px 0' }}>Нет категорий расходов.</p>}
        </div>
        <div className="tk-sheet-actions"><button className="tk-btn-primary" onClick={onClose}>Готово</button></div>
      </div>
    </div>
  )
}

// ── Форма счёта ────────────────────────────────────────────────────────────────
function AccountSheet({ editing, today, onClose, onSave, onDelete }: {
  editing: Account | null; today: string
  onClose: () => void
  onSave: (data: any, editing: Account | null, initialRate: { fromDate: string; rate: number } | null) => void
  onDelete: (a: Account) => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState<Account['type']>(editing?.type ?? 'cash')
  const [currency, setCurrency] = useState(editing?.currency ?? '₸')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '💵')
  const color = editing?.color ?? ACCENT
  const [balanceStr, setBalanceStr] = useState(editing ? String(editing.balance) : '')
  const [principalStr, setPrincipalStr] = useState(editing ? String(editing.principal) : '')
  const [startDate, setStartDate] = useState(editing?.startDate ?? today)
  const [capitalization, setCapitalization] = useState<'monthly' | 'none'>(editing?.capitalization ?? 'monthly')
  const [rateStr, setRateStr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')

  const pickType = (t: Account['type']) => { setType(t); const def = ACCOUNT_TYPES.find(x => x.value === t); if (def && (!editing || emoji === '💵')) setEmoji(def.emoji) }
  const eff = parseMoney(rateStr) > 0 ? effectiveRate(parseMoney(rateStr), capitalization) : null

  // защита от двойной отправки: повторные тапы по «Добавить счёт» до ответа сервера
  // раньше создавали несколько одинаковых счетов
  const submit = () => {
    if (submitting) return
    if (!name.trim()) { setErr('Введите название счёта'); return }
    if (type === 'deposit' && !(parseMoney(principalStr) > 0)) { setErr('Укажите тело депозита'); return }
    setErr('')
    setSubmitting(true)
    const data: any = { name: name.trim(), type, currency, emoji, color }
    if (type === 'deposit') { data.principal = parseMoney(principalStr); data.startDate = startDate; data.capitalization = capitalization; data.balance = 0 }
    else data.balance = parseMoney(balanceStr)
    const initialRate = (!editing && type === 'deposit' && parseMoney(rateStr) > 0) ? { fromDate: startDate, rate: parseMoney(rateStr) } : null
    onSave(data, editing, initialRate)
  }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>{editing ? 'Изменить счёт' : 'Новый счёт'}</h2>
        <div className="tk-field"><label>Название</label><input className="tk-input" maxLength={40} placeholder="Например: Kaspi Депозит" value={name} onChange={e => setName(e.target.value)} /></div>

        <div className="tk-field">
          <label>Тип</label>
          <div className="tk-emoji-picker">
            {ACCOUNT_TYPES.map(t => (
              <button key={t.value} type="button" className={`tk-emoji-opt ${type === t.value ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => pickType(t.value)}>
                <span style={{ fontSize: 18 }}>{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tk-field"><label>Валюта</label><div className="tk-seg">{CURRENCIES.map(c => <button key={c} type="button" className={currency === c ? 'tk-sel' : ''} onClick={() => setCurrency(c)}>{c}</button>)}</div></div>

        {type === 'deposit' ? (
          <>
            <div className="tk-field"><label>Тело депозита ({currency})</label><input className="tk-input" inputMode="decimal" placeholder="1 000 000" value={principalStr} onChange={e => setPrincipalStr(e.target.value)} /></div>
            <div className="tk-field"><label>Дата открытия</label><input className="tk-input" type="date" value={startDate} max={today} onChange={e => setStartDate(e.target.value)} /></div>
            <div className="tk-field"><label>Капитализация процентов</label><div className="tk-seg"><button type="button" className={capitalization === 'monthly' ? 'tk-sel' : ''} onClick={() => setCapitalization('monthly')}>Ежемесячная</button><button type="button" className={capitalization === 'none' ? 'tk-sel' : ''} onClick={() => setCapitalization('none')}>Нет</button></div></div>
            {!editing && (
              <div className="tk-field">
                <label>Ставка сейчас, % годовых</label>
                <input className="tk-input" inputMode="decimal" placeholder="18" value={rateStr} onChange={e => setRateStr(e.target.value)} />
                {eff != null && capitalization === 'monthly' && <p className="tk-hint" style={{ marginTop: 8, marginBottom: 0 }}>С капитализацией это ≈ <b style={{ color: 'var(--tk-good)' }}>{eff.toFixed(1)}% годовых</b>. Если банк называет годовую доходность — введи её и выбери «Нет».</p>}
              </div>
            )}
          </>
        ) : (
          <div className="tk-field"><label>Текущий баланс ({currency})</label><input className="tk-input" inputMode="decimal" placeholder="250 000" value={balanceStr} onChange={e => setBalanceStr(e.target.value)} /></div>
        )}

        <div className="tk-field"><label>Иконка</label><div className="tk-emoji-picker">{EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === emoji ? 'tk-sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}</div></div>

        {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" onClick={submit} disabled={submitting} style={{ opacity: submitting ? .6 : 1 }}>
            {submitting ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить счёт'}
          </button>
          {editing
            ? <button className="tk-btn-ghost tk-btn-danger" onClick={() => confirmDel ? onDelete(editing) : setConfirmDel(true)}>
                {confirmDel ? 'Точно удалить? Нажми ещё раз' : '🗑 Удалить навсегда'}
              </button>
            : <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>}
        </div>
      </div>
    </div>
  )
}

// ── Курсы валют ────────────────────────────────────────────────────────────────
function RatesSheet({ settings, onClose, onSave }: { settings: FinanceSettings; onClose: () => void; onSave: (base: string, rates: Record<string, number>) => void }) {
  const [base, setBase] = useState(settings.baseCurrency || '₸')
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const c of CURRENCIES) if (settings.rates?.[c]) o[c] = String(settings.rates[c])
    return o
  })
  const others = CURRENCIES.filter(c => c !== base)
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState('')
  const submit = () => {
    const out: Record<string, number> = {}
    for (const c of others) { const v = Number(String(rates[c] ?? '').replace(',', '.')); if (v > 0) out[c] = v }
    onSave(base, out)
  }
  const autoFetch = async () => {
    setFetching(true); setFetchErr('')
    try {
      const res = await fetch(`/api/finance/rates/fetch?base=${encodeURIComponent(base)}`)
      const data = await res.json()
      if (!res.ok) { setFetchErr(data.error === 'unsupported base currency' ? 'Эта валюта не поддерживается' : 'Не удалось получить курсы — попробуй позже'); return }
      setRates(prev => {
        const next = { ...prev }
        for (const [c, v] of Object.entries<number>(data.rates)) next[c] = String(v)
        return next
      })
    } catch {
      setFetchErr('Нет сети — не удалось получить курсы')
    } finally {
      setFetching(false)
    }
  }
  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Курсы валют</h2>
        <p className="tk-hint">Одни курсы на все твои кабинеты. Выбери основную валюту и укажи, сколько она стоит для остальных — или обнови автоматически.</p>
        <div className="tk-field"><label>Основная валюта</label><div className="tk-seg">{CURRENCIES.map(c => <button key={c} type="button" className={base === c ? 'tk-sel' : ''} onClick={() => setBase(c)}>{c}</button>)}</div></div>

        <button type="button" onClick={autoFetch} disabled={fetching} className="tk-btn-ghost" style={{ marginBottom: 18, opacity: fetching ? .6 : 1 }}>
          {fetching ? 'Обновляем…' : '🔄 Обновить курсы автоматически'}
        </button>
        {fetchErr && <p className="tk-hint" style={{ color: 'var(--tk-danger)', marginTop: -12 }}>{fetchErr}</p>}

        {others.map(c => (
          <div className="tk-field" key={c}><label>1 {c} = сколько {base}?</label><input className="tk-input" inputMode="decimal" placeholder="Например: 5.4" value={rates[c] ?? ''} onChange={e => setRates(prev => ({ ...prev, [c]: e.target.value }))} /></div>
        ))}
        <div className="tk-sheet-actions"><button className="tk-btn-primary" onClick={submit}>Сохранить курсы</button><button className="tk-btn-ghost" onClick={onClose}>Отмена</button></div>
      </div>
    </div>
  )
}

// ── Тенденции / отчёты ───────────────────────────────────────────────────────────
function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')
  return m === 1 ? `${s} ${String(y).slice(2)}` : s
}
function monthLabelFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}
function formatShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + 'M'
  if (a >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(Math.round(n))
}

type RepTab = 'expense' | 'income' | 'money'

function ReportsSheet({ accounts, txns, categories, settings, today, onClose }: {
  accounts: Account[]; txns: Txn[]; categories: Category[]; settings: FinanceSettings; today: string; onClose: () => void
}) {
  const [tab, setTab] = useState<RepTab>('expense')
  const [cat, setCat] = useState('') // '' = все категории

  const base = settings.baseCurrency || currenciesInUse(accounts)[0] || '₸'
  const eff = useMemo<FinanceSettings>(() => ({ baseCurrency: base, rates: settings.rates }), [base, settings.rates])
  const curOf = useCallback((id: string) => accounts.find(a => a.id === id)?.currency ?? base, [accounts, base])
  const toBase = useCallback((amt: number, accId: string) => convert(amt, curOf(accId), eff) ?? amt, [curOf, eff])

  const months = useMemo(() => {
    const cur = today.slice(0, 7)
    let earliest = cur
    for (const t of txns) { const mk = t.day.slice(0, 7); if (mk < earliest) earliest = mk }
    const all: string[] = []
    let m = earliest
    let guard = 0
    while (m <= cur && guard < 120) { all.push(m); m = addMonth(m, 1); guard++ }
    return all.slice(-12)
  }, [txns, today])

  const flowData = useMemo(() => {
    if (tab === 'money') return []
    const map: Record<string, number> = Object.fromEntries(months.map(mk => [mk, 0]))
    for (const t of txns) {
      if (t.type !== tab) continue
      if (cat && t.category !== cat) continue
      const mk = t.day.slice(0, 7)
      if (mk in map) map[mk] += toBase(t.amount, t.accountId)
    }
    return months.map(mk => ({ month: mk, value: map[mk] }))
  }, [tab, cat, months, txns, toBase])

  // деньги по месяцам: от текущего итога назад, вычитая чистый поток каждого месяца (оценка)
  const moneyData = useMemo(() => {
    const net: Record<string, number> = Object.fromEntries(months.map(mk => [mk, 0]))
    for (const t of txns) {
      const mk = t.day.slice(0, 7)
      if (!(mk in net)) continue
      if (t.type === 'income') net[mk] += toBase(t.amount, t.accountId)
      else if (t.type === 'expense') net[mk] -= toBase(t.amount, t.accountId)
    }
    const currentTotal = combinedTotal(accounts, today, eff).total
    const end: Record<string, number> = {}
    let running = currentTotal
    for (let i = months.length - 1; i >= 0; i--) { end[months[i]] = running; running -= net[months[i]] || 0 }
    return months.map(mk => ({ month: mk, value: end[mk] }))
  }, [months, txns, toBase, accounts, today, eff])

  const data = tab === 'money' ? moneyData : flowData
  const catList = categories.filter(c => c.kind === (tab === 'income' ? 'income' : 'expense'))
  const total = flowData.reduce((s, d) => s + d.value, 0)
  const nonEmpty = flowData.filter(d => d.value > 0).length
  const avg = nonEmpty ? total / nonEmpty : 0
  const color = tab === 'expense' ? 'var(--tk-danger)' : tab === 'income' ? 'var(--tk-good)' : 'var(--tk-accent)'

  const chip = (active: boolean): CSSProperties => ({
    flex: '0 0 auto', whiteSpace: 'nowrap', cursor: 'pointer', padding: '7px 13px', borderRadius: 999,
    fontSize: 13, fontWeight: 700, background: active ? 'var(--tk-accent)' : 'var(--tk-card)',
    color: active ? '#fff' : 'var(--tk-muted)', border: `1px solid ${active ? 'var(--tk-accent)' : 'var(--tk-line)'}`,
  })

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card" style={{ maxHeight: '92vh' }}>
        <div className="tk-sheet-grab" />
        <h2>Тенденции</h2>

        <div className="tk-field">
          <div className="tk-seg">
            <button type="button" className={tab === 'expense' ? 'tk-sel' : ''} onClick={() => { setTab('expense'); setCat('') }}>Расходы</button>
            <button type="button" className={tab === 'income' ? 'tk-sel' : ''} onClick={() => { setTab('income'); setCat('') }}>Доходы</button>
            <button type="button" className={tab === 'money' ? 'tk-sel' : ''} onClick={() => setTab('money')}>Деньги</button>
          </div>
        </div>

        {tab !== 'money' && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, margin: '-2px 0 6px' }}>
            <button style={chip(cat === '')} onClick={() => setCat('')}>Все</button>
            {catList.map(c => <button key={c.id} style={chip(cat === c.id)} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>)}
          </div>
        )}

        {tab !== 'money' ? (
          <>
            <div style={{ display: 'flex', gap: 14, margin: '2px 2px 14px' }}>
              <div><div style={{ color: 'var(--tk-muted)', fontSize: 12, fontWeight: 600 }}>Всего за период</div><div style={{ fontSize: 20, fontWeight: 800, color }}>{fmt(total, base)}</div></div>
              <div><div style={{ color: 'var(--tk-muted)', fontSize: 12, fontWeight: 600 }}>В среднем / мес</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(avg, base)}</div></div>
            </div>
            <MonthBars data={data} color={color} base={base} />
          </>
        ) : (
          <>
            <p className="tk-hint" style={{ marginTop: 0 }}>Сколько денег на всех счетах было в конце каждого месяца (в {base}). Оценка по операциям — ручные правки баланса и рост депозитов в прошлом не учитываются.</p>
            <MoneyTrend data={moneyData} base={base} />
          </>
        )}

        {data.every(d => d.value === 0) && <p className="tk-hint" style={{ textAlign: 'center', padding: '20px 0' }}>Пока нет данных за этот период.</p>}

        <div className="tk-sheet-actions" style={{ marginTop: 10 }}><button className="tk-btn-ghost" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  )
}

function MonthBars({ data, color, base }: { data: { month: string; value: number }[]; color: string; base: string }) {
  const [sel, setSel] = useState(data.length - 1)
  const max = Math.max(1, ...data.map(d => d.value))
  const cur = data[Math.min(sel, data.length - 1)]
  return (
    <div>
      {cur && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 2px' }}>
          <span style={{ color: 'var(--tk-muted)', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabelFull(cur.month)}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color }}>{fmt(cur.value, base)}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'flex-end', paddingBottom: 4 }}>
        {data.map((d, i) => (
          <button key={d.month} onClick={() => setSel(i)} style={{
            flex: '1 0 auto', minWidth: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tk-faint)', height: 13 }}>{d.value > 0 ? formatShort(d.value) : ''}</span>
            <span style={{ width: '100%', maxWidth: 30, height: 108, display: 'flex', alignItems: 'flex-end', background: 'var(--tk-card-2)', borderRadius: 7 }}>
              <span style={{ width: '100%', height: `${Math.max(d.value > 0 ? 6 : 0, (d.value / max) * 100)}%`, background: color, borderRadius: 7, opacity: i === sel ? 1 : 0.55, transition: 'opacity .15s, height .3s ease' }} />
            </span>
            <span style={{ fontSize: 10.5, fontWeight: i === sel ? 800 : 600, color: i === sel ? 'var(--tk-text)' : 'var(--tk-faint)', textTransform: 'capitalize' }}>{monthLabel(d.month)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function MoneyTrend({ data, base }: { data: { month: string; value: number }[]; base: string }) {
  const [sel, setSel] = useState(data.length - 1)
  const vals = data.map(d => d.value)
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0)
  const span = (max - min) || 1
  const H = 150, pad = 22
  const stepX = 46
  const W = Math.max((data.length - 1) * stepX + pad * 2, 280)
  const x = (i: number) => pad + i * ((W - 2 * pad) / Math.max(1, data.length - 1))
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`
  const cur = data[Math.min(sel, data.length - 1)]
  const first = data[0]?.value ?? 0
  const change = cur ? cur.value - first : 0

  return (
    <div>
      {cur && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, padding: '0 2px' }}>
          <span style={{ color: 'var(--tk-muted)', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabelFull(cur.month)}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tk-accent)' }}>{fmt(cur.value, base)}</span>
        </div>
      )}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="fin-money-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tk-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--tk-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#fin-money-grad)" />
          <path d={line} fill="none" stroke="var(--tk-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.month} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <circle cx={x(i)} cy={y(d.value)} r={i === sel ? 6 : 4} fill={i === sel ? 'var(--tk-accent)' : 'var(--tk-bg)'} stroke="var(--tk-accent)" strokeWidth="2.5" />
              <rect x={x(i) - stepX / 2} y="0" width={stepX} height={H} fill="transparent" />
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight={i === sel ? 800 : 600} fill={i === sel ? 'var(--tk-text)' : 'var(--tk-faint)'} style={{ textTransform: 'capitalize' }}>{monthLabel(d.month)}</text>
            </g>
          ))}
        </svg>
      </div>
      {data.length > 1 && (
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 12.5, color: 'var(--tk-muted)' }}>
          За период: <b style={{ color: change >= 0 ? 'var(--tk-good)' : 'var(--tk-danger)' }}>{change >= 0 ? '+' : '−'}{fmt(Math.abs(change), base)}</b>
        </div>
      )}
    </div>
  )
}

// ── Кредиты / долги / рассрочки ───────────────────────────────────────────────
function creditKindLabel(k: CreditKind): string {
  return k === 'credit' ? 'Кредит' : k === 'installment' ? 'Рассрочка' : 'Долг'
}
function creditEmoji(c: Credit): string {
  if (c.kind === 'credit') return '🏦'
  if (c.kind === 'installment') return '🛍'
  return c.direction === 'owed' ? '🤲' : '🤝'
}

function CreditRow({ c, today, onOpen }: { c: Credit; today: string; onOpen: (id: string) => void }) {
  const pct = c.principal > 0 ? Math.min(100, Math.round((1 - c.remaining / c.principal) * 100)) : 0
  const overdue = !c.archived && !!c.nextPaymentDate && c.nextPaymentDate <= today
  return (
    <div className="fin-acc" onClick={() => onOpen(c.id)}>
      <div className="emo" style={{ background: 'var(--tk-card-2)', color: ACCENT }}>{creditEmoji(c)}</div>
      <div className="mid">
        <div className="nm">{c.name}</div>
        <div className="sub">
          <span>{creditKindLabel(c.kind)}{c.direction === 'owed' ? ' · вам должны' : ''}</span>
          {c.archived && <span className="fin-chip rate">закрыт</span>}
          {overdue && <span className="fin-chip rate" style={{ color: '#ffb454' }}>платёж просрочен</span>}
        </div>
      </div>
      <div className="right">
        <div className="val">{fmt(c.remaining, c.currency)}</div>
        {c.principal > 0 && !c.archived && <div className="val-sub">{pct}% погашено</div>}
      </div>
    </div>
  )
}

function CreditsListView({ credits, today, onOpen, onAdd, onBack }: {
  credits: Credit[]; today: string; onOpen: (id: string) => void; onAdd: () => void; onBack: () => void
}) {
  const active = credits.filter(c => !c.archived)
  const closed = credits.filter(c => c.archived)
  return (
    <>
      <button className="tk-back" onClick={onBack}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Назад</button>
      <div className="tk-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="tk-page-title">Кредиты и долги</h1>
      </div>
      {!credits.length ? (
        <div className="tk-empty">
          <div className="tk-em">💳</div>
          <h3>Добавь кредит или долг</h3>
          <p>Кредиты, рассрочки, кто должен тебе или ты кому-то — всё под контролем, ежемесячный платёж оплачивается в один тап.</p>
          <button className="tk-btn-primary" onClick={onAdd}>+ Добавить</button>
        </div>
      ) : (
        <>
          <div className="tk-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Активные</span>
            <button onClick={onAdd} style={{ background: 'none', border: 'none', color: 'var(--tk-accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ добавить</button>
          </div>
          {active.length > 0
            ? <div className="tk-list">{active.map(c => <CreditRow key={c.id} c={c} today={today} onOpen={onOpen} />)}</div>
            : <p className="tk-hint" style={{ padding: '4px 0 10px' }}>Нет активных кредитов и долгов.</p>}
          {closed.length > 0 && (
            <>
              <div className="tk-section-label">Закрытые</div>
              <div className="tk-list">{closed.map(c => <CreditRow key={c.id} c={c} today={today} onOpen={onOpen} />)}</div>
            </>
          )}
        </>
      )}
    </>
  )
}

function CreditDetailView({ credit, accounts, today, onBack, onEdit, onClose, onPay, onDeletePayment, accountName }: {
  credit: Credit; accounts: Account[]; today: string
  onBack: () => void; onEdit: (c: Credit) => void; onClose: (c: Credit) => void
  onPay: () => void; onDeletePayment: (p: CreditPayment) => void
  accountName: (id: string) => string
}) {
  const pct = credit.principal > 0 ? Math.min(100, Math.round((1 - credit.remaining / credit.principal) * 100)) : 0
  const overdue = !credit.archived && !!credit.nextPaymentDate && credit.nextPaymentDate <= today

  return (
    <>
      <button className="tk-back" onClick={onBack}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Назад</button>
      <div className="tk-detail-hero">
        <div className="tk-emoji" style={{ background: 'var(--tk-card-2)', color: ACCENT }}>{creditEmoji(credit)}</div>
        <div><h1>{credit.name}</h1><div className="tk-sub">{creditKindLabel(credit.kind)}{credit.counterparty ? ` · ${credit.counterparty}` : ''} · {credit.currency}</div></div>
      </div>

      <div className="tk-block">
        <div style={{ color: 'var(--tk-muted)', fontSize: 13, fontWeight: 600 }}>{credit.direction === 'owe' ? 'Осталось заплатить' : 'Осталось получить'}</div>
        <div className="fin-hero-amount">{fmt(credit.remaining, credit.currency)}</div>
        {credit.principal > 0 && (
          <>
            <div className="tk-mini-track" style={{ marginTop: 10 }}><div className="tk-mini-fill" style={{ width: pct + '%', background: 'var(--tk-good)' }} /></div>
            <p className="tk-hint" style={{ marginTop: 6, marginBottom: 0 }}>{pct}% от {fmt(credit.principal, credit.currency)} погашено</p>
          </>
        )}
        {!credit.archived
          ? <button className="tk-btn-primary" style={{ marginTop: 14 }} onClick={onPay}>💸 {credit.direction === 'owe' ? 'Оплатить' : 'Записать поступление'}</button>
          : <p className="tk-hint" style={{ color: 'var(--tk-good)', marginTop: 10, marginBottom: 0 }}>✓ Закрыто</p>}
      </div>

      <div className="tk-block">
        {credit.rate != null && <div className="fin-kv"><span className="k">Ставка</span><span className="v">{credit.rate}% годовых</span></div>}
        {credit.monthlyPayment != null && <div className="fin-kv"><span className="k">Ежемесячный платёж</span><span className="v">{fmt(credit.monthlyPayment, credit.currency)}</span></div>}
        {credit.nextPaymentDate && <div className="fin-kv"><span className="k">Следующий платёж</span><span className="v" style={{ color: overdue ? 'var(--tk-danger)' : undefined }}>{Dates.human(credit.nextPaymentDate)}{overdue ? ' · просрочен' : ''}</span></div>}
        {credit.startDate && <div className="fin-kv"><span className="k">Открыт</span><span className="v">{Dates.human(credit.startDate)}</span></div>}
        {credit.dueDate && <div className="fin-kv"><span className="k">Срок погашения</span><span className="v">{Dates.human(credit.dueDate)}</span></div>}
        {credit.comment && <div className="fin-kv"><span className="k">Заметка</span><span className="v">{credit.comment}</span></div>}
      </div>

      <div className="tk-block" style={{ padding: '6px 16px' }}>
        <div style={{ padding: '10px 0 4px', color: 'var(--tk-faint)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>История платежей{credit.payments.length ? ` · ${credit.payments.length}` : ''}</div>
        {credit.payments.length > 0
          ? credit.payments.map(p => (
              <div key={p.id} className="fin-kv" style={{ gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--tk-card-2)', display: 'grid', placeItems: 'center', fontSize: 17, flex: '0 0 auto' }}>💸</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{fmt(p.amount, credit.currency)}</div>
                  <div style={{ color: 'var(--tk-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.accountId ? accountName(p.accountId) : 'без счёта'}{p.comment ? ` · ${p.comment}` : ''} · {Dates.humanShort(p.day)}{p.authorName ? ` · ${p.authorName}` : ''}
                  </div>
                </div>
                <button onClick={() => onDeletePayment(p)} aria-label="Удалить" style={{ background: 'none', border: 'none', color: 'var(--tk-faint)', cursor: 'pointer', fontSize: 15, padding: 4 }}>✕</button>
              </div>
            ))
          : <p className="tk-hint" style={{ padding: '4px 0 10px' }}>Пока нет платежей.</p>}
      </div>

      <div className="tk-sheet-actions" style={{ marginTop: 8 }}>
        <button className="tk-btn-ghost" onClick={() => onEdit(credit)}>✏️ Изменить</button>
        {!credit.archived && <button className="tk-btn-ghost" onClick={() => onClose(credit)}>✓ Закрыть вручную</button>}
      </div>
    </>
  )
}

function CreditSheet({ editing, today, onClose, onSave, onDelete }: {
  editing: Credit | null; today: string
  onClose: () => void
  onSave: (data: any, editing: Credit | null) => void
  onDelete: (c: Credit) => void
}) {
  const [kind, setKind] = useState<CreditKind>(editing?.kind ?? 'credit')
  const [direction, setDirection] = useState<CreditDirection>(editing?.direction ?? 'owe')
  const [name, setName] = useState(editing?.name ?? '')
  const [counterparty, setCounterparty] = useState(editing?.counterparty ?? '')
  const [currency, setCurrency] = useState(editing?.currency ?? '₸')
  const [principalStr, setPrincipalStr] = useState(editing ? String(editing.principal) : '')
  const [remainingStr, setRemainingStr] = useState(editing ? String(editing.remaining) : '')
  const [rateStr, setRateStr] = useState(editing?.rate != null ? String(editing.rate) : '')
  const [monthlyStr, setMonthlyStr] = useState(editing?.monthlyPayment != null ? String(editing.monthlyPayment) : '')
  const [startDate, setStartDate] = useState(editing?.startDate ?? today)
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '')
  const [nextPaymentDate, setNextPaymentDate] = useState(editing?.nextPaymentDate ?? '')
  const [comment, setComment] = useState(editing?.comment ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')

  const submit = () => {
    if (submitting) return
    if (!name.trim()) { setErr('Введите название'); return }
    const principal = parseMoney(principalStr)
    if (!(principal > 0)) { setErr('Укажите сумму'); return }
    setErr('')
    setSubmitting(true)
    const data: any = {
      kind, direction: kind === 'debt' ? direction : 'owe',
      name: name.trim(), counterparty: counterparty.trim(), currency,
      principal,
      remaining: remainingStr.trim() ? parseMoney(remainingStr) : principal,
      rate: rateStr.trim() ? parseMoney(rateStr) : null,
      monthlyPayment: monthlyStr.trim() ? parseMoney(monthlyStr) : null,
      startDate: startDate || null, dueDate: dueDate || null,
      nextPaymentDate: nextPaymentDate || null,
      comment: comment.trim(),
    }
    onSave(data, editing)
  }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>{editing ? 'Изменить' : 'Новый кредит / долг'}</h2>

        <div className="tk-field">
          <label>Тип</label>
          <div className="tk-seg">
            <button type="button" className={kind === 'credit' ? 'tk-sel' : ''} onClick={() => setKind('credit')}>Кредит</button>
            <button type="button" className={kind === 'installment' ? 'tk-sel' : ''} onClick={() => setKind('installment')}>Рассрочка</button>
            <button type="button" className={kind === 'debt' ? 'tk-sel' : ''} onClick={() => setKind('debt')}>Долг</button>
          </div>
        </div>

        {kind === 'debt' && (
          <div className="tk-field">
            <label>Направление</label>
            <div className="tk-seg">
              <button type="button" className={direction === 'owe' ? 'tk-sel' : ''} onClick={() => setDirection('owe')}>Я должен</button>
              <button type="button" className={direction === 'owed' ? 'tk-sel' : ''} onClick={() => setDirection('owed')}>Мне должны</button>
            </div>
          </div>
        )}

        <div className="tk-field">
          <label>Название</label>
          <input className="tk-input" maxLength={40} placeholder={kind === 'credit' ? 'Например: Kaspi Кредит' : kind === 'installment' ? 'Например: Рассрочка на телефон' : 'Например: Долг Диме'} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="tk-field">
          <label>{kind === 'debt' ? 'Кто/кому (необязательно)' : 'Банк/магазин (необязательно)'}</label>
          <input className="tk-input" maxLength={40} value={counterparty} onChange={e => setCounterparty(e.target.value)} />
        </div>
        <div className="tk-field"><label>Валюта</label><div className="tk-seg">{CURRENCIES.map(c => <button key={c} type="button" className={currency === c ? 'tk-sel' : ''} onClick={() => setCurrency(c)}>{c}</button>)}</div></div>
        <div className="tk-field"><label>Сумма ({currency})</label><input className="tk-input" inputMode="decimal" placeholder="500 000" value={principalStr} onChange={e => setPrincipalStr(e.target.value)} /></div>
        <div className="tk-field">
          <label>Задолженность на сегодня ({currency})</label>
          <input className="tk-input" inputMode="decimal" placeholder={principalStr || 'вся сумма'} value={remainingStr} onChange={e => setRemainingStr(e.target.value)} />
          <p className="tk-hint" style={{ marginTop: 6, marginBottom: 0 }}>
            {editing ? 'Меняется автоматически платежами — правь вручную только для исправления ошибки.' : 'Если уже что-то оплачено раньше — укажи, сколько осталось. Пусто = вся сумма.'}
          </p>
        </div>
        <div className="tk-field"><label>Ставка, % годовых (необязательно)</label><input className="tk-input" inputMode="decimal" placeholder="18" value={rateStr} onChange={e => setRateStr(e.target.value)} /></div>
        <div className="tk-field"><label>Ежемесячный платёж ({currency}, необязательно)</label><input className="tk-input" inputMode="decimal" placeholder="45 000" value={monthlyStr} onChange={e => setMonthlyStr(e.target.value)} /></div>
        {monthlyStr.trim() && <div className="tk-field"><label>Дата следующего платежа</label><input className="tk-input" type="date" value={nextPaymentDate} onChange={e => setNextPaymentDate(e.target.value)} /></div>}
        <div className="tk-field"><label>Дата открытия</label><input className="tk-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div className="tk-field"><label>Срок погашения (необязательно)</label><input className="tk-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        <div className="tk-field"><label>Заметка (необязательно)</label><input className="tk-input" maxLength={100} value={comment} onChange={e => setComment(e.target.value)} /></div>

        {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" onClick={submit} disabled={submitting} style={{ opacity: submitting ? .6 : 1 }}>
            {submitting ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить'}
          </button>
          {editing
            ? <button className="tk-btn-ghost tk-btn-danger" onClick={() => confirmDel ? onDelete(editing) : setConfirmDel(true)}>
                {confirmDel ? 'Точно удалить? Нажми ещё раз' : '🗑 Удалить навсегда'}
              </button>
            : <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>}
        </div>
      </div>
    </div>
  )
}

function PaymentSheet({ credit, accounts, today, onClose, onSave }: {
  credit: Credit; accounts: Account[]; today: string
  onClose: () => void
  onSave: (data: { accountId: string | null; amount: number; day: string; comment: string; advanceNextPayment: boolean }) => void
}) {
  const defaultAmount = credit.monthlyPayment ?? credit.remaining
  const [amountStr, setAmountStr] = useState(defaultAmount > 0 ? String(defaultAmount) : '')
  const matching = accounts.filter(a => a.currency === credit.currency)
  const pickList = matching.length ? matching : accounts
  const [accountId, setAccountId] = useState<string | null>(pickList[0]?.id ?? null)
  const [day, setDay] = useState(today)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const amount = parseMoney(amountStr)
  const isFull = amount >= credit.remaining - 0.005
  const isMonthly = credit.monthlyPayment != null && Math.abs(amount - credit.monthlyPayment) < 0.005

  const submit = () => {
    if (submitting) return
    if (!(amount > 0)) { setErr('Введите сумму платежа'); return }
    setErr('')
    setSubmitting(true)
    onSave({ accountId, amount, day, comment: comment.trim(), advanceNextPayment: isMonthly && !isFull })
  }

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>{credit.direction === 'owe' ? 'Оплатить' : 'Записать поступление'} · {credit.name}</h2>

        <div className="tk-field">
          <label>Сумма ({credit.currency})</label>
          <input className="tk-input" inputMode="decimal" autoFocus value={amountStr} onChange={e => setAmountStr(e.target.value)} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {credit.monthlyPayment != null && (
              <button type="button" className="tk-emoji-opt" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => setAmountStr(String(credit.monthlyPayment))}>
                Платёж {fmt(credit.monthlyPayment, credit.currency)}
              </button>
            )}
            <button type="button" className="tk-emoji-opt" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => setAmountStr(String(credit.remaining))}>
              Закрыть полностью {fmt(credit.remaining, credit.currency)}
            </button>
          </div>
        </div>

        <div className="tk-field">
          <label>{credit.direction === 'owe' ? 'Списать со счёта' : 'Зачислить на счёт'}</label>
          <div className="tk-emoji-picker">
            <button type="button" className={`tk-emoji-opt ${accountId === null ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', fontSize: 14, fontWeight: 600 }} onClick={() => setAccountId(null)}>Без счёта</button>
            {pickList.map(a => (
              <button key={a.id} type="button" className={`tk-emoji-opt ${accountId === a.id ? 'tk-sel' : ''}`} style={{ width: 'auto', padding: '0 12px', gap: 6, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }} onClick={() => setAccountId(a.id)}>
                <span style={{ fontSize: 17 }}>{a.emoji}</span>{a.name}
              </button>
            ))}
          </div>
        </div>

        <div className="tk-field"><label>Дата</label><input className="tk-input" type="date" value={day} max={today} onChange={e => setDay(e.target.value)} /></div>
        <div className="tk-field"><label>Комментарий (необязательно)</label><input className="tk-input" maxLength={100} value={comment} onChange={e => setComment(e.target.value)} /></div>

        {err && <p className="tk-hint" style={{ color: 'var(--tk-danger)' }}>{err}</p>}
        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" disabled={submitting} style={{ opacity: submitting ? .5 : 1 }} onClick={submit}>
            {submitting ? 'Сохраняем…' : isFull ? 'Закрыть полностью' : 'Оплатить'}
          </button>
          <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  )
}
