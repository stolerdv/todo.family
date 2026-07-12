'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task, Section, CalEvent } from '@/lib/db'
import type { Habit } from '@/lib/tracker'
import { Dates, Stats, toCalc } from '@/lib/trackerStats'
import VoiceAssistant from '@/components/VoiceAssistant'

const DONE_STATES = ['Done', 'Cancelled']

export default function TodayPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)

  const today = useMemo(() => Dates.todayKey(), [])

  useEffect(() => {
    Promise.all([
      fetch('/api/tracker/habits').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/sections').then(r => r.json()),
      fetch('/api/events').then(r => r.json()),
    ]).then(([h, t, s, e]) => {
      setHabits(Array.isArray(h) ? h : [])
      setTasks(Array.isArray(t) ? t : [])
      setSections(Array.isArray(s) ? s : [])
      setEvents(Array.isArray(e) ? e : [])
    }).finally(() => setLoading(false))
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

  const dueHabits = useMemo(
    () => habits.filter(h => !h.archived && Stats.isScheduled(toCalc(h), today)),
    [habits, today],
  )
  const activeTasks = useMemo(() => tasks.filter(t => !DONE_STATES.includes(t.state)), [tasks])
  const overdue = useMemo(
    () => activeTasks.filter(t => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [activeTasks, today],
  )
  const dueToday = useMemo(() => activeTasks.filter(t => t.dueDate === today), [activeTasks, today])
  const upcomingTasks = useMemo(
    () => activeTasks.filter(t => t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6),
    [activeTasks, today],
  )
  const eventsToday = useMemo(
    () => events.filter(e => e.day === today).sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')),
    [events, today],
  )
  const upcomingEvents = useMemo(() => {
    const limit = Dates.addDays(today, 6)
    return events.filter(e => e.day > today && e.day <= limit).sort((a, b) => a.day === b.day ? (a.time || '00:00').localeCompare(b.time || '00:00') : a.day.localeCompare(b.day)).slice(0, 6)
  }, [events, today])

  const sectionName = (id: string) => sections.find(s => s.id === id)?.name ?? ''
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
  }, [])
  const dateLabel = useMemo(() => {
    const s = Dates.parse(today).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [today])

  const nothingPlanned = dueHabits.length === 0 && overdue.length === 0 && dueToday.length === 0
    && eventsToday.length === 0 && upcomingTasks.length === 0 && upcomingEvents.length === 0

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-5 space-y-4">
        <div className="h-6 w-40 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
        <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 py-5 pb-28 space-y-6">
      <div>
        <p className="text-accent-400 text-sm font-semibold">{greeting}</p>
        <h1 className="text-xl font-bold text-white">{dateLabel}</h1>
      </div>

      {nothingPlanned && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-2">🌤</span>
          <p className="text-gray-400 text-sm">На сегодня ничего не запланировано</p>
          <p className="text-gray-700 text-xs mt-1">Продиктуй задачу или событие через чат внизу справа</p>
        </div>
      )}

      {dueHabits.length > 0 && (
        <Section title="Привычки на сегодня" count={dueHabits.length}>
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

      {overdue.length > 0 && (
        <Section title="Просрочено" count={overdue.length} accent="red">
          <div className="space-y-1.5">
            {overdue.map(t => <TaskRow key={t.id} t={t} sectionName={sectionName(t.sectionId)} today={today} onDone={markTaskDone} />)}
          </div>
        </Section>
      )}

      {dueToday.length > 0 && (
        <Section title="Сегодня" count={dueToday.length}>
          <div className="space-y-1.5">
            {dueToday.map(t => <TaskRow key={t.id} t={t} sectionName={sectionName(t.sectionId)} today={today} onDone={markTaskDone} />)}
          </div>
        </Section>
      )}

      {eventsToday.length > 0 && (
        <Section title="События сегодня" count={eventsToday.length}>
          <div className="space-y-1.5">
            {eventsToday.map(e => <EventRow key={e.id} e={e} />)}
          </div>
        </Section>
      )}

      {(upcomingTasks.length > 0 || upcomingEvents.length > 0) && (
        <Section title="Ближайшие дни">
          <div className="space-y-1.5">
            {upcomingEvents.map(e => <EventRow key={e.id} e={e} showDate />)}
            {upcomingTasks.map(t => <TaskRow key={t.id} t={t} sectionName={sectionName(t.sectionId)} today={today} onDone={markTaskDone} showDate />)}
          </div>
        </Section>
      )}

      <VoiceAssistant />
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

function TaskRow({ t, sectionName, today, onDone, showDate }: { t: Task; sectionName: string; today: string; onDone: (t: Task) => void; showDate?: boolean }) {
  const overdueDays = t.dueDate && t.dueDate < today ? Math.round((Dates.parse(today).getTime() - Dates.parse(t.dueDate).getTime()) / 86400000) : 0
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <button onClick={() => onDone(t)} aria-label="Отметить выполненной"
        className="shrink-0 w-6 h-6 rounded-full border-2 border-gray-600 hover:border-accent-400 transition" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{t.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {sectionName && <span className="text-xs text-gray-600">{sectionName}</span>}
          {showDate && t.dueDate && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.dueDate < today ? 'text-red-400 bg-red-500/10' : 'text-gray-500'}`}>
              {Dates.humanShort(t.dueDate)}
            </span>
          )}
          {!showDate && overdueDays > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full text-red-400 bg-red-500/10">просрочено {overdueDays}д</span>}
        </div>
      </div>
    </div>
  )
}

function EventRow({ e, showDate }: { e: CalEvent; showDate?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <span className="text-xs font-bold text-accent-400 tabular-nums w-11 shrink-0">{e.time || 'весь день'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{e.title}</p>
        {(e.endTime || e.note || showDate) && (
          <p className="text-xs text-gray-500 truncate">
            {showDate ? Dates.humanShort(e.day) : ''}{showDate && (e.endTime || e.note) ? ' · ' : ''}
            {e.endTime ? `до ${e.endTime}` : ''}{e.endTime && e.note ? ' · ' : ''}{e.note}
          </p>
        )}
      </div>
    </div>
  )
}
