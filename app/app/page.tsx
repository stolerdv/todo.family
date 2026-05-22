'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Section, Task, TaskState, Subtask } from '@/lib/sheets'

const STATES: TaskState[] = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done', 'Cancelled', 'Deferred', 'Delegated']
const DONE_STATES: TaskState[] = ['Done', 'Cancelled']

const STATE_META: Record<TaskState, { color: string; dot: string }> = {
  'Todo':       { color: 'bg-gray-700/80 text-gray-300',        dot: 'bg-gray-500' },
  'In Progress':{ color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', dot: 'bg-blue-400' },
  'Review':     { color: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', dot: 'bg-yellow-400' },
  'Blocked':    { color: 'bg-red-500/20 text-red-300 border border-red-500/30',  dot: 'bg-red-400' },
  'Done':       { color: 'bg-green-500/20 text-green-300 border border-green-500/30', dot: 'bg-green-400' },
  'Cancelled':  { color: 'bg-gray-700/50 text-gray-500',        dot: 'bg-gray-600' },
  'Deferred':   { color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30', dot: 'bg-purple-400' },
  'Delegated':  { color: 'bg-teal-500/20 text-teal-300 border border-teal-500/30', dot: 'bg-teal-400' },
}

export default function AppPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [sections, setSections] = useState<Section[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [addingSection, setAddingSection] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null)
  const [stateMenuTaskId, setStateMenuTaskId] = useState<string | null>(null)
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null)
  const [flashingTask, setFlashingTask] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const newSectionRef = useRef<HTMLInputElement>(null)
  const newTaskRef = useRef<HTMLInputElement>(null)
  const newSubtaskRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [s, t, st, me] = await Promise.all([
      fetch('/api/sections').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/subtasks').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
    ])
    setSections(s); setTasks(t); setSubtasks(st)
    setUsername(me.username ?? '')
    if (s.length > 0) setActiveSection((a: string | null) => a ?? s[0].id)
    setLoading(false)
  }

  // ── Sections ────────────────────────────────────────────────────────────────

  async function addSection() {
    const name = newSectionRef.current?.value?.trim()
    if (!name) { setAddingSection(false); return }
    if (newSectionRef.current) newSectionRef.current.value = ''
    setAddingSection(false); setSidebarOpen(false)
    const tempId = `temp-${Date.now()}`
    const tempSection: Section = { id: tempId, name, createdAt: '', userId: '' }
    setSections(prev => [...prev, tempSection])
    setActiveSection(tempId)
    try {
      const res = await fetch('/api/sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const section: Section = await res.json()
      setSections(prev => prev.map(s => s.id === tempId ? section : s))
      setActiveSection(id => id === tempId ? section.id : id)
    } catch { setSections(prev => prev.filter(s => s.id !== tempId)) }
  }

  async function removeSection(id: string) {
    await fetch(`/api/sections/${id}`, { method: 'DELETE' })
    setSections(prev => prev.filter(s => s.id !== id))
    setTasks(prev => prev.filter(t => t.sectionId !== id))
    if (activeSection === id) setActiveSection(sections.filter(s => s.id !== id)[0]?.id ?? null)
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────

  async function addTask() {
    const title = newTaskRef.current?.value?.trim()
    if (!title || !activeSection) { setAddingTask(false); return }
    if (newTaskRef.current) newTaskRef.current.value = ''
    setAddingTask(false)
    const tempId = `temp-${Date.now()}`
    const tempTask: Task = { id: tempId, sectionId: activeSection, title, state: 'Todo', createdAt: '' }
    setTasks(prev => [...prev, tempTask])
    setExpandedTask(tempId)
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectionId: activeSection, title }) })
      const task: Task = await res.json()
      setTasks(prev => prev.map(t => t.id === tempId ? task : t))
      setExpandedTask(id => id === tempId ? task.id : id)
    } catch { setTasks(prev => prev.filter(t => t.id !== tempId)) }
  }

  async function setTaskState(taskId: string, state: TaskState) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, state } : t))
    setStateMenuTaskId(null)
    await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) })
  }

  async function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSubtasks(prev => prev.filter(s => s.taskId !== taskId))
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  }

  // ── Subtasks ────────────────────────────────────────────────────────────────

  async function addSubtask(taskId: string) {
    const title = newSubtaskRef.current?.value?.trim()
    if (!title) { setAddingSubtaskFor(null); return }
    if (newSubtaskRef.current) newSubtaskRef.current.value = ''
    setAddingSubtaskFor(null)
    const tempId = `temp-${Date.now()}`
    setSubtasks(prev => [...prev, { id: tempId, taskId, title, done: false, note: '', createdAt: '' }])
    try {
      const res = await fetch('/api/subtasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, title }) })
      const subtask: Subtask = await res.json()
      setSubtasks(prev => prev.map(s => s.id === tempId ? subtask : s))
    } catch { setSubtasks(prev => prev.filter(s => s.id !== tempId)) }
  }

  async function toggleSubtask(id: string, done: boolean) {
    const sub = subtasks.find(s => s.id === id)
    if (sub && done) { setFlashingTask(sub.taskId); setTimeout(() => setFlashingTask(null), 1000) }
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done } : s))
    await fetch(`/api/subtasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) })
  }

  async function saveNote(id: string, note: string) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, note } : s))
    const sub = subtasks.find(s => s.id === id)
    await fetch(`/api/subtasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: sub?.done ?? false, note }) })
  }

  async function removeSubtask(id: string) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const sectionTasks = tasks.filter(t => t.sectionId === activeSection)
  const visibleTasks = showDone ? sectionTasks : sectionTasks.filter(t => !DONE_STATES.includes(t.state))
  const hiddenCount = sectionTasks.filter(t => DONE_STATES.includes(t.state)).length
  const activeSectionName = sections.find(s => s.id === activeSection)?.name ?? ''

  function taskProgress(taskId: string) {
    const all = subtasks.filter(s => s.taskId === taskId)
    return { total: all.length, done: all.filter(s => s.done).length }
  }

  // Section-level overall progress
  const sectionDone = sectionTasks.filter(t => DONE_STATES.includes(t.state)).length
  const sectionTotal = sectionTasks.length

  function sectionTaskCount(sectionId: string) {
    return tasks.filter(t => t.sectionId === sectionId && !DONE_STATES.includes(t.state)).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 text-sm">Загрузка...</p>
        </div>
      </div>
    )
  }

  // ── Sidebar content ──────────────────────────────────────────────────────────

  const sidebarContent = (
    <>
      <div className="pt-safe md:pt-0" />
      <div className="px-4 py-4 border-b border-gray-800/80">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-bold text-sm tracking-wide">Todo Family</span>
          <button onClick={logout} className="text-gray-600 hover:text-gray-400 text-xs transition px-1 py-0.5 rounded">
            Выйти
          </button>
        </div>
        {username && <p className="text-xs text-indigo-400/70">@{username}</p>}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p className="text-xs text-gray-600 px-3 py-1.5 uppercase tracking-wider">Разделы</p>
        {sections.map(s => {
          const count = sectionTaskCount(s.id)
          const isActive = activeSection === s.id
          return (
            <div
              key={s.id}
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer text-sm transition-all ${
                isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              onClick={() => { setActiveSection(s.id); setSidebarOpen(false) }}
            >
              <span className="truncate flex-1">{s.name}</span>
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {count}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); removeSection(s.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition w-5 h-5 flex items-center justify-center rounded"
                >×</button>
              </div>
            </div>
          )
        })}

        {addingSection ? (
          <div className="px-1 pt-1">
            <input
              ref={newSectionRef}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setAddingSection(false) }}
              onBlur={() => addSection()}
              placeholder="Название раздела..."
              className="w-full bg-gray-800 border border-indigo-500/50 rounded-xl px-3 py-2.5 text-sm outline-none placeholder-gray-600"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            className="w-full text-left px-3 py-2.5 text-sm text-gray-600 hover:text-gray-400 rounded-xl hover:bg-gray-800/50 transition flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Новый раздел
          </button>
        )}
      </nav>
    </>
  )

  // ── Main content ─────────────────────────────────────────────────────────────

  const mainContent = (
    <>
      {/* Safe area + header */}
      <div className="pt-safe md:hidden bg-gray-950" />
      <div className="px-4 md:px-6 py-3 border-b border-gray-800/80 flex items-center gap-3 shrink-0">
        <button className="md:hidden text-gray-500 hover:text-gray-300 transition p-1 -ml-1" onClick={() => setSidebarOpen(true)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-base truncate">{activeSectionName}</h1>
          {sectionTotal > 0 && (
            <p className="text-xs text-gray-600">
              {sectionDone === sectionTotal
                ? <span className="text-green-500">Всё выполнено ✓</span>
                : <>{sectionDone}/{sectionTotal} завершено</>
              }
            </p>
          )}
        </div>

        <button
          onClick={() => setShowDone(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-full transition whitespace-nowrap shrink-0 ${
            showDone ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-600 border border-gray-800 hover:border-gray-700 hover:text-gray-400'
          }`}
        >
          {showDone ? 'Скрыть' : hiddenCount > 0 ? `+ ${hiddenCount} завершённых` : 'Завершённые'}
        </button>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-2">

        {visibleTasks.length === 0 && !addingTask && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-800/80 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">Нет задач</p>
            <p className="text-gray-700 text-xs mt-1">Нажмите «+ Добавить этап» чтобы начать</p>
          </div>
        )}

        {visibleTasks.map(task => {
          const { total, done } = taskProgress(task.id)
          const isExpanded = expandedTask === task.id
          const taskSubtasks = subtasks.filter(s => s.taskId === task.id)
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          const isDone = DONE_STATES.includes(task.state)

          return (
            <div key={task.id} className={`border rounded-2xl transition-all ${
              isDone ? 'opacity-60' : ''
            } ${isExpanded ? 'border-gray-700 bg-gray-900' : 'border-gray-800/80 bg-gray-900/60 hover:border-gray-700/80'}`}>

              {/* Task header */}
              <div className="px-4 pt-3.5 pb-3 cursor-pointer" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                <div className="flex items-start gap-2.5">
                  <span className={`text-gray-600 text-xs mt-1.5 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-medium leading-snug ${isDone ? 'line-through text-gray-500' : 'text-gray-100'}`}>
                      {task.title}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeTask(task.id) }}
                    className="text-gray-700 hover:text-red-400 transition shrink-0 p-1 -mr-1 mt-0.5 rounded-lg hover:bg-red-400/10"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 mt-2.5 ml-5" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    <button
                      onClick={() => setStateMenuTaskId(stateMenuTaskId === task.id ? null : task.id)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full transition active:opacity-70 flex items-center gap-1.5 ${STATE_META[task.state].color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_META[task.state].dot}`} />
                      {task.state}
                    </button>
                    {stateMenuTaskId === task.id && (
                      <div className="absolute left-0 top-9 z-50 bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl shadow-black/50 p-1.5 min-w-[170px]">
                        {STATES.map(s => (
                          <button
                            key={s}
                            onClick={() => setTaskState(task.id, s)}
                            className={`w-full text-left text-sm px-3 py-2.5 rounded-xl transition flex items-center gap-2.5 ${
                              s === task.state ? 'opacity-40 cursor-default' : 'hover:bg-gray-800 active:bg-gray-800'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_META[s].dot}`} />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {total > 0 && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            pct === 100 ? 'bg-green-500' : flashingTask === task.id ? 'bg-indigo-400' : 'bg-indigo-600'
                          } ${flashingTask === task.id ? 'shadow-[0_0_8px_2px_rgba(99,102,241,0.6)]' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs tabular-nums shrink-0 ${pct === 100 ? 'text-green-400' : 'text-gray-600'}`}>
                        {done}/{total}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Subtasks */}
              {isExpanded && (
                <div className="border-t border-gray-800/80 px-4 pb-2 pt-1">
                  {taskSubtasks.map(sub => (
                    <div key={sub.id} className="border-b border-gray-800/40 last:border-0">
                      <div className="flex items-center gap-3 py-2.5">
                        <button
                          onClick={() => toggleSubtask(sub.id, !sub.done)}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                            sub.done ? 'bg-green-600 border-green-600' : 'border-gray-700 hover:border-gray-500 active:scale-95'
                          }`}
                        >
                          {sub.done && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className={`flex-1 text-sm ${sub.done ? 'text-gray-600 line-through' : 'text-gray-200'}`}>
                          {sub.title}
                        </span>
                        <button
                          onClick={() => setEditingNoteFor(editingNoteFor === sub.id ? null : sub.id)}
                          className={`w-8 h-8 flex items-center justify-center rounded-xl transition shrink-0 ${
                            sub.note ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-700 hover:text-gray-500 hover:bg-gray-800'
                          }`}
                        >
                          <svg className="w-4 h-4" fill={sub.note ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeSubtask(sub.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-700 hover:text-red-400 hover:bg-red-400/10 transition shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      {(editingNoteFor === sub.id || sub.note) && (
                        <div className="ml-9 mb-2.5">
                          {editingNoteFor === sub.id ? (
                            <textarea
                              autoFocus
                              defaultValue={sub.note}
                              onBlur={e => { saveNote(sub.id, e.target.value); setEditingNoteFor(null) }}
                              onKeyDown={e => { if (e.key === 'Escape') setEditingNoteFor(null) }}
                              placeholder="Комментарий к выполнению..."
                              rows={2}
                              className="w-full bg-gray-800/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500/50 resize-none placeholder-gray-600"
                            />
                          ) : (
                            <p onClick={() => setEditingNoteFor(sub.id)} className="text-sm text-gray-600 italic cursor-pointer hover:text-gray-400 transition bg-gray-800/40 rounded-xl px-3 py-2">
                              {sub.note}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {addingSubtaskFor === task.id ? (
                    <div className="flex items-center gap-3 py-2.5">
                      <div className="w-6 h-6 rounded-lg border-2 border-indigo-500/40 shrink-0" />
                      <input
                        ref={newSubtaskRef}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') addSubtask(task.id); if (e.key === 'Escape') setAddingSubtaskFor(null) }}
                        onBlur={() => addSubtask(task.id)}
                        placeholder="Название подзадачи..."
                        className="flex-1 bg-transparent outline-none text-sm text-gray-200 placeholder-gray-700"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubtaskFor(task.id)}
                      className="w-full flex items-center gap-3 py-2.5 text-sm text-gray-700 hover:text-gray-500 transition"
                    >
                      <div className="w-6 h-6 rounded-lg border-2 border-dashed border-gray-800 shrink-0 flex items-center justify-center">
                        <span className="text-xs">+</span>
                      </div>
                      Добавить подзадачу
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add task */}
        {addingTask ? (
          <div className="border border-indigo-500/40 bg-gray-900 rounded-2xl px-4 py-3.5">
            <input
              ref={newTaskRef}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
              onBlur={() => addTask()}
              placeholder="Название этапа..."
              className="w-full bg-transparent outline-none text-base text-gray-100 placeholder-gray-700"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:text-gray-500 rounded-2xl border border-dashed border-gray-800/80 hover:border-gray-700 transition group"
          >
            <div className="w-6 h-6 rounded-lg border-2 border-dashed border-gray-800 group-hover:border-gray-700 shrink-0 flex items-center justify-center transition">
              <span className="text-sm">+</span>
            </div>
            Добавить этап
          </button>
        )}

        <div className="pb-safe" />
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-gray-900/80 border-r border-gray-800/80 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {activeSection ? mainContent : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/80 flex items-center justify-center mb-2">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-gray-400 font-medium">Нет разделов</p>
              <p className="text-gray-700 text-sm mt-1">Создайте первый раздел чтобы начать</p>
            </div>
            <button
              onClick={() => { setSidebarOpen(true); setTimeout(() => setAddingSection(true), 100) }}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm px-5 py-2.5 rounded-xl transition font-medium"
            >
              + Создать раздел
            </button>
          </div>
        )}
      </main>

      {stateMenuTaskId && <div className="fixed inset-0 z-40" onClick={() => setStateMenuTaskId(null)} />}
    </div>
  )
}
