'use client'

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import type { Habit, Schedule } from '@/lib/tracker'
import { Dates, Stats, toCalc, plural, hexA, type HabitCalc } from '@/lib/trackerStats'
import './tracker.css'

const EMOJIS = ['✅','💪','🏃','📚','💧','🧘','🛌','🥗','☀️','🚭','🧠','✍️','🎯','🎸','💊','🦷','🚶','🏊','🚴','🍎','☕','🌿','📵','💰','🧹','❤️','🙏','🎨','🇬🇧','⏰']
const COLORS = ['#6d8bff','#9a7bff','#3ddc97','#ffb454','#ff6b6b','#ff8a3d','#4dd0e1','#f06292','#a1e34a','#b0bec5']

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
      showToast('Нет сети — не сохранилось')
      setHabits(prev => prev.map(x => x.id === h.id ? apply(x, cur) : x))
    }
  }, [showToast])

  const saveHabit = useCallback(async (data: any, editing: Habit | null) => {
    if (editing) {
      setHabits(prev => prev.map(x => x.id === editing.id ? { ...x, ...data } : x))
      await fetch(`/api/tracker/habits/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      showToast('Сохранено')
    } else {
      const res = await fetch('/api/tracker/habits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const created: Habit = await res.json()
      created.completions = created.completions || []
      setHabits(prev => [...prev, created])
      showToast('Привычка создана 🎉')
    }
    setSheet({ open: false, editing: null })
  }, [showToast])

  const archiveHabit = useCallback(async (h: Habit, archived: boolean) => {
    setHabits(prev => prev.map(x => x.id === h.id ? { ...x, archived } : x))
    await fetch(`/api/tracker/habits/${h.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    })
    showToast(archived ? 'Привычка завершена 📦' : 'Возвращена')
    if (archived) setView({ name: 'today' })
  }, [showToast])

  // подтверждение — в UI (двойной тап), а не через confirm() (в установленном PWA он не всплывает)
  const deleteHabit = useCallback(async (h: Habit) => {
    setHabits(prev => prev.filter(x => x.id !== h.id))
    await fetch(`/api/tracker/habits/${h.id}`, { method: 'DELETE' })
    setSheet({ open: false, editing: null })
    setView({ name: 'today' })
    showToast('Удалено')
  }, [showToast])

  // ── рендер ───────────────────────────────────────────────────────────────────
  return (
    <div className="tk-root">
      {loading ? <TrackerSkeleton /> : (
        <main className="tk-view">
          {view.name !== 'detail' && (
            <div className="tk-subtabs">
              <button className={view.name === 'today' ? 'sel' : ''} onClick={() => setView({ name: 'today' })}>Сегодня</button>
              <button className={view.name === 'stats' ? 'sel' : ''} onClick={() => setView({ name: 'stats' })}>Статистика</button>
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
        <button className="tk-fab" onClick={() => setSheet({ open: true, editing: null })} aria-label="Новая привычка">+</button>
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
  const dateStr = Dates.parse(today).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  if (!habits.length) {
    return (
      <>
        <div className="tk-page-head" style={{ marginBottom: 10 }}><div className="tk-page-date">{dateStr}</div></div>
        <div className="tk-empty">
          <div className="tk-em">🌱</div>
          <h3>Начни первую привычку</h3>
          <p>Добавь то, что хочешь делать регулярно — и просто ставь галочку каждый день.</p>
          <button className="tk-btn-primary" onClick={onAdd}>+ Новая привычка</button>
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
      <div className="tk-page-head"><div className="tk-page-date">{dateStr}</div><h1 className="tk-page-title">Сегодня</h1></div>
      <div className="tk-day-progress">
        <Ring percent={pct} color={allDone ? 'var(--tk-good)' : 'var(--tk-accent)'} />
        <div className="tk-txt">
          <div className="tk-big">{allDone ? 'Всё готово 🎉' : `${sum.done} из ${sum.due}`}</div>
          <div className="tk-small">{allDone ? 'Отличная работа сегодня!' : sum.due ? 'привычек выполнено сегодня' : 'на сегодня ничего не запланировано'}</div>
        </div>
      </div>
      <div className="tk-list">{due.map(h => <HabitRow key={h.id} h={h} hc={calc[h.id]} today={today} onToggle={onToggle} onOpen={onOpen} />)}</div>
      {rest.length > 0 && <>
        <div className="tk-section-label">На другие дни</div>
        <div className="tk-list">{rest.map(h => <HabitRow key={h.id} h={h} hc={calc[h.id]} today={today} onToggle={onToggle} onOpen={onOpen} notToday />)}</div>
      </>}
    </>
  )
}

function HabitRow({ h, hc, today, onToggle, onOpen, notToday }: {
  h: Habit; hc: HabitCalc; today: string; onToggle: (h: Habit, day: string) => void; onOpen: (id: string) => void; notToday?: boolean
}) {
  const done = h.completions.includes(today)
  const streak = Stats.currentStreak(hc, today)
  const target = h.targetPerDay || 1
  const count = h.counts?.[today] ?? 0
  const multi = target > 1
  return (
    <div className={`tk-habit-row ${done ? 'tk-done' : ''} ${notToday ? 'tk-off tk-not-today' : ''}`}>
      <div className="tk-habit-emoji" style={{ color: h.color }} onClick={() => onOpen(h.id)}>{h.emoji}</div>
      <div className="tk-habit-main" onClick={() => onOpen(h.id)}>
        <div className="tk-habit-name">{h.name}</div>
        <div className="tk-habit-meta">
          <span>{Stats.scheduleLabel(hc)}{multi ? ` · ${target} раза в день` : ''}</span>
          <span className={`tk-streak-chip ${streak ? '' : 'tk-zero'}`}>🔥 {streak}</span>
        </div>
      </div>
      <button
        className={`tk-check ${done ? '' : (multi ? 'tk-multi' : 'tk-pending')}`}
        onClick={() => onToggle(h, today)}
        aria-label="Отметить"
        style={multi && !done ? ({ ['--p']: count / target, ['--ring']: h.color } as CSSProperties) : undefined}
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
        Назад
      </button>
      <div className="tk-detail-hero">
        <div className="tk-emoji" style={{ background: hexA(habit.color, .16), color: habit.color }}>{habit.emoji}</div>
        <div>
          <h1>{habit.name}</h1>
          <div className="tk-sub">{Stats.scheduleLabel(hc)} · с {Dates.humanShort(habit.startDate)}</div>
        </div>
      </div>

      {(scheduledToday || done) && (() => {
        const target = habit.targetPerDay || 1
        const count = habit.counts?.[today] ?? 0
        if (target > 1) {
          return (
            <button className={done ? 'tk-btn-ghost' : 'tk-btn-primary'} style={{ marginBottom: 20 }} onClick={() => onToggle(habit, today)}>
              {done ? `✓ Сегодня ${target}/${target} — сбросить` : `Отметить за сегодня · ${count}/${target}`}
            </button>
          )
        }
        return (
          <button className={done ? 'tk-btn-ghost' : 'tk-btn-primary'} style={{ marginBottom: 20 }} onClick={() => onToggle(habit, today)}>
            {done ? '✓ Сделано сегодня — отменить' : 'Отметить за сегодня'}
          </button>
        )
      })()}

      <div className={`tk-desc-card ${habit.description ? '' : 'tk-empty-desc'}`}>
        {habit.description || 'Описание не заполнено. Нажми «Изменить», чтобы добавить — зачем эта привычка, как её выполнять.'}
      </div>

      <div className="tk-stat-grid">
        <div className="tk-stat-card tk-flame"><div className="tk-k">🔥 Текущая серия</div><div className="tk-v">{cur} <small>{plural(cur,'день','дня','дней')}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">🏆 Рекорд</div><div className="tk-v">{best} <small>{plural(best,'день','дня','дней')}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">🎯 Выполнение</div><div className="tk-v">{rate}<small>%</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">✅ Всего</div><div className="tk-v">{total}</div></div>
      </div>

      <div className="tk-block">
        <h3>Активность</h3>
        <p className="tk-hint">Последние ~4 месяца. Ярче — выполнено.</p>
        <div className="tk-heat">
          {cells.map((c, i) => {
            let bg = 'var(--tk-card-2)'
            if (c.future || c.beforeStart) bg = 'transparent'
            else if (c.done) bg = habit.color
            else if (c.scheduled) bg = 'color-mix(in srgb, var(--tk-danger) 22%, var(--tk-card-2))'
            return <div key={i} className="tk-heat-cell" title={c.key} style={{ background: bg }} />
          })}
        </div>
        <div className="tk-heat-legend">
          <span>меньше</span>
          <div className="tk-cells">
            <div className="tk-heat-cell" style={{ background: 'var(--tk-card-2)' }} />
            <div className="tk-heat-cell" style={{ background: hexA(habit.color, .4) }} />
            <div className="tk-heat-cell" style={{ background: habit.color }} />
          </div>
          <span>больше</span>
        </div>
      </div>

      <div className="tk-block">
        <h3>По неделям</h3>
        <p className="tk-hint">Сколько раз выполнено за каждую из последних недель.</p>
        {weeks.length ? (
          <div className="tk-bars">
            {weeks.map((w, i) => (
              <div key={i} className="tk-bar-col">
                <div className="tk-bar-val">{w.count || ''}</div>
                <div className="tk-bar" style={{ height: `${(w.count / maxBar) * 100}%`, background: `linear-gradient(180deg, ${habit.color}, ${hexA(habit.color, .5)})` }} />
                <div className="tk-bar-lbl">{Dates.humanShort(w.weekStart)}</div>
              </div>
            ))}
          </div>
        ) : <p className="tk-hint">Пока нет данных.</p>}
      </div>

      <div className="tk-sheet-actions" style={{ marginTop: 24 }}>
        <button className="tk-btn-ghost" onClick={() => onEdit(habit)}>✏️ Изменить</button>
        <button className="tk-btn-ghost" onClick={() => onArchive(habit)}>📦 Завершить привычку</button>
      </div>
    </>
  )
}

// строка завершённой привычки с двойным тапом для удаления
function ArchivedRow({ hc, today, onOpen, onRestore, onDelete }: {
  hc: HabitCalc; today: string; onOpen: (id: string) => void; onRestore: (h: Habit) => void; onDelete: (h: Habit) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="tk-rank-row">
      <div className="tk-emoji" style={{ background: 'var(--tk-card-2)', color: 'var(--tk-muted)' }}>{hc.emoji}</div>
      <div className="tk-nm" onClick={() => onOpen(hc.id)}><b>{hc.name}</b><span>Рекорд: 🔥 {Stats.bestStreak(hc, today)} · {Stats.totalDone(hc)} отметок</span></div>
      {confirmDel ? (
        <button className="tk-pct" style={{ color: 'var(--tk-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
          onClick={() => onDelete({ id: hc.id } as Habit)}>Точно?</button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="tk-pct" style={{ color: 'var(--tk-accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
            onClick={() => onRestore({ id: hc.id } as Habit)}>Вернуть</button>
          <button aria-label="Удалить" style={{ color: 'var(--tk-faint)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}
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
  const activeCalc = active.map(h => calc[h.id])
  const archivedList = Object.values(calc).filter(hc => hc.archived)

  if (!active.length && !archivedList.length) {
    return (
      <>
        <div className="tk-page-head"><h1 className="tk-page-title">Статистика</h1></div>
        <div className="tk-empty"><div className="tk-em">📊</div><h3>Пока пусто</h3><p>Добавь привычки и отмечай их — здесь появятся серии и графики.</p>
          <button className="tk-btn-primary" onClick={onAdd}>+ Новая привычка</button></div>
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
        <div className="tk-page-sub" style={{ marginTop: 0 }}>{active.length} {plural(active.length,'привычка','привычки','привычек')} · {totalDone} отметок всего</div>
      </div>

      <div className="tk-stat-grid">
        <div className="tk-stat-card tk-flame"><div className="tk-k">🔥 Серия без пропусков</div><div className="tk-v">{g.current} <small>{plural(g.current,'день','дня','дней')}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">🏆 Рекорд серии</div><div className="tk-v">{g.best} <small>{plural(g.best,'день','дня','дней')}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">📅 Сегодня</div><div className="tk-v">{sum.done}<small>/{sum.due}</small></div></div>
        <div className="tk-stat-card"><div className="tk-k">✅ Всего отметок</div><div className="tk-v">{totalDone}</div></div>
      </div>
      <p className="tk-hint" style={{ margin: '-8px 4px 20px' }}>🔥 <b style={{ color: 'var(--tk-text)' }}>Серия без пропусков</b> — сколько дней подряд ты закрываешь все привычки, запланированные на день. Держишь темп — серия растёт.</p>

      {active.length > 0 && (
        <div className="tk-block">
          <h3>Твои привычки</h3>
          <p className="tk-hint">Отсортировано по текущей серии.</p>
          {ranked.map(r => (
            <div key={r.h.id} className="tk-rank-row" onClick={() => onOpen(r.h.id)}>
              <div className="tk-emoji" style={{ background: hexA(r.h.color, .16), color: r.h.color }}>{r.h.emoji}</div>
              <div className="tk-nm">
                <b>{r.h.name}</b>
                <span>🔥 {r.streak} · {Stats.scheduleLabel(r.hc)}</span>
                <div className="tk-mini-track"><div className="tk-mini-fill" style={{ width: `${r.rate}%`, background: r.h.color }} /></div>
              </div>
              <div className="tk-pct" style={{ color: r.h.color }}>{r.rate}%</div>
            </div>
          ))}
        </div>
      )}

      {archivedList.length > 0 && (
        <div className="tk-block">
          <h3>Завершённые</h3>
          <p className="tk-hint">Привычки, которые ты закончил. Память сохранена.</p>
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
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '✅')
  const [color, setColor] = useState(editing?.color ?? COLORS[0])
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
        <h2>{editing ? 'Изменить привычку' : 'Новая привычка'}</h2>

        <div className="tk-field">
          <label>Название (1–3 слова)</label>
          <input className="tk-input" maxLength={30} placeholder="Например: Вода" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="tk-field">
          <label>Иконка</label>
          <div className="tk-emoji-picker">
            {EMOJIS.map(e => <button key={e} type="button" className={`tk-emoji-opt ${e === emoji ? 'tk-sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}
          </div>
        </div>

        <div className="tk-field">
          <label>Цвет</label>
          <div className="tk-color-row">
            {COLORS.map(c => <button key={c} type="button" className={`tk-color-dot ${c === color ? 'tk-sel' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          </div>
        </div>

        <div className="tk-field">
          <label>Как часто</label>
          <div className="tk-seg">
            <button type="button" className={schedule.type === 'daily' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'daily' })}>Каждый день</button>
            <button type="button" className={schedule.type === 'weekdays' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'weekdays', days: schedule.type === 'weekdays' ? schedule.days : [1,3,5] })}>Дни недели</button>
            <button type="button" className={schedule.type === 'count' ? 'tk-sel' : ''} onClick={() => setSchedule({ type: 'count', perWeek: schedule.type === 'count' ? schedule.perWeek : 3 })}>N в неделю</button>
          </div>
        </div>

        <div className="tk-field">
          <label>Сколько раз в день</label>
          <div className="tk-stepper">
            <button type="button" onClick={() => setTargetPerDay(Math.max(1, targetPerDay - 1))}>−</button>
            <span className="tk-val">{targetPerDay}</span>
            <button type="button" onClick={() => setTargetPerDay(Math.min(20, targetPerDay + 1))}>+</button>
            <span className="tk-cap">{targetPerDay === 1 ? 'один раз' : `${targetPerDay} ${plural(targetPerDay,'раз','раза','раз')} в день`}</span>
          </div>
        </div>

        {schedule.type === 'weekdays' && (
          <div className="tk-field">
            <label>В какие дни</label>
            <div className="tk-weekdays">
              {Dates.weekdayNames.map((n, i) => (
                <button key={i} type="button" className={`tk-wd ${days.includes(i) ? 'tk-sel' : ''}`}
                  onClick={() => setSchedule({ type: 'weekdays', days: days.includes(i) ? days.filter(d => d !== i) : [...days, i] })}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {schedule.type === 'count' && (
          <div className="tk-field">
            <label>Сколько раз в неделю</label>
            <div className="tk-stepper">
              <button type="button" onClick={() => setSchedule({ type: 'count', perWeek: Math.max(1, perWeek - 1) })}>−</button>
              <span className="tk-val">{perWeek}</span>
              <button type="button" onClick={() => setSchedule({ type: 'count', perWeek: Math.min(7, perWeek + 1) })}>+</button>
              <span className="tk-cap">{plural(perWeek,'раз','раза','раз')} в неделю</span>
            </div>
          </div>
        )}

        <div className="tk-field">
          <label>Описание (необязательно)</label>
          <textarea className="tk-textarea" placeholder="О чём эта привычка, зачем она, как выполняется…" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="tk-field">
          <label>День начала</label>
          <input className="tk-input" type="date" value={startDate} max={today} onChange={e => setStartDate(e.target.value)} />
        </div>

        <div className="tk-sheet-actions">
          <button className="tk-btn-primary" onClick={submit}>{editing ? 'Сохранить' : 'Создать привычку'}</button>
          {editing
            ? <button className={`tk-btn-ghost tk-btn-danger ${confirmDel ? 'tk-armed' : ''}`} onClick={() => confirmDel ? onDelete(editing) : setConfirmDel(true)}>
                {confirmDel ? 'Точно удалить? Нажми ещё раз' : '🗑 Удалить навсегда'}
              </button>
            : <button className="tk-btn-ghost" onClick={onClose}>Отмена</button>}
        </div>
      </div>
    </div>
  )
}
