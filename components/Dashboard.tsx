'use client'

import { useState, useMemo } from 'react'
import type { Task, Section, Subtask, CalEvent } from '@/lib/db'

type EventDraft = { day: string; time: string; endTime: string; title: string; note: string }

const PRIORITY_COLOR: Record<string, string> = {
  Critical: 'bg-red-400',
  High:     'bg-orange-400',
  Medium:   'bg-yellow-400',
  Low:      'bg-gray-400',
  None:     'bg-gray-600',
}
const PRIORITY_RING: Record<string, string> = {
  Critical: 'border-red-500/40 bg-red-500/10',
  High:     'border-orange-500/40 bg-orange-500/10',
  Medium:   'border-yellow-500/40 bg-yellow-500/10',
  Low:      'border-gray-500/40 bg-gray-500/10',
  None:     'border-gray-700 bg-gray-800/40',
}
const DONE_STATES = ['Done', 'Cancelled']
const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, None: 4 }

interface Props {
  tasks: Task[]
  sections: Section[]
  subtasks: Subtask[]
  events: CalEvent[]
  onTaskClick: (taskId: string, sectionId: string) => void
  onAddEvent: (draft: EventDraft) => void
  onDeleteEvent: (id: string) => void
}

export default function Dashboard({ tasks, sections, subtasks, events, onTaskClick, onAddEvent, onDeleteEvent }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sheetDay, setSheetDay] = useState<string | null>(null) // открытая шторка добавления события

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) (map[e.day] ??= []).push(e)
    return map
  }, [events])

  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().slice(0, 10)

  const activeTasks = tasks.filter(t => !DONE_STATES.includes(t.state))

  // Calendar helpers
  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7

  // Buckets
  const overdue  = activeTasks.filter(t => t.dueDate && t.dueDate < todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const dueToday = activeTasks.filter(t => t.dueDate === todayStr)
  const upcoming = activeTasks.filter(t => t.dueDate > todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8)
  const prioritized = activeTasks
    .filter(t => t.priority !== 'None')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 12)

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : []

  function dayStr(cellIdx: number): string | null {
    const dayNum = cellIdx - startDow + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  }

  function TaskPill({ task, showDate = false }: { task: Task; showDate?: boolean }) {
    const sectionName = sections.find(s => s.id === task.sectionId)?.name ?? ''
    const { total, done } = { total: subtasks.filter(s => s.taskId === task.id).length, done: subtasks.filter(s => s.taskId === task.id && s.done).length }

    return (
      <button
        onClick={() => onTaskClick(task.id, task.sectionId)}
        className={`w-full text-left p-3 rounded-xl border transition hover:brightness-110 active:scale-[0.98] ${PRIORITY_RING[task.priority]}`}
      >
        <div className="flex items-start gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${PRIORITY_COLOR[task.priority]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-600">{sectionName}</span>
              {showDate && task.dueDate && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  task.dueDate < todayStr ? 'text-red-400 bg-red-500/10' :
                  task.dueDate === todayStr ? 'text-orange-400 bg-orange-500/10' : 'text-gray-500'
                }`}>
                  {task.dueDate === todayStr ? 'сегодня' :
                   task.dueDate < todayStr ? `просрочено ${Math.round((today.getTime() - new Date(task.dueDate).getTime()) / 86400000)}д` :
                   new Date(task.dueDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {total > 0 && (
                <span className="text-xs text-gray-700">{done}/{total}</span>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

  // Stats
  const totalActive  = activeTasks.length
  const overdueCount = overdue.length
  const criticalCount = activeTasks.filter(t => t.priority === 'Critical').length

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-5">

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Активных задач', value: totalActive,    color: 'text-accent-400', bg: 'bg-accent-500/10 border-accent-500/20' },
          { label: 'Просрочено',     value: overdueCount,   color: overdueCount > 0 ? 'text-red-400' : 'text-gray-400', bg: overdueCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/40 border-gray-700/40' },
          { label: 'Сдать сегодня',  value: dueToday.length, color: dueToday.length > 0 ? 'text-orange-400' : 'text-gray-400', bg: dueToday.length > 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-gray-800/40 border-gray-700/40' },
          { label: 'Критичных',      value: criticalCount,  color: criticalCount > 0 ? 'text-red-400' : 'text-gray-400', bg: criticalCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/40 border-gray-700/40' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Calendar */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition">‹</button>
            <h2 className="text-sm font-semibold">{monthNames[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition">›</button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 mb-2">
            {dayNames.map(d => (
              <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: totalCells }).map((_, i) => {
              const ds = dayStr(i)
              if (!ds) return <div key={i} />
              const dayEvents = eventsByDay[ds] ?? []
              const isToday = ds === todayStr
              const isSelected = ds === selectedDay
              const isPast = ds < todayStr
              const dayNum = parseInt(ds.slice(8))
              const dots = dayEvents.slice(0, 3)

              return (
                <button key={i} onClick={() => setSelectedDay(isSelected ? null : ds)}
                  className={`relative flex flex-col items-center py-1.5 rounded-xl transition ${
                    isSelected ? 'bg-accent-600 text-[#120a00]' :
                    isToday    ? 'bg-accent-500/20 text-accent-300 font-semibold' :
                    isPast     ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="text-xs leading-none">{dayNum}</span>
                  {dots.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {dots.map((_, ti) => (
                        <span key={ti} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#120a00]' : 'bg-accent-400'}`} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Selected day: события + кнопка добавления */}
          {selectedDay && (
            <div className="mt-4 border-t border-gray-800/80 pt-3">
              <p className="text-xs text-gray-500 mb-2 capitalize">
                {new Date(selectedDay + 'T12:00').toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto mb-3">
                {selectedDayEvents.length === 0 && <p className="text-sm text-gray-600 py-1">Свободно — событий нет.</p>}
                {selectedDayEvents.map(ev => (
                  <div key={ev.id} className="group flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5">
                    <span className="text-xs font-bold text-accent-400 tabular-nums w-11 shrink-0">{ev.time || 'весь день'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{ev.title}</p>
                      {(ev.endTime || ev.note) && <p className="text-xs text-gray-500 truncate">{ev.endTime ? `до ${ev.endTime}` : ''}{ev.endTime && ev.note ? ' · ' : ''}{ev.note}</p>}
                    </div>
                    <button onClick={() => onDeleteEvent(ev.id)} className="text-gray-600 hover:text-red-400 text-sm px-1 transition shrink-0" aria-label="Удалить">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setSheetDay(selectedDay)}
                className="w-full bg-accent-600 hover:bg-accent-500 text-[#120a00] font-semibold text-sm py-2.5 rounded-xl transition active:scale-[.98]">
                + Добавить событие
              </button>
            </div>
          )}
        </div>

        {/* Right column: overdue + today + upcoming */}
        <div className="space-y-4">
          {overdue.length > 0 && (
            <div>
              <p className="text-xs text-red-400 uppercase tracking-wider mb-2 font-medium">🔴 Просрочено ({overdue.length})</p>
              <div className="space-y-1.5">
                {overdue.slice(0, 4).map(t => <TaskPill key={t.id} task={t} showDate />)}
                {overdue.length > 4 && <p className="text-xs text-gray-600 pl-2">и ещё {overdue.length - 4}...</p>}
              </div>
            </div>
          )}

          {dueToday.length > 0 && (
            <div>
              <p className="text-xs text-orange-400 uppercase tracking-wider mb-2 font-medium">🟠 Сегодня ({dueToday.length})</p>
              <div className="space-y-1.5">
                {dueToday.map(t => <TaskPill key={t.id} task={t} />)}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">📅 Скоро</p>
              <div className="space-y-1.5">
                {upcoming.slice(0, 5).map(t => <TaskPill key={t.id} task={t} showDate />)}
              </div>
            </div>
          )}

          {overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="text-4xl mb-2">📅</span>
              <p className="text-gray-500 text-sm">Нет задач с дедлайнами</p>
              <p className="text-gray-700 text-xs mt-1">Установите дедлайны на задачах</p>
            </div>
          )}
        </div>
      </div>

      {/* Priority board */}
      {prioritized.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">⭐ По важности</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {prioritized.map(t => <TaskPill key={t.id} task={t} showDate />)}
          </div>
        </div>
      )}

      <div className="pb-safe" />

      {sheetDay && (
        <EventSheet
          day={sheetDay}
          onClose={() => setSheetDay(null)}
          onSave={draft => { onAddEvent(draft); setSheetDay(null) }}
        />
      )}
    </div>
  )
}

// ── Шторка добавления события (время, название, заметка) ─────────────────────────
function EventSheet({ day, onClose, onSave }: { day: string; onClose: () => void; onSave: (d: EventDraft) => void }) {
  const [title, setTitle] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [time, setTime] = useState('12:00')
  const [endTime, setEndTime] = useState('')
  const [note, setNote] = useState('')

  const dayLabel = new Date(day + 'T12:00').toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })
  const canSave = title.trim().length > 0

  const save = () => {
    if (!canSave) return
    onSave({ day, time: allDay ? '' : time, endTime: allDay ? '' : endTime, title: title.trim(), note: note.trim() })
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_.2s_ease]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl border border-white/10 p-6 pb-8"
        style={{ background: 'linear-gradient(160deg, #161618, #0b0b0c)', boxShadow: '0 -20px 60px -20px rgba(0,0,0,.8)', animation: 'slideUp .3s cubic-bezier(.2,.9,.3,1)' }}>
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5 md:hidden" />
        <h2 className="text-lg font-bold text-white mb-0.5">Новое событие</h2>
        <p className="text-xs text-accent-400/80 capitalize mb-5">{dayLabel}</p>

        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Название</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canSave) save() }}
          placeholder="Например: Встреча, тренировка, врач…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-accent-500 focus:bg-white/[0.06] mb-4" />

        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-gray-400">Время</label>
          <button type="button" onClick={() => setAllDay(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${allDay ? 'bg-accent-500/20 border-accent-500/40 text-accent-300' : 'border-white/10 text-gray-400'}`}>
            Весь день
          </button>
        </div>
        {!allDay && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <span className="block text-[11px] text-gray-500 mb-1">Начало</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-accent-500 [color-scheme:dark]" />
            </div>
            <div className="flex-1">
              <span className="block text-[11px] text-gray-500 mb-1">Конец (необязательно)</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-accent-500 [color-scheme:dark]" />
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Заметка (необязательно)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder="Место, детали…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-accent-500 focus:bg-white/[0.06] resize-none mb-6" />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition hover:bg-white/[0.04]">Отмена</button>
          <button onClick={save} disabled={!canSave}
            className="flex-1 bg-accent-600 hover:bg-accent-500 text-[#120a00] font-bold py-3 rounded-xl transition active:scale-[.98] disabled:opacity-40"
            style={{ boxShadow: canSave ? '0 10px 30px -8px rgba(255,122,26,.5)' : 'none' }}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
