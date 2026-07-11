'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Account, DepositRate, Txn, TxnType, FinanceSettings, Category, Budget } from '@/lib/finance'
import { Dates } from '@/lib/trackerStats'
import {
  accountValue, depositValue, effectiveRate, formatMoney, combinedTotal, currenciesInUse,
  categorySpend, categoryMeta, ACCOUNT_TYPES, typeLabel,
} from '@/lib/financeCalc'
import '../tracker/tracker.css'
import './finance.css'

const CURRENCIES = ['₸', '€', '$']
const COLORS = ['#3ddc97', '#6d8bff', '#ffb454', '#ff6b6b', '#9a7bff', '#4dd0e1', '#f06292', '#a1e34a']
const EMOJIS = ['💵','💳','🏦','🐷','📈','💰','💶','💴','🪙','💎','🏠','🚗','📱','🎁']
const CAT_EMOJIS = ['🍔','🛒','🚗','🏠','☕','💊','🎉','👕','📱','🎁','💸','✈️','🎮','📚','🐶','💅','🍺','⛽','🚕','🏥','💼','🛠','↩️','💰','🎯','🎓','🏋️','🌸']

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

type View = { name: 'list' | 'detail'; id?: string }
type Modal = null | 'account' | 'op' | 'menu' | 'rates' | 'cats' | 'budgets'

export default function FinancePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [settings, setSettings] = useState<FinanceSettings>({ baseCurrency: '', rates: {} })
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ name: 'list' })
  const [modal, setModal] = useState<Modal>(null)
  const [editingAcc, setEditingAcc] = useState<Account | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const today = useMemo(() => Dates.todayKey(), [])

  useEffect(() => {
    Promise.all([
      fetch('/api/finance/accounts').then(r => r.json()),
      fetch('/api/finance/txns').then(r => r.json()),
      fetch('/api/finance/settings').then(r => r.json()),
      fetch('/api/finance/categories').then(r => r.json()),
      fetch('/api/finance/budgets').then(r => r.json()),
    ]).then(([a, t, s, c, b]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setTxns(Array.isArray(t) ? t : [])
      setSettings(s && typeof s === 'object' ? s : { baseCurrency: '', rates: {} })
      setCategories(Array.isArray(c) ? c : [])
      setBudgets(Array.isArray(b) ? b : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2000) }, [])
  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])
  const spendable = useMemo(() => active.filter(a => a.type !== 'deposit'), [active])
  const patchAccount = (id: string, patch: Partial<Account>) => setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  const bump = (id: string, delta: number) => setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance: a.balance + delta } : a))

  const catInfo = useCallback((key: string): { emoji: string; label: string } => {
    const c = categories.find(x => x.id === key)
    if (c) return { emoji: c.emoji, label: c.name }
    const b = categoryMeta(key)
    return { emoji: b.emoji, label: b.label }
  }, [categories])

  // ── счета ─────────────────────────────────────────────────────────────────
  const saveAccount = useCallback(async (data: any, editing: Account | null, initialRate: { fromDate: string; rate: number } | null) => {
    if (editing) {
      patchAccount(editing.id, data)
      await fetch(`/api/finance/accounts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      showToast('Сохранено')
    } else {
      const res = await fetch('/api/finance/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
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
  }, [showToast])

  const setBalance = useCallback(async (acc: Account, balance: number) => {
    patchAccount(acc.id, { balance })
    await fetch(`/api/finance/accounts/${acc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance }) })
    showToast('Баланс обновлён')
  }, [showToast])

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
    if (!confirm('Удалить счёт и его операции навсегда?')) return
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
  }, [])

  // ── настройки ───────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (baseCurrency: string, rates: Record<string, number>) => {
    setSettings({ baseCurrency, rates })
    await fetch('/api/finance/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseCurrency, rates }) })
    setModal(null); showToast('Курсы сохранены')
  }, [])

  const addCategory = useCallback(async (kind: 'expense' | 'income', name: string, emoji: string) => {
    const res = await fetch('/api/finance/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, emoji }) })
    if (!res.ok) return
    const created = await res.json()
    setCategories(prev => [...prev, created])
  }, [])

  const deleteCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id))
    setBudgets(prev => prev.filter(b => b.categoryId !== id))
    await fetch(`/api/finance/categories/${id}`, { method: 'DELETE' })
  }, [])

  const setBudget = useCallback(async (categoryId: string, amount: number) => {
    setBudgets(prev => {
      const rest = prev.filter(b => b.categoryId !== categoryId)
      return amount > 0 ? [...rest, { id: categoryId, categoryId, amount }] : rest
    })
    await fetch('/api/finance/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId, amount }) })
  }, [])

  const detailAcc = view.name === 'detail' ? accounts.find(a => a.id === view.id) : null
  const openAccountSheet = (a: Account | null) => { setEditingAcc(a); setModal('account') }

  return (
    <div className="tk-root">
      {loading ? <div className="tk-spin" /> : (
        <main className="tk-view">
          {view.name === 'list' && (
            <ListView
              active={active} txns={txns} settings={settings} categories={categories} budgets={budgets} accounts={accounts}
              today={today} catInfo={catInfo}
              onOpenAccount={id => setView({ name: 'detail', id })}
              onAddAccount={() => openAccountSheet(null)}
              onSettings={() => setModal('menu')}
              onDeleteOp={deleteOp}
            />
          )}
          {view.name === 'detail' && detailAcc && (
            <DetailView
              acc={detailAcc} txns={txns.filter(t => t.accountId === detailAcc.id || t.toAccountId === detailAcc.id)} today={today} catInfo={catInfo}
              accountName={id => accounts.find(a => a.id === id)?.name ?? ''}
              onBack={() => setView({ name: 'list' })}
              onEdit={openAccountSheet} onArchive={archiveAccount} onSetBalance={setBalance}
              onAddRate={addRate} onDeleteRate={deleteRate} onDeleteOp={deleteOp}
            />
          )}
        </main>
      )}

      {!loading && view.name === 'list' && active.length > 0 && (
        <button className="tk-fab" onClick={() => (spendable.length ? setModal('op') : openAccountSheet(null))} aria-label="Новая операция">+</button>
      )}

      {modal === 'account' && <AccountSheet editing={editingAcc} today={today} onClose={() => { setModal(null); setEditingAcc(null) }} onSave={saveAccount} onDelete={deleteAccount} />}
      {modal === 'op' && <OperationSheet accounts={spendable} categories={categories} onClose={() => setModal(null)} onSave={addOp} onTransfer={addTransfer} onAddAccount={() => openAccountSheet(null)} />}
      {modal === 'menu' && <SettingsMenu onClose={() => setModal(null)} onRates={() => setModal('rates')} onCats={() => setModal('cats')} onBudgets={() => setModal('budgets')} />}
      {modal === 'rates' && <RatesSheet settings={settings} onClose={() => setModal('menu')} onSave={saveSettings} />}
      {modal === 'cats' && <CategoriesSheet categories={categories} onClose={() => setModal('menu')} onAdd={addCategory} onDelete={deleteCategory} />}
      {modal === 'budgets' && <BudgetsSheet categories={categories} budgets={budgets} txns={txns} accounts={accounts} settings={settings} today={today} onClose={() => setModal('menu')} onSet={setBudget} />}
      {toast && <div className="tk-toast">{toast}</div>}
    </div>
  )
}

// ── Список ───────────────────────────────────────────────────────────────────
function ListView({ active, txns, settings, categories, budgets, accounts, today, catInfo, onOpenAccount, onAddAccount, onSettings, onDeleteOp }: {
  active: Account[]; txns: Txn[]; settings: FinanceSettings; categories: Category[]; budgets: Budget[]; accounts: Account[]
  today: string; catInfo: (k: string) => { emoji: string; label: string }
  onOpenAccount: (id: string) => void; onAddAccount: () => void; onSettings: () => void; onDeleteOp: (t: Txn) => void
}) {
  const gear = (
    <button onClick={onSettings} aria-label="Настройки" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tk-muted)', fontSize: 22, padding: 4 }}>⚙</button>
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
  const effBase = settings.baseCurrency || currencies[0]
  const effSettings: FinanceSettings = { baseCurrency: effBase, rates: settings.rates }
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

      {!multi ? (
        <div className="fin-total-card">
          <div className="tk-k">Всего денег</div>
          <div className="fin-big">{formatMoney(byCur[currencies[0]].total, currencies[0])}</div>
          <div className="fin-total-split">
            <div><div className="lbl">💵 Свободные</div><div className="amt">{formatMoney(byCur[currencies[0]].free, currencies[0])}</div></div>
            {byCur[currencies[0]].deposits > 0 && <div><div className="lbl">📈 В депозитах</div><div className="amt">{formatMoney(byCur[currencies[0]].deposits, currencies[0])}</div></div>}
          </div>
        </div>
      ) : (
        <div className="fin-total-card">
          <div className="tk-k">Всего ≈ (в {effBase})</div>
          <div className="fin-big">≈ {formatMoney(combined.total, effBase)}</div>
          {combined.missing.length > 0 && (
            <div style={{ color: '#ffb454', fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>
              Нет курса для: {combined.missing.join(', ')} — открой ⚙ → Курсы валют
            </div>
          )}
          <div className="fin-total-split" style={{ flexWrap: 'wrap', gap: 14 }}>
            {currencies.map(c => <div key={c} style={{ minWidth: 90 }}><div className="lbl">{c}</div><div className="amt">{formatMoney(byCur[c].total, c)}</div></div>)}
          </div>
        </div>
      )}

      {activeBudgets.length > 0 && (
        <>
          <div className="tk-section-label">Бюджеты на месяц</div>
          <div className="tk-block">
            {activeBudgets.map(({ b, c }) => {
              const spent = categorySpend(b.categoryId, txns, accounts, effSettings, today)
              const pct = Math.min(100, Math.round(spent / b.amount * 100))
              const over = spent > b.amount
              return (
                <div key={b.id} style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                    <span>{c!.emoji} {c!.name}</span>
                    <span style={{ color: over ? 'var(--tk-danger)' : 'var(--tk-muted)', fontWeight: 700 }}>{formatMoney(spent, effBase)} / {formatMoney(b.amount, effBase)}</span>
                  </div>
                  <div className="tk-mini-track"><div className="tk-mini-fill" style={{ width: pct + '%', background: over ? 'var(--tk-danger)' : 'var(--tk-good)' }} /></div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="tk-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Счета</span>
        <button onClick={onAddAccount} style={{ background: 'none', border: 'none', color: 'var(--tk-accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ счёт</button>
      </div>
      <div className="tk-list">{active.map(a => <AccountRow key={a.id} a={a} today={today} onOpen={onOpenAccount} />)}</div>

      {txns.length > 0 && (
        <>
          <div className="tk-section-label">Последние операции</div>
          <div className="tk-block" style={{ padding: '6px 16px' }}>
            {txns.slice(0, 30).map(t => <OpRow key={t.id} t={t} info={catInfo(t.category)} fromName={nameOf(t.accountId)} toName={t.toAccountId ? nameOf(t.toAccountId) : ''} currency={curOf(t.accountId)} onDelete={onDeleteOp} />)}
          </div>
        </>
      )}
    </>
  )
}

function AccountRow({ a, today, onOpen }: { a: Account; today: string; onOpen: (id: string) => void }) {
  const val = accountValue(a, today)
  const dep = a.type === 'deposit' ? depositValue(a, today) : null
  return (
    <div className="fin-acc" onClick={() => onOpen(a.id)}>
      <div className="emo" style={{ background: 'var(--tk-card-2)', color: a.color }}>{a.emoji}</div>
      <div className="mid">
        <div className="nm">{a.name}</div>
        <div className="sub"><span>{typeLabel(a.type)}</span>{dep && dep.currentRate != null && <span className="fin-chip rate">{dep.currentRate}%</span>}</div>
      </div>
      <div className="right">
        <div className="val">{formatMoney(val, a.currency)}</div>
        {dep && dep.interest > 0 && <div className="val-sub">+{formatMoney(dep.interest, a.currency)}</div>}
      </div>
    </div>
  )
}

function OpRow({ t, info, fromName, toName, currency, onDelete }: { t: Txn; info: { emoji: string; label: string }; fromName: string; toName: string; currency: string; onDelete: (t: Txn) => void }) {
  const isTransfer = t.type === 'transfer'
  const income = t.type === 'income'
  const emoji = isTransfer ? '🔄' : info.emoji
  const label = isTransfer ? 'Перевод' : info.label
  const sub = isTransfer ? `${fromName} → ${toName}` : fromName
  const color = isTransfer ? 'var(--tk-muted)' : (income ? 'var(--tk-good)' : 'var(--tk-text)')
  const sign = isTransfer ? '' : (income ? '+' : '−')
  return (
    <div className="fin-kv" style={{ gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--tk-card-2)', display: 'grid', placeItems: 'center', fontSize: 17, flex: '0 0 auto' }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</div>
        <div style={{ color: 'var(--tk-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}{t.comment ? ` · ${t.comment}` : ''} · {Dates.humanShort(t.day)}</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color, whiteSpace: 'nowrap' }}>{sign}{formatMoney(t.amount, currency)}</div>
      <button onClick={() => onDelete(t)} aria-label="Удалить" style={{ background: 'none', border: 'none', color: 'var(--tk-faint)', cursor: 'pointer', fontSize: 15, padding: 4 }}>✕</button>
    </div>
  )
}

// ── Детали счёта ──────────────────────────────────────────────────────────────
function DetailView({ acc, txns, today, catInfo, accountName, onBack, onEdit, onArchive, onSetBalance, onAddRate, onDeleteRate, onDeleteOp }: {
  acc: Account; txns: Txn[]; today: string; catInfo: (k: string) => { emoji: string; label: string }; accountName: (id: string) => string
  onBack: () => void; onEdit: (a: Account) => void; onArchive: (a: Account) => void; onSetBalance: (a: Account, b: number) => void
  onAddRate: (a: Account, fromDate: string, rate: number) => void; onDeleteRate: (a: Account, rateId: string) => void; onDeleteOp: (t: Txn) => void
}) {
  const isDeposit = acc.type === 'deposit'
  const dep = isDeposit ? depositValue(acc, today) : null
  const val = accountValue(acc, today)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceStr, setBalanceStr] = useState(String(acc.balance))
  const [newRate, setNewRate] = useState('')
  const [newRateDate, setNewRateDate] = useState(today)
  const sortedRates = [...acc.rates].sort((a, b) => a.fromDate < b.fromDate ? -1 : 1)
  const currentRateId = (() => { let id: string | null = null; for (const r of sortedRates) if (r.fromDate <= today) id = r.id; return id })()
  const effNow = dep?.currentRate != null ? effectiveRate(dep.currentRate, acc.capitalization) : null

  return (
    <>
      <button className="tk-back" onClick={onBack}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Назад</button>
      <div className="tk-detail-hero">
        <div className="tk-emoji" style={{ background: 'var(--tk-card-2)', color: acc.color }}>{acc.emoji}</div>
        <div><h1>{acc.name}</h1><div className="tk-sub">{typeLabel(acc.type)} · {acc.currency}</div></div>
      </div>

      <div className="tk-block">
        <div style={{ color: 'var(--tk-muted)', fontSize: 13, fontWeight: 600 }}>{isDeposit ? 'Сейчас на депозите' : 'Баланс'}</div>
        <div className="fin-hero-amount">{formatMoney(val, acc.currency)}</div>
        {dep && dep.interest > 0 && <div className="fin-hero-note">+{formatMoney(dep.interest, acc.currency)} процентами</div>}
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
            <div className="fin-kv"><span className="k">Тело депозита</span><span className="v">{formatMoney(acc.principal, acc.currency)}</span></div>
            <div className="fin-kv"><span className="k">Дата открытия</span><span className="v">{acc.startDate ? Dates.human(acc.startDate) : '—'}</span></div>
            <div className="fin-kv"><span className="k">Ставка сейчас</span><span className="v" style={{ color: 'var(--tk-good)' }}>{dep?.currentRate != null ? dep.currentRate + '%' : '—'}</span></div>
            <div className="fin-kv"><span className="k">Капитализация</span><span className="v">{acc.capitalization === 'monthly' ? 'ежемесячная' : 'нет'}</span></div>
            {effNow != null && acc.capitalization === 'monthly' && <div className="fin-kv"><span className="k">Эффективно годовых</span><span className="v" style={{ color: 'var(--tk-good)' }}>≈ {effNow.toFixed(1)}%</span></div>}
            <div className="fin-kv"><span className="k">Начислено</span><span className="v" style={{ color: 'var(--tk-good)' }}>+{formatMoney(dep?.interest ?? 0, acc.currency)}</span></div>
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

      {!isDeposit && txns.length > 0 && (
        <div className="tk-block" style={{ padding: '6px 16px' }}>
          <div style={{ padding: '10px 0 4px', color: 'var(--tk-faint)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Операции</div>
          {txns.slice(0, 40).map(t => <OpRow key={t.id} t={t} info={catInfo(t.category)} fromName={accountName(t.accountId)} toName={t.toAccountId ? accountName(t.toAccountId) : ''} currency={acc.currency} onDelete={onDeleteOp} />)}
        </div>
      )}

      <div className="tk-sheet-actions" style={{ marginTop: 8 }}>
        <button className="tk-btn-ghost" onClick={() => onEdit(acc)}>✏️ Изменить счёт</button>
        <button className="tk-btn-ghost" onClick={() => onArchive(acc)}>📦 Скрыть счёт (сохранить историю)</button>
      </div>
    </>
  )
}

// ── Быстрая операция ────────────────────────────────────────────────────────────
function OperationSheet({ accounts, categories, onClose, onSave, onTransfer, onAddAccount }: {
  accounts: Account[]; categories: Category[]
  onClose: () => void
  onSave: (d: { accountId: string; type: TxnType; amount: number; category: string; comment: string }) => void
  onTransfer: (d: { fromAccountId: string; toAccountId: string; amount: number; toAmount: number; comment: string }) => void
  onAddAccount: () => void
}) {
  const [type, setType] = useState<TxnType>('expense')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [toId, setToId] = useState(accounts[1]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')

  const cats = categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'))
  const from = accounts.find(a => a.id === accountId)
  const to = accounts.find(a => a.id === toId)
  const isTransfer = type === 'transfer'
  const crossCur = isTransfer && from && to && from.currency !== to.currency
  const canSave = isTransfer
    ? (accountId && toId && accountId !== toId && parseMoney(amount) > 0 && (!crossCur || parseMoney(toAmount) > 0))
    : (accountId && parseMoney(amount) > 0)

  const submit = () => {
    if (!canSave) return
    if (isTransfer) {
      onTransfer({ fromAccountId: accountId, toAccountId: toId, amount: parseMoney(amount), toAmount: crossCur ? parseMoney(toAmount) : parseMoney(amount), comment: comment.trim() })
    } else {
      onSave({ accountId, type, amount: parseMoney(amount), category: category || (cats[0]?.id ?? ''), comment: comment.trim() })
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
          </div>
        </div>

        {!accounts.length ? (
          <div className="tk-field"><p className="tk-hint">Сначала добавь счёт.</p><button className="tk-btn-primary" onClick={onAddAccount}>+ Добавить счёт</button></div>
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
          </>
        )}

        {accounts.length > 0 && (
          <div className="tk-sheet-actions">
            <button className="tk-btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : .5 }} onClick={submit}>
              {isTransfer ? 'Перевести' : type === 'expense' ? 'Записать расход' : 'Записать доход'}
            </button>
            <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Меню настроек ────────────────────────────────────────────────────────────────
function SettingsMenu({ onClose, onRates, onCats, onBudgets }: { onClose: () => void; onRates: () => void; onCats: () => void; onBudgets: () => void }) {
  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Настройки</h2>
        <div className="tk-sheet-actions">
          <button className="tk-btn-ghost" onClick={onRates}>💱 Курсы валют</button>
          <button className="tk-btn-ghost" onClick={onCats}>🏷 Категории</button>
          <button className="tk-btn-ghost" onClick={onBudgets}>🎯 Бюджеты на месяц</button>
          <button className="tk-btn-ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

// ── Категории ────────────────────────────────────────────────────────────────────
function CategoriesSheet({ categories, onClose, onAdd, onDelete }: {
  categories: Category[]; onClose: () => void; onAdd: (kind: 'expense' | 'income', name: string, emoji: string) => void; onDelete: (id: string) => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🍔')
  const list = categories.filter(c => c.kind === kind)

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Категории</h2>
        <div className="tk-field">
          <div className="tk-seg">
            <button type="button" className={kind === 'expense' ? 'tk-sel' : ''} onClick={() => setKind('expense')}>Расходы</button>
            <button type="button" className={kind === 'income' ? 'tk-sel' : ''} onClick={() => setKind('income')}>Доходы</button>
          </div>
        </div>

        <div className="tk-block" style={{ padding: '4px 16px' }}>
          {list.map(c => (
            <div key={c.id} className="fin-kv">
              <span style={{ fontSize: 15 }}>{c.emoji} {c.name}</span>
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
            <button className="tk-btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={() => { if (name.trim()) { onAdd(kind, name.trim(), emoji); setName('') } }}>Добавить</button>
          </div>
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
                <span style={{ flex: 1, fontSize: 14.5 }}>{c.emoji} {c.name}<br /><span style={{ color: 'var(--tk-muted)', fontSize: 11.5 }}>потрачено {formatMoney(spent, base)}</span></span>
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
  const [color, setColor] = useState(editing?.color ?? COLORS[0])
  const [balanceStr, setBalanceStr] = useState(editing ? String(editing.balance) : '')
  const [principalStr, setPrincipalStr] = useState(editing ? String(editing.principal) : '')
  const [startDate, setStartDate] = useState(editing?.startDate ?? today)
  const [capitalization, setCapitalization] = useState<'monthly' | 'none'>(editing?.capitalization ?? 'monthly')
  const [rateStr, setRateStr] = useState('')

  const pickType = (t: Account['type']) => { setType(t); const def = ACCOUNT_TYPES.find(x => x.value === t); if (def && (!editing || emoji === '💵')) setEmoji(def.emoji) }
  const eff = parseMoney(rateStr) > 0 ? effectiveRate(parseMoney(rateStr), capitalization) : null

  const submit = () => {
    if (!name.trim()) return
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
        <div className="tk-field"><label>Цвет</label><div className="tk-color-row">{COLORS.map(c => <button key={c} type="button" className={`tk-color-dot ${c === color ? 'tk-sel' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}</div></div>

        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" onClick={submit}>{editing ? 'Сохранить' : 'Добавить счёт'}</button>
          {editing ? <button className="tk-btn-ghost tk-btn-danger" onClick={() => onDelete(editing)}>🗑 Удалить навсегда</button> : <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>}
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
  const submit = () => {
    const out: Record<string, number> = {}
    for (const c of others) { const v = Number(String(rates[c] ?? '').replace(',', '.')); if (v > 0) out[c] = v }
    onSave(base, out)
  }
  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>Курсы валют</h2>
        <p className="tk-hint">Выбери основную валюту и укажи, сколько она стоит для остальных. Общий итог со всех счетов посчитается по этим курсам.</p>
        <div className="tk-field"><label>Основная валюта</label><div className="tk-seg">{CURRENCIES.map(c => <button key={c} type="button" className={base === c ? 'tk-sel' : ''} onClick={() => setBase(c)}>{c}</button>)}</div></div>
        {others.map(c => (
          <div className="tk-field" key={c}><label>1 {c} = сколько {base}?</label><input className="tk-input" inputMode="decimal" placeholder="Например: 5.4" value={rates[c] ?? ''} onChange={e => setRates(prev => ({ ...prev, [c]: e.target.value }))} /></div>
        ))}
        <div className="tk-sheet-actions"><button className="tk-btn-primary" onClick={submit}>Сохранить курсы</button><button className="tk-btn-ghost" onClick={onClose}>Отмена</button></div>
      </div>
    </div>
  )
}
