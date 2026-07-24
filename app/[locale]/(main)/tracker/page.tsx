'use client'

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { Habit, Schedule } from '@/lib/tracker'
import { Dates, Stats, toCalc, hexA, type HabitCalc } from '@/lib/trackerStats'
import { toIntlLocale } from '@/lib/intlLocale'
import type { Locale } from '@/i18n/routing'
import './tracker.css'

const EMOJIS = ['✅','💪','🏃','📚','💧','🧘','🛌','🥗','☀️','🚭','🧠','✍️','🎯','🎸','💊','🦷','🚶','🏊','🚴','🍎','☕','🌿','📵','💰','🧹','❤️','🙏','🎨','🇬🇧','⏰']
const ACCENT = '#ff7a1a' // единый янтарный акцент (моно-тема, без разноцветных привычек)

type View = { name: 'today' | 'stats' | 'detail'; id?: string; back?: 'today' | 'stats' }

// ── SVG-кольцо прогресса ──────────────────────────────────────────────────────
function Ring({ percent, size = 64, color = 'var(--tk-good)', label }: { percent: number; size?: number; color?: string; label?: string }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent))
  const off = c * (1 - p / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="tk-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--tk-card-2)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      {label ? <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size*0.26} fontWeight="800" fill="var(--tk-text)">{label}</text> : null}
    </svg>
  )
}

const Check = () => <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>

export default function TrackerPage() {
  const tr = useTranslations('tracker')
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ name: 'today' })
  const [sheet, setSheet] = useState<{ open: boolean; editing: Habit | null }>({ open: false, editing: null })
  const [toast, setToast] = useState<string | null>(null)

  const today = useMemo(() => Dates.todayKey(), [])

  useEffect(() => {
    fetch('/api/tracker/habits').then(r => r.json()).then((data: Habit[]) => {
      setHabits(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const showToast = useCallback((m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const active = useMemo(() => habits.filter(h => !h.archived), [habits])
  const calc = useMemo(() => {
    const m: Record<string, HabitCalc> = {}
    for (const h of habits) m[h.id] = toCalc(h)
    return m
  }, [habits])
  // ── действия ────────────────────────────────────────────────────────────────
  // отметить привычку за день. Для targetPerDay>1 — увеличивает счётчик на 1,
  // по достижении цели следующий тап сбрасывает день в 0.
  const toggle = useCallback(async (h: Habit, day: string) => {
    const target = h.targetPerDay || 1
    const cur = h.counts?.[day] ?? 0
    const next = cur >= target ? 0 : cur + 1
    const apply = (habit: Habit, count: number): Habit => {
      const counts = { ...(habit.counts ?? {}) }
      if (count <= 0) delete counts[day]; else counts[day] = count
      const full = count >= target
      const completions = full
        ? (habit.completions.includes(day) ? habit.completions : [...habit.completions, day])
        : habit.completions.filter(d => d !== day)
      return { ...habit, counts, completions }
    }
    setHabits(prev => prev.map(x => x.id === h.id ? apply(x, next) : x))
    if (navigator.vibrate) navigator.vibrate(12)
    try {
      await fetch('/api/tracker/completions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId: h.id, day, count: next }),
      })
    } catch {
      showToast(tr('toasts.offline'))
      setHabits(prev => prev.map(x => x.id === h.id ? apply(x, cur) : x))
    }
  }, [showToast, tr])

  const saveHabit = useCallback(async (data: any, editing: Habit | null) => {
    if (editing) {
      setHabits(prev => prev.map(x => x.id === editing.id ? { ...x, ...data } : x))
      await fetch(`/api/tracker/habits/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      showToast(tr('toasts.saved'))
    } else {
      const res = await fetch('/api/tracker/habits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const created: Habit = await res.json()
      created.completions = created.completions || []
      setHabits(prev => [...prev, created])
      showToast(tr('toasts.created'))
    }
    setSheet({ open: false, editing: null })
  }, [showToast, tr])

  const archiveHabit = useCallback(async (h: Habit, archived: boolean) => {
    setHabits(prev => prev.map(x => x.id === h.id ? { ...x, archived } : x))
    await fetch(`/api/tracker/habits/${h.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    })
    showToast(archived ? tr('toasts.archived') : tr('toasts.restored'))
    if (archived) setView({ name: 'today' })
  }, [showToast, tr])

  // подтверждение — в UI (двойной тап), а не через confirm() (в установленном PWA он не всплывает)
  const deleteHabit = useCallback(async (h: Habit) => {
    setHabits(prev => prev.filter(x => x.id !== h.id))
    await fetch(`/api/tracker/habits/${h.id}`, { method: 'DELETE' })
    setSheet({ open: false, editing: null })
    setView({ name: 'today' })
    showToast(tr('toasts.deleted'))
  }, [showToast, tr])

  // ── рендер ───────────────────────────────────────────────────────────────────
  return (
    <div className="tk-root">
      {loading ? <TrackerSkeleton /> : (
        <main className="tk-view">
          {view.name !== 'detail' && (
            <div className="tk-subtabs">
              <button className={view.name === 'today' ? 'sel' : ''} onClick={() => setView({ name: 'today' })}>{tr('todayTab')}</button>
              <button className={view.name === 'stats' ? 'sel' : ''} onClick={() => setView({ name: 'stats' })}>{tr('statsTab')}</button>
            </div>
          )}
          {view.name === 'today' && <TodayView habits={active} calc={calc} today={today} onToggle={toggle} onOpen={id => setView({ name: 'detail', id, back: 'today' })} onAdd={() => setSheet({ open: true, editing: null })} />}
          {view.name === 'stats' && <StatsView active={active} calc={calc} today={today} onOpen={id => setView({ name: 'detail', id, back: 'stats' })} onAdd={() => setSheet({ open: true, editing: null })} onRestore={h => archiveHabit(h, false)} onDelete={deleteHabit} />}
          {view.name === 'detail' && view.id && habits.find(h => h.id === view.id) && (
            <DetailView
              habit={habits.find(h => h.id === view.id)!}
              hc={calc[view.id]}
              today={today}
              onBack={() => setView({ name: view.back || 'today' })}
              onToggle={toggle}
              onEdit={h => setSheet({ open: true, editing: h })}
              onArchive={h => archiveHabit(h, true)}
            />
          )}
        </main>
      )}

      {!loading && view.name !== 'detail' && active.length > 0 && (
        <button className="tk-fab" onClick={() => setSheet({ open: true, editing: null })} aria-label={tr('newHabit')}>+</button>
      )}

      {sheet.open && (
        <HabitSheet
          editing={sheet.editing}
          today={today}
          onClose={() => setSheet({ open: false, editing: null })}
          onSave={saveHabit}
          onDelete={deleteHabit}
        />
      )}

      {toast && <div className="tk-toast">{toast}</div>}
    </div>
  )
}

// ── Скелетон загрузки (повторяет раскладку «Сегодня») ─────────────────────────
function TrackerSkeleton() {
  return (
    <main className="tk-view" aria-busy="true">
      <div className="tk-skel tk-skel-tabs" />
      <div className="tk-page-head">
        <div className="tk-skel tk-skel-line" style={{ width: 140 }} />
        <div className="tk-skel tk-skel-line" style={{ width: 180, height: 26, marginTop: 10 }} />
      </div>
      <div className="tk-skel-hero">
        <div className="tk-skel tk-skel-ring" />
        <div className="tk-skel-main">
          <div className="tk-skel tk-skel-line" style={{ width: '45%', height: 16 }} />
          <div className="tk-skel tk-skel-line" style={{ width: '70%' }} />
        </div>
      </div>
      <div className="tk-list">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="tk-skel-row">
            <div className="tk-skel tk-skel-avatar" />
            <div className="tk-skel-main">
              <div className="tk-skel tk-skel-line" style={{ width: `${62 - i * 8}%`, height: 14 }} />
              <div className="tk-skel tk-skel-line" style={{ width: `${38 + i * 6}%`, height: 10 }} />
            </div>
            <div className="tk-skel tk-skel-circle" />
          </div>
        ))}
      </div>
    </main>
  )
}

// ── Экран «Сегодня» ────────────────────────────────────────────────────────────
function TodayView({ habits, calc, today, onToggle, onOpen, onAdd }: {
  habits: Habit[]; calc: Record<string, HabitCalc>; today: string
  onToggle: (h: Habit, day: string) => void; onOpen: (id: string) => void; onAdd: () => void
}) {
  const tr = useTranslations('tracker')
  const locale = useLocale()
  const dateStr = Dates.parse(today).toLocaleDateString(toIntlLocale(locale as Locale), { weekday: 'long', day: 'numeric', month: 'long' })
  if (!habits.length) {
    return (
      <>
        <div className="tk-page-head" style={{ marginBottom: 10 }}><div className="tk-page-date">{dateStr}</div></div>
        <div className="tk-empty">
          <div className="tk-em">🌱</div>
          <h3>{tr('emptyTitle')}</h3>
          <p>{tr('emptyBody')}</p>
          <button className="tk-btn-primary" onClick={onAdd}>+ {tr('newHabit')}</button>
        </div>
      </>
    )
  }
  const due = habits.filter(h => Stats.isScheduled(calc[h.id], today))
  const rest = habits.filter(h => !Stats.isScheduled(calc[h.id], today))
  const sum = Stats.todaySummary(habits.map(h => calc[h.id]), today)
  const pct = sum.due ? Math.round(sum.done / sum.due * 100) : 100
  const allDone = sum.due > 0 && sum.done === sum.due
  return (
    <>
      <div className="tk-page-head"><div className="tk-page-date">{dateStr}</div><h1 className="tk-page-title">{tr('todayTab')}</h1></div>
      <div className="tk-day-progress">
        <Ring percent={pct} color={allDone ? 'var(--tk-good)' : 'var(--tk-accent)'} />
        <div className="tk-txt">
          <div className="tk-big">{allDone ? tr('allDoneBig') : tr('progressOfTotal', { done: sum.done, due: sum.due })}</div>
          <div className="tk-small">{allDone ? tr('allDoneSmall') : sum.due ? tr('dueCaption') : tr('noneScheduledCaption')}</div>
        </div>
      </div>
      <div className="tk-list">{due.map(h => <HabitRow key={h.id} h={h} hc={calc[h.id]} today={today} onToggle={onToggle} onOpen={onOpen} />)}</div>
      {rest.length > 0 && <>
        <div className="tk-section-label">{tr('otherDaysLabel')}</div>
        <div className="tk-list">{rest.map(h => <HabitRow key={h.id} h={h} hc={calc[h.id]} today={today} onToggle={onToggle} onOpen={onOpen} notToday />)}</div>
      </>}
    </>
  )
}

function HabitRow({ h, hc, today, onToggle, onOpen, notToday }: {
  h: Habit; hc: HabitCalc; today: string; onToggle: (h: Habit, day: string) => void; onOpen: (id: string) => void; notToday?: boolean
}) {
  const tr = useTranslations('tracker')
  const done = h.completions.includes(today)
  const streak = Stats.currentStreak(hc, today)
  const target = h.targetPerDay || 1
  const count = h.counts?.[today] ?? 0
  const multi = target > 1
  return (
    <div className={`tk-habit-row ${done ? 'tk-done' : ''} ${notToday ? 'tk-off tk-not-today' : ''}`}>
      <div className="tk-habit-emoji" style={{ color: ACCENT }} onClick={() => onOpen(h.id)}>{h.emoji}</div>
      <div className="tk-habit-main" onClick={() => onOpen(h.id)}>
        <div className="tk-habit-name">{h.name}</div>
        <div className="tk-habit-meta">
          <span>{Stats.scheduleLabel(hc, tr)}{multi ? ` · ${tr('timesPerDayCount', { count: target })}` : ''}</span>
          <span className={`tk-streak-chip ${streak ? '' : 'tk-zero'}`}>🔥 {streak}</span>
        </div>
      </div>
      <button
        className={`tk-check ${done ? '' : (multi ? 'tk-multi' : 'tk-pending')}`}
        onClick={() => onToggle(h, today)}
        aria-label={tr('markAria')}
        style={multi && !done ? ({ ['--p']: count / target, ['--ring']: ACCENT } as CSSProperties) : undefined}
      >
        {multi && !done
          ? <span key={count} className="tk-count">{count}/{target}</span>
          : <Check />}
      </button>
    </div>
  )
}

// ── Страница привычки ──────────────────────────────────────────────────────────
function DetailView({ habit, hc, today, onBack, onToggle, onEdit, onArchive }: {
  habit: Habit; hc: HabitCalc; today: string
  onBack: () => void; onToggle: (h: Habit, day: string) => void; onEdit: (h: Habit) => void; onArchive: (h: Habit) => void
}) {
  const tr = useTranslations('tracker')
  const trCommon = useTranslations('common')
  const locale = useLocale()
  const intlLocale = toIntlLocale(locale as Locale)
  const cur = Stats.currentStreak(hc, today)
  const best = Stats.bestStreak(hc, today)
  const rate = Stats.completionRate(hc, today)
  const total = Stats.totalDone(hc)
  const done = habit.completions.includes(today)
  const scheduledToday = Stats.isScheduled(hc, today)
  const cells = Stats.heatmap(hc, today, 18)
  const weeks = Stats.weeklyBuckets(hc, today, 9).slice(-9)
  const target = habit.schedule.type === 'count' ? habit.schedule.perWeek : 7
  const maxBar = Math.max(target, ...weeks.map(w => w.count), 1)

  return (
    <>
      <button className="tk-back" onClick={onBack}>
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {trCommon('back')}
      </button>
      <div className="tk-detail-hero">
        <div className="tk-emoji" style={{ background: hexA(ACCENT, .16), color: ACCENT }}>{habit.emoji}</div>
        <div>
          <h1>{habit.name}</h1>
          <div className="tk-sub">{Stats.scheduleLabel(hc, tr)} · {tr('sinceLabel', { date: Dates.humanShort(habit.startDate, intlLocale) })}</div>
        </div>
      </div>

      {(scheduledToday || done) && (() => {
        const target = habit.targetPerDay || 1
        const count = habit.counts?.[today] ?? 0
        if (target > 1) {
          return (
            <button className={done ? 'tk-btn-ghost' : 'tk-btn-primary'} style={{ marginBottom: 20 }} onClick={() => onToggle(habit, today)}>
              {done ? tr('doneTodayMulti', { target }) : tr('markTodayMulti', { count, target })}
            </button>
          )
        }
        return (
          <button className={done ? 'tk-btn-ghost' : 'tk-btn-primary'} style={{ marginBottom: 20 }} onClick={() => onToggle(habit, today)}>
            {done ? tr('doneTodaySingle') : tr('markTodaySingle')}
          </button>
        )
      })()}

      <div className={`tk-desc-card ${habit.description ? '' : 'tk-empty-desc'}`}>
        {habit.description || tr('noDescription')}
      </div>

      <div className="tk-stat-grid">
        <div className="tk-stat-card tk-flame"><div className="tk-k">{tr('currentStreakLabel')}</div><div className="tk-v">{cur} <small>{tr('daysUnit', { count: cur })}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('recordLabel')}</div><div className="tk-v">{best} <small>{tr('daysUnit', { count: best })}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('completionRateLabel')}</div><div className="tk-v">{rate}<small>%</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('totalDoneLabel')}</div><div className="tk-v">{total}</div></div>
      </div>

      <div className="tk-block">
        <h3>{tr('activityTitle')}</h3>
        <p className="tk-hint">{tr('activityHint')}</p>
        <div className="tk-heat">
          {cells.map((c, i) => {
            let bg = 'var(--tk-card-2)'
            if (c.future || c.beforeStart) bg = 'transparent'
            else if (c.done) bg = ACCENT
            else if (c.scheduled) bg = 'color-mix(in srgb, var(--tk-danger) 22%, var(--tk-card-2))'
            if (c.future || c.beforeStart) return <div key={i} className="tk-heat-cell" style={{ background: bg }} />
            return (
              <button key={i} type="button" className="tk-heat-cell tk-heat-cell-tap" title={c.key}
                onClick={() => onToggle(habit, c.key)} style={{ background: bg }} />
            )
          })}
        </div>
        <div className="tk-heat-legend">
          <span>{tr('less')}</span>
          <div className="tk-cells">
            <div className="tk-heat-cell" style={{ background: 'var(--tk-card-2)' }} />
            <div className="tk-heat-cell" style={{ background: hexA(ACCENT, .4) }} />
            <div className="tk-heat-cell" style={{ background: ACCENT }} />
          </div>
          <span>{tr('more')}</span>
        </div>
      </div>

      <div className="tk-block">
        <h3>{tr('byWeeksTitle')}</h3>
        <p className="tk-hint">{tr('byWeeksHint')}</p>
        {weeks.length ? (
          <div className="tk-bars">
            {weeks.map((w, i) => (
              <div key={i} className="tk-bar-col">
                <div className="tk-bar-val">{w.count || ''}</div>
                <div className="tk-bar" style={{ height: `${(w.count / maxBar) * 100}%`, background: `linear-gradient(180deg, ${ACCENT}, ${hexA(ACCENT, .5)})` }} />
                <div className="tk-bar-lbl">{Dates.humanShort(w.weekStart, intlLocale)}</div>
              </div>
            ))}
          </div>
        ) : <p className="tk-hint">{tr('noDataYet')}</p>}
      </div>

      <div className="tk-sheet-actions" style={{ marginTop: 24 }}>
        <button className="tk-btn-ghost" onClick={() => onEdit(habit)}>✏️ {trCommon('edit')}</button>
        <button className="tk-btn-ghost" onClick={() => onArchive(habit)}>📦 {tr('archiveBtn')}</button>
      </div>
    </>
  )
}

// строка завершённой привычки с двойным тапом для удаления
function ArchivedRow({ hc, today, onOpen, onRestore, onDelete }: {
  hc: HabitCalc; today: string; onOpen: (id: string) => void; onRestore: (h: Habit) => void; onDelete: (h: Habit) => void
}) {
  const tr = useTranslations('tracker')
  const trCommon = useTranslations('common')
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="tk-rank-row">
      <div className="tk-emoji" style={{ background: 'var(--tk-card-2)', color: 'var(--tk-muted)' }}>{hc.emoji}</div>
      <div className="tk-nm" onClick={() => onOpen(hc.id)}><b>{hc.name}</b><span>{tr('archivedStats', { best: Stats.bestStreak(hc, today), total: Stats.totalDone(hc) })}</span></div>
      {confirmDel ? (
        <button className="tk-pct" style={{ color: 'var(--tk-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
          onClick={() => onDelete({ id: hc.id } as Habit)}>{tr('confirmShort')}</button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="tk-pct" style={{ color: 'var(--tk-accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
            onClick={() => onRestore({ id: hc.id } as Habit)}>{tr('restore')}</button>
          <button aria-label={trCommon('delete')} style={{ color: 'var(--tk-faint)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}
            onClick={() => setConfirmDel(true)}>🗑</button>
        </div>
      )}
    </div>
  )
}

// ── Экран «Статистика» ─────────────────────────────────────────────────────────
function StatsView({ active, calc, today, onOpen, onAdd, onRestore, onDelete }: {
  active: Habit[]; calc: Record<string, HabitCalc>; today: string
  onOpen: (id: string) => void; onAdd: () => void; onRestore: (h: Habit) => void; onDelete: (h: Habit) => void
}) {
  const tr = useTranslations('tracker')
  const activeCalc = active.map(h => calc[h.id])
  const archivedList = Object.values(calc).filter(hc => hc.archived)

  if (!active.length && !archivedList.length) {
    return (
      <>
        <div className="tk-page-head"><h1 className="tk-page-title">{tr('statsTab')}</h1></div>
        <div className="tk-empty"><div className="tk-em">📊</div><h3>{tr('emptyStatsTitle')}</h3><p>{tr('emptyStatsBody')}</p>
          <button className="tk-btn-primary" onClick={onAdd}>+ {tr('newHabit')}</button></div>
      </>
    )
  }

  const totalDone = activeCalc.reduce((s, h) => s + Stats.totalDone(h), 0)
  const g = Stats.globalStreak(activeCalc, today)
  const sum = Stats.todaySummary(activeCalc, today)
  const ranked = active.map(h => ({ h, hc: calc[h.id], rate: Stats.completionRate(calc[h.id], today), streak: Stats.currentStreak(calc[h.id], today) }))
    .sort((a, b) => b.streak - a.streak || b.rate - a.rate)

  return (
    <>
      <div className="tk-page-head" style={{ marginBottom: 14 }}>
        <div className="tk-page-sub" style={{ marginTop: 0 }}>{tr('habitsCountLine', { count: active.length, total: totalDone })}</div>
      </div>

      <div className="tk-stat-grid">
        <div className="tk-stat-card tk-flame"><div className="tk-k">{tr('globalStreakLabel')}</div><div className="tk-v">{g.current} <small>{tr('daysUnit', { count: g.current })}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('bestStreakLabel')}</div><div className="tk-v">{g.best} <small>{tr('daysUnit', { count: g.best })}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('todayLabel')}</div><div className="tk-v">{sum.done}<small>/{sum.due}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">{tr('totalMarksLabel')}</div><div className="tk-v">{totalDone}</div></div>
      </div>
      <p className="tk-hint" style={{ margin: '-8px 4px 20px' }}>🔥 <b style={{ color: 'var(--tk-text)' }}>{tr('globalStreakName')}</b> — {tr('globalStreakHint')}</p>

      {active.length > 0 && (
        <div className="tk-block">
          <h3>{tr('yourHabits')}</h3>
          <p className="tk-hint">{tr('sortedByStreak')}</p>
          {ranked.map(r => (
            <div key={r.h.id} className="tk-rank-row" onClick={() => onOpen(r.h.id)}>
              <div className="tk-emoji" style={{ background: hexA(ACCENT, .16), color: ACCENT }}>{r.h.emoji}</div>
              <div className="tk-nm">
                <b>{r.h.name}</b>
                <span>🔥 {r.streak} · {Stats.scheduleLabel(r.hc, tr)}</span>
                <div className="tk-mini-track"><div className="tk-mini-fill" style={{ width: `${r.rate}%`, background: ACCENT }} /></div>
              </div>
              <div className="tk-pct" style={{ color: ACCENT }}>{r.rate}%</div>
            </div>
          ))}
        </div>
      )}

      {archivedList.length > 0 && (
        <div className="tk-block">
          <h3>{tr('archivedTitle')}</h3>
          <p className="tk-hint">{tr('archivedHint')}</p>
          {archivedList.map(hc => (
            <ArchivedRow key={hc.id} hc={hc} today={today} onOpen={onOpen} onRestore={onRestore} onDelete={onDelete} />
          ))}
        </div>
      )}
    </>
  )
}

// ── Форма привычки (шторка) ────────────────────────────────────────────────────
function HabitSheet({ editing, today, onClose, onSave, onDelete }: {
  editing: Habit | null; today: string
  onClose: () => void; onSave: (data: any, editing: Habit | null) => void; onDelete: (h: Habit) => void
}) {
  const tr = useTranslations('tracker')
  const trCommon = useTranslations('common')
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '✅')
  const color = editing?.color ?? ACCENT
  const [schedule, setSchedule] = useState<Schedule>(editing?.schedule ?? { type: 'daily' })
  const [startDate, setStartDate] = useState(editing?.startDate ?? today)
  const [targetPerDay, setTargetPerDay] = useState(editing?.targetPerDay ?? 1)
  const [confirmDel, setConfirmDel] = useState(false)

  const submit = () => {
    if (!name.trim()) return
    if (schedule.type === 'weekdays' && (!schedule.days || !schedule.days.length)) return
    onSave({ name: name.trim(), description: description.trim(), emoji, color, schedule, startDate, targetPerDay }, editing)
  }

  const days = schedule.type === 'weekdays' ? schedule.days : []
  const perWeek = schedule.type === 'count' ? schedule.perWeek : 3

  return (
    <div className="tk-sheet">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-sheet-card">
        <div className="tk-sheet-grab" />
        <h2>{editing ? tr('editHabitTitle') : tr('newHabit')}</h2>

        <div className="tk-field">
          <label>{tr('nameLabel')}</label>
          <input className="tk-input" maxLength={30} placeholder={tr('namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="tk-field">
          <label>{tr('iconLabel')}</label>
          <div className="tk-emoji-picker">
            {EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === emoji ? 'tk-sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}
          </div>
        </div>

        <div className="tk-field">
          <label>{tr('frequencyLabel')}</label>
          <div className="tk-seg">
            <button type="button" className={schedule.type === 'daily' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'daily' })}>{tr('everyDay')}</button>
            <button type="button" className={schedule.type === 'weekdays' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'weekdays', days: schedule.type === 'weekdays' ? schedule.days : [1,3,5] })}>{tr('weekdaysOption')}</button>
            <button type="button" className={schedule.type === 'count' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'count', perWeek: schedule.type === 'count' ? schedule.perWeek : 3 })}>{tr('countPerWeekOption')}</button>
          </div>
        </div>

        <div className="tk-field">
          <label>{tr('timesPerDayLabel')}</label>
          <div className="tk-stepper">
            <button type="button" onClick={() => setTargetPerDay(Math.max(1, targetPerDay - 1))}>−</button>
            <span className="tk-val">{targetPerDay}</span>
            <button type="button" onClick={() => setTargetPerDay(Math.min(20, targetPerDay + 1))}>+</button>
            <span className="tk-cap">{targetPerDay === 1 ? tr('onceLabel') : tr('timesPerDayCount', { count: targetPerDay })}</span>
          </div>
        </div>

        {schedule.type === 'weekdays' && (
          <div className="tk-field">
            <label>{tr('whichDaysLabel')}</label>
            <div className="tk-weekdays">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <button key={i} type="button" className={`tk-wd ${days.includes(i) ? 'tk-sel' : ''}`}
                  onClick={() => setSchedule({ type: 'weekdays', days: days.includes(i) ? days.filter(d => d !== i) : [...days, i] })}>{tr(`weekdayShort.${i}`)}</button>
              ))}
            </div>
          </div>
        )}

        {schedule.type === 'count' && (
          <div className="tk-field">
            <label>{tr('timesPerWeekLabel')}</label>
            <div className="tk-stepper">
              <button type="button" onClick={() => setSchedule({ type: 'count', perWeek: Math.max(1, perWeek - 1) })}>−</button>
              <span className="tk-val">{perWeek}</span>
              <button type="button" onClick={() => setSchedule({ type: 'count', perWeek: Math.min(7, perWeek + 1) })}>+</button>
              <span className="tk-cap">{tr('perWeekUnit', { count: perWeek })}</span>
            </div>
          </div>
        )}

        <div className="tk-field">
          <label>{tr('descriptionLabel')}</label>
          <textarea className="tk-textarea" placeholder={tr('descriptionPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="tk-field">
          <label>{tr('startDateLabel')}</label>
          <input className="tk-input" type="date" value={startDate} max={today} onChange={e => setStartDate(e.target.value)} />
        </div>

        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" onClick={submit}>{editing ? trCommon('save') : tr('createHabitBtn')}</button>
          {editing
            ? <button className={`tk-btn-ghost tk-btn-danger ${confirmDel ? 'tk-armed' : ''}`} onClick={() => confirmDel ? onDelete(editing) : setConfirmDel(true)}>
                {confirmDel ? trCommon('confirmDeleteAgain') : tr('deleteForeverBtn')}
              </button>
            : <button className="tk-btn-ghost" onClick={onClose}>{trCommon('cancel')}</button>}
        </div>
      </div>
    </div>
  )
}
