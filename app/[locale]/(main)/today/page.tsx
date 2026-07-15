'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { Task, Section, CalEvent } from '@/lib/db'
import type { Habit } from '@/lib/tracker'
import type { Account, FinanceSettings, Budget, Credit } from '@/lib/finance'
import { Dates, Stats, toCalc } from '@/lib/trackerStats'
import { eventOccursOn } from '@/lib/events'
import { buildIcs, downloadIcs } from '@/lib/ics'
import { toIntlLocale } from '@/lib/intlLocale'
import type { Locale } from '@/i18n/routing'
import { categorySpend, currenciesInUse } from '@/lib/financeCalc'
import { fmt, isMoneyHidden, setMoneyHidden, loadMoneyHidden } from '@/lib/hideMoney'
import VoiceAssistant from '@/components/VoiceAssistant'

const DONE_STATES = ['Done', 'Cancelled']

export default function TodayPage() {
  const tr = useTranslations('today')
  const trCommon = useTranslations('common')
  const locale = useLocale()
  const [habits, setHabits] = useState<Habit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [finSettings, setFinSettings] = useState<FinanceSettings>({ baseCurrency: '', rates: {} })
  const [finCategories, setFinCategories] = useState<{ id: string; name: string; emoji: string }[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [txns, setTxns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [quickAdd, setQuickAdd] = useState<null | 'task' | 'event'>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [, forceHideRerender] = useState(0)

  const today = useMemo(() => Dates.todayKey(), [])
  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200) }, [])

  // подхватываем сохранённый выбор «скрыть деньги» после гидратации (см. lib/hideMoney.ts)
  useEffect(() => { loadMoneyHidden(); forceHideRerender(n => n + 1) }, [])
  const toggleHideMoney = useCallback(() => { setMoneyHidden(!isMoneyHidden()); forceHideRerender(n => n + 1) }, [])

  useEffect(() => {
    (async () => {
      const [h, t, s, e, sp] = await Promise.all([
        fetch('/api/tracker/habits').then(r => r.json()),
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/sections').then(r => r.json()),
        fetch('/api/events').then(r => r.json()),
        fetch('/api/finance/spaces').then(r => r.json()),
      ])
      setHabits(Array.isArray(h) ? h : [])
      setTasks(Array.isArray(t) ? t : [])
      setSections(Array.isArray(s) ? s : [])
      setEvents(Array.isArray(e) ? e : [])

      const spaces: { id: string }[] = Array.isArray(sp) ? sp : []
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('fin_space') : null
      const spaceId = spaces.find(x => x.id === saved)?.id ?? spaces[0]?.id ?? null
      if (spaceId) {
        const qs = `?spaceId=${spaceId}`
        const [acc, settings, cats, buds, crs, tx] = await Promise.all([
          fetch(`/api/finance/accounts${qs}`).then(r => r.json()),
          fetch('/api/finance/settings').then(r => r.json()),
          fetch(`/api/finance/categories${qs}`).then(r => r.json()),
          fetch(`/api/finance/budgets${qs}`).then(r => r.json()),
          fetch(`/api/finance/credits${qs}`).then(r => r.json()),
          fetch(`/api/finance/txns${qs}`).then(r => r.json()),
        ])
        setAccounts(Array.isArray(acc) ? acc : [])
        setFinSettings(settings && typeof settings === 'object' ? settings : { baseCurrency: '', rates: {} })
        setFinCategories(Array.isArray(cats) ? cats : [])
        setBudgets(Array.isArray(buds) ? buds : [])
        setCredits(Array.isArray(crs) ? crs : [])
        setTxns(Array.isArray(tx) ? tx : [])
      }
      setLoading(false)
    })()
  }, [])

  const toggleHabit = useCallback(async (h: Habit) => {
    const target = h.targetPerDay || 1
    const cur = h.counts?.[today] ?? 0
    const next = cur >= target ? 0 : cur + 1
    const apply = (habit: Habit, count: number): Habit => {
      const counts = { ...(habit.counts ?? {}) }
      if (count <= 0) delete counts[today]; else counts[today] = count
      const full = count >= target
      const completions = full
        ? (habit.completions.includes(today) ? habit.completions : [...habit.completions, today])
        : habit.completions.filter(d => d !== today)
      return { ...habit, counts, completions }
    }
    setHabits(prev => prev.map(x => x.id === h.id ? apply(x, next) : x))
    if (navigator.vibrate) navigator.vibrate(12)
    try {
      await fetch('/api/tracker/completions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId: h.id, day: today, count: next }),
      })
    } catch {
      setHabits(prev => prev.map(x => x.id === h.id ? apply(x, cur) : x))
    }
  }, [today])

  const markTaskDone = useCallback(async (t: Task) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, state: 'Done' } : x))
    await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'Done' }) })
  }, [])

  // оплата кредита/долга одной кнопкой: сумма = ежемесячный платёж, счёт — первый
  // подходящий по валюте (без права выбора здесь — за точным контролем в Финансы)
  const payCreditQuick = useCallback(async (c: Credit) => {
    const acc = accounts.find(a => !a.archived && a.type !== 'deposit' && a.currency === c.currency)
    const amount = c.monthlyPayment ?? c.remaining
    const res = await fetch(`/api/finance/credits/${c.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: acc?.id ?? null, amount, advanceNextPayment: true }),
    })
    if (!res.ok) { showToast(tr('toasts.failed')); return }
    const { credit } = await res.json()
    setCredits(prev => prev.map(x => x.id === c.id ? credit : x))
    if (acc) {
      const delta = c.direction === 'owe' ? -amount : amount
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, balance: a.balance + delta } : a))
    }
    showToast(credit.archived ? tr('toasts.paidFull') : tr('toasts.paid', { amount: fmt(amount, c.currency) }))
  }, [accounts, showToast, tr])

  const dueHabits = useMemo(
    () => habits.filter(h => !h.archived && Stats.isScheduled(toCalc(h), today)),
    [habits, today],
  )
  const habitsDone = useMemo(
    () => dueHabits.filter(h => (h.counts?.[today] ?? 0) >= (h.targetPerDay || 1)).length,
    [dueHabits, today],
  )
  const streak = useMemo(() => {
    const all = habits.filter(h => !h.archived).map(toCalc)
    return Stats.globalStreak(all, today)
  }, [habits, today])

  const activeTasks = useMemo(() => tasks.filter(t => !DONE_STATES.includes(t.state)), [tasks])
  const overdue = useMemo(
    () => activeTasks.filter(t => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [activeTasks, today],
  )
  const dueToday = useMemo(() => activeTasks.filter(t => t.dueDate === today), [activeTasks, today])
  const upcomingTasks = useMemo(
    () => activeTasks.filter(t => t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    [activeTasks, today],
  )
  const eventsToday = useMemo(
    () => events.filter(e => eventOccursOn(e, today)).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [events, today],
  )
  // повторяющееся событие может попасть в окно «ближайшие дни» несколько раз
  // (например ежедневное) — каждое вхождение несёт свою фактическую дату occursOn,
  // а не e.day (день создания/якорь повторения)
  const upcomingEvents = useMemo(() => {
    const limit = Dates.addDays(today, 6)
    const out: { event: CalEvent; occursOn: string }[] = []
    for (let d = Dates.addDays(today, 1); d <= limit; d = Dates.addDays(d, 1)) {
      for (const e of events) if (eventOccursOn(e, d)) out.push({ event: e, occursOn: d })
    }
    return out
      .sort((a, b) => a.occursOn === b.occursOn ? (a.event.time || '').localeCompare(b.event.time || '') : a.occursOn.localeCompare(b.occursOn))
      .slice(0, 5)
  }, [events, today])

  const sectionName = (id: string) => sections.find(s => s.id === id)?.name ?? ''

  const agenda = useMemo(() => {
    type Item = { key: string; sortKey: string; type: 'task'; task: Task } | { key: string; sortKey: string; type: 'event'; event: CalEvent }
    const items: Item[] = [
      ...dueToday.map(t => ({ key: 't-' + t.id, sortKey: '', type: 'task' as const, task: t })),
      ...eventsToday.map(e => ({ key: 'e-' + e.id, sortKey: e.time || '', type: 'event' as const, event: e })),
    ]
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [dueToday, eventsToday])

  // ── финансовая сводка ────────────────────────────────────────────────────────
  const spendable = useMemo(() => accounts.filter(a => !a.archived && a.type !== 'deposit'), [accounts])
  const effSettings = useMemo<FinanceSettings>(() => ({
    baseCurrency: finSettings.baseCurrency || currenciesInUse(spendable)[0] || '', rates: finSettings.rates,
  }), [finSettings, spendable])
  const overBudget = useMemo(() => {
    return budgets
      .map(b => ({ b, c: finCategories.find(c => c.id === b.categoryId) }))
      .filter((x): x is { b: Budget; c: { id: string; name: string; emoji: string } } => !!x.c)
      .map(x => ({ ...x, spent: categorySpend(x.b.categoryId, txns, accounts, effSettings, today) }))
      .filter(x => x.spent > x.b.amount)
  }, [budgets, finCategories, txns, accounts, effSettings, today])

  // скрытие баннера «превышен бюджет» до конца месяца (localStorage, ключ включает
  // месяц — так дисмисс сам «протухает» и в новом месяце баннер снова покажется)
  const [dismissedBudgetIds, setDismissedBudgetIds] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('fin_budget_dismissed')
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && parsed.month === today.slice(0, 7)) setDismissedBudgetIds(parsed.ids)
    } catch {}
  }, [today])
  const visibleOverBudget = useMemo(
    () => overBudget.filter(x => !dismissedBudgetIds.includes(x.b.categoryId)),
    [overBudget, dismissedBudgetIds],
  )
  const dismissOverBudget = useCallback(() => {
    const ids = overBudget.map(x => x.b.categoryId)
    localStorage.setItem('fin_budget_dismissed', JSON.stringify({ month: today.slice(0, 7), ids }))
    setDismissedBudgetIds(ids)
  }, [overBudget, today])
  const duePayments = useMemo(
    () => credits.filter(c => !c.archived && c.monthlyPayment != null && c.nextPaymentDate && c.nextPaymentDate <= today),
    [credits, today],
  )
  // долги/рассрочки без ежемесячного платежа, но со сроком погашения на носу — тоже стоит напомнить
  const dueDebts = useMemo(() => {
    const soon = Dates.addDays(today, 7)
    return credits
      .filter(c => !c.archived && c.monthlyPayment == null && c.dueDate && c.dueDate <= soon)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  }, [credits, today])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 5 ? tr('greeting.night') : h < 12 ? tr('greeting.morning') : h < 18 ? tr('greeting.day') : tr('greeting.evening')
  }, [tr])
  const dateLabel = useMemo(() => {
    const s = Dates.parse(today).toLocaleDateString(toIntlLocale(locale as Locale), { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [today, locale])

  const nothingPlanned = dueHabits.length === 0 && overdue.length === 0 && agenda.length === 0
    && upcomingTasks.length === 0 && upcomingEvents.length === 0 && duePayments.length === 0 && dueDebts.length === 0

  const addTask = useCallback(async (title: string) => {
    let sid = sections.find(s => !s.archived)?.id
    if (!sid) {
      const created = await fetch('/api/sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trCommon('defaultSectionName') }) }).then(r => r.json())
      if (!created?.id) { showToast(tr('toasts.sectionCreateFailed')); return }
      setSections(prev => [...prev, created])
      sid = created.id
    }
    const task = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectionId: sid, title }) }).then(r => r.json())
    if (!task?.id) { showToast(tr('toasts.addFailed')); return }
    await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate: today }) })
    setTasks(prev => [...prev, { ...task, dueDate: today }])
    showToast(tr('toasts.taskAdded'))
  }, [sections, today, showToast, tr, trCommon])

  const addEvent = useCallback(async (title: string, time: string) => {
    const created = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: today, time, title }) }).then(r => r.json())
    if (!created?.id) { showToast(tr('toasts.addFailed')); return }
    setEvents(prev => [...prev, created])
    showToast(tr('toasts.eventAdded'))
  }, [today, showToast, tr])

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-5 space-y-4">
        <div className="h-6 w-40 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-16 rounded-2xl bg-white/5 animate-pulse" />
        <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 py-5 pb-28 space-y-6">
      <div>
        <p className="text-accent-400 text-sm font-semibold">{greeting}</p>
        <h1 className="text-xl font-bold text-white">{dateLabel}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {streak.current > 0 ? tr('streakLine', { count: streak.current }) : dueHabits.length > 0 ? tr('startStreakLine') : ' '}
        </p>
      </div>

      {visibleOverBudget.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-red-400 font-semibold">{tr('overBudgetTitle')}</span>
            <div className="flex items-center gap-2.5">
              <button onClick={toggleHideMoney} aria-label={isMoneyHidden() ? trCommon('showMoney') : trCommon('hideMoney')} className="text-gray-500 text-base leading-none">
                {isMoneyHidden() ? '🙈' : '👁'}
              </button>
              <button onClick={dismissOverBudget} aria-label={tr('dismissBudgetAria')} className="text-gray-500 hover:text-gray-300 text-base leading-none">
                ✕
              </button>
            </div>
          </div>
          <p className="text-sm text-red-300 mt-1">
            {visibleOverBudget.map(x => `${x.c.name} +${fmt(x.spent - x.b.amount, effSettings.baseCurrency)}`).join(', ')}
          </p>
        </div>
      )}

      {!nothingPlanned && (
        <div className="flex gap-2.5">
          {dueHabits.length > 0 && <StatPill value={`${habitsDone}/${dueHabits.length}`} label={tr('pillHabits')} tone={habitsDone >= dueHabits.length ? 'good' : undefined} />}
          <StatPill value={String(overdue.length)} label={tr('pillOverdue')} tone={overdue.length > 0 ? 'red' : undefined} />
          <StatPill value={String(agenda.length)} label={tr('pillToday')} tone={agenda.length > 0 ? 'accent' : undefined} />
        </div>
      )}

      {nothingPlanned && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-2">🌤</span>
          <p className="text-gray-400 text-sm">{tr('nothingPlannedTitle')}</p>
          <p className="text-gray-700 text-xs mt-1">{tr('nothingPlannedHint')}</p>
        </div>
      )}

      {overdue.length > 0 && (
        <Section title={tr('overdueSection')} count={overdue.length} accent="red">
          <div className="space-y-1.5">
            {overdue.map(t => <TaskRow key={t.id} t={t} sectionName={sectionName(t.sectionId)} today={today} onDone={markTaskDone} showDate />)}
          </div>
        </Section>
      )}

      {(duePayments.length > 0 || dueDebts.length > 0) && (
        <Section title={tr('paymentsSection')} count={duePayments.length + dueDebts.length} accent="red">
          <div className="space-y-1.5">
            {duePayments.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{c.name}</p>
                  <p className={`text-xs mt-0.5 ${c.nextPaymentDate! < today ? 'text-red-400' : 'text-gray-500'}`}>
                    {fmt(c.monthlyPayment!, c.currency)} · {c.nextPaymentDate! < today ? tr('overdueStatus') : tr('todayStatus')}
                  </p>
                </div>
                <button onClick={() => payCreditQuick(c)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-[#120a00]"
                  style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)' }}>
                  {tr('pay')}
                </button>
              </div>
            ))}
            {dueDebts.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{c.name}</p>
                  <p className={`text-xs mt-0.5 ${c.dueDate! < today ? 'text-red-400' : 'text-gray-500'}`}>
                    {fmt(c.remaining, c.currency)} · {c.dueDate! < today ? tr('overdueDebtStatus') : c.dueDate === today ? tr('dueTodayStatus') : tr('dueOnStatus', { date: Dates.humanShort(c.dueDate!) })}
                  </p>
                </div>
                <button onClick={() => payCreditQuick(c)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-[#120a00]"
                  style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)' }}>
                  {tr('pay')}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {agenda.length > 0 && (
        <Section title={tr('scheduleSection')} count={agenda.length}>
          <div className="space-y-1.5">
            {agenda.map(item => item.type === 'task'
              ? <ScheduleTaskRow key={item.key} t={item.task} sectionName={sectionName(item.task.sectionId)} onDone={markTaskDone} />
              : <ScheduleEventRow key={item.key} e={item.event} day={today} />)}
          </div>
        </Section>
      )}

      {dueHabits.length > 0 && (
        <Section title={tr('habitsSection')} count={dueHabits.length}>
          <div className="space-y-1.5">
            {dueHabits.map(h => {
              const target = h.targetPerDay || 1
              const cur = h.counts?.[today] ?? 0
              const done = cur >= target
              return (
                <button key={h.id} onClick={() => toggleHabit(h)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition active:scale-[.99] ${
                    done ? 'border-accent-500/30 bg-accent-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}>
                  <span className={`shrink-0 grid place-items-center w-8 h-8 rounded-full text-base ${done ? 'bg-accent-500 text-[#120a00]' : 'bg-white/[0.06]'}`}>
                    {done ? '✓' : h.emoji}
                  </span>
                  <span className={`flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-200'}`}>{h.name}</span>
                  {target > 1 && <span className="text-xs text-gray-500 tabular-nums">{cur}/{target}</span>}
                </button>
              )
            })}
          </div>
        </Section>
      )}

      {(upcomingTasks.length > 0 || upcomingEvents.length > 0) && (
        <Section title={tr('upcomingSection')}>
          <div className="space-y-1">
            {upcomingEvents.map(({ event: e, occursOn }) => <CompactRow key={e.id + occursOn} time={e.time ? `${Dates.humanShort(occursOn)} · ${e.time}` : Dates.humanShort(occursOn)} title={e.title} />)}
            {upcomingTasks.map(t => <CompactRow key={t.id} time={Dates.humanShort(t.dueDate)} title={t.title} />)}
          </div>
        </Section>
      )}

      <button onClick={() => setQuickAdd('task')} aria-label={tr('quickAdd.quickAddLabel')}
        className="fixed z-40 grid place-items-center rounded-full shadow-lg text-white text-2xl font-light"
        style={{ left: 20, bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', width: 52, height: 52, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
        +
      </button>
      <VoiceAssistant />

      {quickAdd && <QuickAddSheet type={quickAdd} onClose={() => setQuickAdd(null)} onAddTask={addTask} onAddEvent={addEvent} />}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[110] rounded-full bg-white/10 border border-white/15 px-4 py-2 text-sm text-white backdrop-blur"
          style={{ bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function StatPill({ value, label, tone }: { value: string; label: string; tone?: 'red' | 'accent' | 'good' }) {
  const color = tone === 'red' ? 'text-red-400' : tone === 'accent' ? 'text-accent-400' : tone === 'good' ? 'text-green-400' : 'text-white'
  const bg = tone === 'red' ? 'border-red-500/20 bg-red-500/10' : tone === 'accent' ? 'border-accent-500/20 bg-accent-500/10' : tone === 'good' ? 'border-green-500/20 bg-green-500/10' : 'border-white/10 bg-white/[0.03]'
  return (
    <div className={`flex-1 rounded-xl border px-3 py-2.5 text-center ${bg}`}>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function Section({ title, count, accent, children }: { title: string; count?: number; accent?: 'red'; children: React.ReactNode }) {
  return (
    <div>
      <p className={`text-xs uppercase tracking-wider mb-2 font-medium ${accent === 'red' ? 'text-red-400' : 'text-gray-500'}`}>
        {title}{count ? ` (${count})` : ''}
      </p>
      {children}
    </div>
  )
}

function IcsButton({ onExport }: { onExport: () => void }) {
  const trCommon = useTranslations('common')
  return (
    <button onClick={onExport} aria-label={trCommon('addToCalendar')} className="shrink-0 text-base px-1 opacity-60 hover:opacity-100 transition">📅</button>
  )
}

function TaskRow({ t, sectionName, today, onDone, showDate }: { t: Task; sectionName: string; today: string; onDone: (t: Task) => void; showDate?: boolean }) {
  const tr = useTranslations('today')
  const trCommon = useTranslations('common')
  const overdueDays = t.dueDate && t.dueDate < today ? Math.round((Dates.parse(today).getTime() - Dates.parse(t.dueDate).getTime()) / 86400000) : 0
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <button onClick={() => onDone(t)} aria-label={trCommon('markDone')}
        className="shrink-0 w-6 h-6 rounded-full border-2 border-gray-600 hover:border-accent-400 transition" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{t.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {sectionName && <span className="text-xs text-gray-600">{sectionName}</span>}
          {showDate && overdueDays > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full text-red-400 bg-red-500/10">{tr('overdueBadge', { days: overdueDays })}</span>}
        </div>
      </div>
      {t.dueDate && <IcsButton onExport={() => downloadIcs(`${t.title}.ics`, buildIcs({ uid: t.id, title: t.title, day: t.dueDate! }))} />}
    </div>
  )
}

function ScheduleTaskRow({ t, sectionName, onDone }: { t: Task; sectionName: string; onDone: (t: Task) => void }) {
  const trCommon = useTranslations('common')
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <span className="text-[11px] font-bold text-gray-500 uppercase tabular-nums w-14 shrink-0">{trCommon('allDay')}</span>
      <button onClick={() => onDone(t)} aria-label={trCommon('markDone')}
        className="shrink-0 w-6 h-6 rounded-full border-2 border-gray-600 hover:border-accent-400 transition" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{t.title}</p>
        {sectionName && <p className="text-xs text-gray-600 truncate">{sectionName}</p>}
      </div>
      {t.dueDate && <IcsButton onExport={() => downloadIcs(`${t.title}.ics`, buildIcs({ uid: t.id, title: t.title, day: t.dueDate! }))} />}
    </div>
  )
}

function ScheduleEventRow({ e, day }: { e: CalEvent; day: string }) {
  const tr = useTranslations('today')
  const trCommon = useTranslations('common')
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <span className="text-sm font-bold text-accent-400 tabular-nums w-14 shrink-0">{e.time || trCommon('allDay')}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{e.title}</p>
        {(e.endTime || e.note) && (
          <p className="text-xs text-gray-500 truncate">
            {e.endTime ? tr('endsAt', { time: e.endTime }) : ''}{e.endTime && e.note ? ' · ' : ''}{e.note}
          </p>
        )}
      </div>
      <IcsButton onExport={() => downloadIcs(`${e.title}.ics`, buildIcs({ uid: e.id, title: e.title, day, time: e.time, endTime: e.endTime, note: e.note, repeat: e.repeat }))} />
    </div>
  )
}

function CompactRow({ time, title }: { time: string; title: string }) {
  return (
    <div className="flex items-center gap-3 px-1 py-1.5">
      <span className="text-xs text-gray-500 tabular-nums w-24 shrink-0">{time}</span>
      <p className="text-sm text-gray-300 truncate">{title}</p>
    </div>
  )
}

// ── Быстрое добавление задачи/события на сегодня (запасной путь без чата — у ассистента лимит 15 команд/мес) ──
function QuickAddSheet({ type, onClose, onAddTask, onAddEvent }: {
  type: 'task' | 'event'; onClose: () => void
  onAddTask: (title: string) => Promise<void>; onAddEvent: (title: string, time: string) => Promise<void>
}) {
  const tr = useTranslations('today.quickAdd')
  const trCommon = useTranslations('common')
  const [kind, setKind] = useState<'task' | 'event'>(type)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (submitting || !title.trim()) return
    setSubmitting(true)
    if (kind === 'task') await onAddTask(title.trim())
    else await onAddEvent(title.trim(), time)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border-t border-white/10 p-6"
        style={{ background: 'linear-gradient(160deg, #161618, #0b0b0c)', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />
        <div className="flex rounded-xl border border-white/10 p-1 mb-5">
          <button onClick={() => setKind('task')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${kind === 'task' ? 'bg-accent-600 text-[#120a00]' : 'text-gray-400'}`}>{tr('task')}</button>
          <button onClick={() => setKind('event')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${kind === 'event' ? 'bg-accent-600 text-[#120a00]' : 'text-gray-400'}`}>{tr('event')}</button>
        </div>

        <label className="block text-xs font-semibold text-gray-400 mb-1.5">{kind === 'task' ? tr('taskLabel') : tr('eventLabel')}</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) submit() }}
          placeholder={kind === 'task' ? tr('taskPlaceholder') : tr('eventPlaceholder')}
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-accent-500 mb-4" />

        {kind === 'event' && (
          <>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">{tr('timeLabel')}</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-500 [color-scheme:dark] mb-4" />
          </>
        )}

        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition hover:bg-white/[0.04]">{trCommon('cancel')}</button>
          <button onClick={submit} disabled={!title.trim() || submitting}
            className="flex-1 bg-accent-600 hover:bg-accent-500 text-[#120a00] font-bold py-3 rounded-xl transition active:scale-[.98] disabled:opacity-40">
            {submitting ? tr('adding') : trCommon('add')}
          </button>
        </div>
      </div>
    </div>
  )
}
