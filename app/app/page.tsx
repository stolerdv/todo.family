'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Section, Task, TaskState, Subtask } from '@/lib/sheets'

const STATES: TaskState[] = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done', 'Cancelled', 'Deferred', 'Delegated']
const DONE_STATES: TaskState[] = ['Done', 'Cancelled']

const STATE_STYLES: Record<TaskState, string> = {
  'Todo':       'bg-gray-700 text-gray-200',
  'In Progress':'bg-blue-600 text-white',
  'Review':     'bg-yellow-500 text-gray-900',
  'Blocked':    'bg-red-600 text-white',
  'Done':       'bg-green-600 text-white',
  'Cancelled':  'bg-gray-600 text-gray-400',
  'Deferred':   'bg-purple-600 text-white',
  'Delegated':  'bg-teal-600 text-white',
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
    setSections(s)
    setTasks(t)
    setSubtasks(st)
    setUsername(me.username ?? '')
    if (s.length > 0) setActiveSection((a: string | null) => a ?? s[0].id)
    setLoading(false)
  }

  async function addSection() {
    const name = newSectionRef.current?.value?.trim()
    if (!name) return
    const res = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const section: Section = await res.json()
    setSections(prev => [...prev, section])
    setActiveSection(section.id)
    setAddingSection(false)
    setSidebarOpen(false)
  }

  async function removeSection(id: string) {
    await fetch(`/api/sections/${id}`, { method: 'DELETE' })
    setSections(prev => prev.filter(s => s.id !== id))
    setTasks(prev => prev.filter(t => t.sectionId !== id))
    if (activeSection === id) {
      const remaining = sections.filter(s => s.id !== id)
      setActiveSection(remaining[0]?.id ?? null)
    }
  }

  async function addTask() {
    const title = newTaskRef.current?.value?.trim()
    if (!title || !activeSection) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId: activeSection, title }),
    })
    const task: Task = await res.json()
    setTasks(prev => [...prev, task])
    if (newTaskRef.current) newTaskRef.current.value = ''
    setAddingTask(false)
    setExpandedTask(task.id)
  }

  async function setTaskState(taskId: string, state: TaskState) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, state } : t))
    setStateMenuTaskId(null)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    })
  }

  async function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSubtasks(prev => prev.filter(s => s.taskId !== taskId))
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  }

  async function addSubtask(taskId: string) {
    const title = newSubtaskRef.current?.value?.trim()
    if (!title) return
    const res = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, title }),
    })
    const subtask: Subtask = await res.json()
    setSubtasks(prev => [...prev, subtask])
    if (newSubtaskRef.current) newSubtaskRef.current.value = ''
    setAddingSubtaskFor(null)
  }

  async function toggleSubtask(id: string, done: boolean) {
    const sub = subtasks.find(s => s.id === id)
    if (sub && done) {
      setFlashingTask(sub.taskId)
      setTimeout(() => setFlashingTask(null), 1000)
    }
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done } : s))
    await fetch(`/api/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    })
  }

  async function saveNote(id: string, note: string) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, note } : s))
    const sub = subtasks.find(s => s.id === id)
    await fetch(`/api/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: sub?.done ?? false, note }),
    })
  }

  async function removeSubtask(id: string) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  const sectionTasks = tasks.filter(t => t.sectionId === activeSection)
  const visibleTasks = showDone ? sectionTasks : sectionTasks.filter(t => !DONE_STATES.includes(t.state))
  const hiddenCount = sectionTasks.filter(t => DONE_STATES.includes(t.state)).length
  const activeSectionName = sections.find(s => s.id === activeSection)?.name ?? ''

  function taskProgress(taskId: string) {
    const all = subtasks.filter(s => s.taskId === taskId)
    return { total: all.length, done: all.filter(s => s.done).length }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Загрузка...</div>
  }

  const sidebarContent = (
    <>
      <div className="pt-safe" />
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Todo Family</span>
          <button onClick={logout} className="text-gray-500 hover:text-gray-300 text-xs transition">Выйти</button>
        </div>
        {username && <p className="text-xs text-gray-500 mt-0.5">{username}</p>}
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map(s => (
          <div
            key={s.id}
            className={`group flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer text-sm transition ${
              activeSection === s.id ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`}
            onClick={() => { setActiveSection(s.id); setSidebarOpen(false) }}
          >
            <span className="truncate">{s.name}</span>
            <button
              onClick={e => { e.stopPropagation(); removeSection(s.id) }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 ml-1 transition text-lg leading-none"
            >×</button>
          </div>
        ))}
        {addingSection ? (
          <div className="mt-1 px-1">
            <input
              ref={newSectionRef}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') addSection()
                if (e.key === 'Escape') setAddingSection(false)
              }}
              onBlur={() => { if (!newSectionRef.current?.value) setAddingSection(false) }}
              placeholder="Название раздела"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            className="w-full mt-1 text-left px-3 py-2.5 text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition"
          >+ Новый раздел</button>
        )}
      </nav>
    </>
  )

  const mainContent = (
    <>
      {/* Safe area top spacer — mobile only */}
      <div className="pt-safe md:hidden bg-gray-950" />

      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-800 flex items-center gap-3 shrink-0">
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden text-gray-400 hover:text-gray-200 transition p-1 -ml-1"
          onClick={() => setSidebarOpen(true)}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-base md:text-lg font-semibold flex-1 truncate">{activeSectionName}</h1>
        <button
          onClick={() => setShowDone(v => !v)}
          className={`text-xs px-2.5 md:px-3 py-1.5 rounded-full border transition whitespace-nowrap ${
            showDone ? 'border-indigo-500 text-indigo-400' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
          }`}
        >
          {showDone ? 'Скрыть' : `Завершённые${hiddenCount > 0 ? ` (${hiddenCount})` : ''}`}
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-2">
        {visibleTasks.length === 0 && <p className="text-gray-600 text-sm">Нет задач</p>}

        {visibleTasks.map(task => {
          const { total, done } = taskProgress(task.id)
          const isExpanded = expandedTask === task.id
          const taskSubtasks = subtasks.filter(s => s.taskId === task.id)
          const pct = total > 0 ? Math.round((done / total) * 100) : 0

          return (
            <div key={task.id} className={`bg-gray-900 border rounded-2xl transition ${
              isExpanded ? 'border-gray-600' : 'border-gray-800 active:border-gray-700'
            }`}>
              <div
                className="px-4 pt-3.5 pb-3 cursor-pointer"
                onClick={() => setExpandedTask(isExpanded ? null : task.id)}
              >
                {/* Title row */}
                <div className="flex items-start gap-2.5">
                  <span className={`text-gray-500 text-xs mt-1 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  <span className={`flex-1 text-base font-medium leading-snug ${
                    DONE_STATES.includes(task.state) ? 'text-gray-500 line-through' : 'text-gray-100'
                  }`}>
                    {task.title}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removeTask(task.id) }}
                    className="text-gray-700 hover:text-red-400 active:text-red-400 transition shrink-0 mt-0.5 p-1 -mr-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-2.5 ml-5" onClick={e => e.stopPropagation()}>
                  {/* State */}
                  <div className="relative">
                    <button
                      onClick={() => setStateMenuTaskId(stateMenuTaskId === task.id ? null : task.id)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition active:opacity-70 ${STATE_STYLES[task.state]}`}
                    >
                      {task.state}
                    </button>
                    {stateMenuTaskId === task.id && (
                      <div className="absolute left-0 top-8 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1 min-w-[160px]">
                        {STATES.map(s => (
                          <button
                            key={s}
                            onClick={() => setTaskState(task.id, s)}
                            className={`w-full text-left text-sm px-3 py-2.5 rounded-lg transition hover:bg-gray-800 active:bg-gray-800 ${s === task.state ? 'opacity-40' : ''}`}
                          >
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATE_STYLES[s].split(' ')[0]}`} />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  {total > 0 && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            pct === 100 ? 'bg-green-500' : flashingTask === task.id ? 'bg-indigo-400' : 'bg-indigo-600'
                          } ${flashingTask === task.id ? 'shadow-[0_0_8px_2px_rgba(99,102,241,0.7)]' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs shrink-0 transition-colors duration-300 ${pct === 100 ? 'text-green-400' : 'text-gray-600'}`}>
                        {done}/{total}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-800 px-3 md:px-4 py-2 space-y-0.5">
                  {taskSubtasks.map(sub => (
                    <div key={sub.id} className="border-b border-gray-800/50 last:border-0">
                      <div className="flex items-center gap-3 py-2.5">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleSubtask(sub.id, !sub.done)}
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                            sub.done ? 'bg-green-600 border-green-600 scale-95' : 'border-gray-600 active:border-gray-400'
                          }`}
                        >
                          {sub.done && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Title */}
                        <span className={`flex-1 text-sm transition-all duration-300 ${sub.done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                          {sub.title}
                        </span>

                        {/* Note button — always visible */}
                        <button
                          onClick={() => setEditingNoteFor(editingNoteFor === sub.id ? null : sub.id)}
                          className={`flex items-center justify-center w-8 h-8 rounded-lg transition shrink-0 ${
                            sub.note
                              ? 'text-indigo-400 bg-indigo-500/10'
                              : 'text-gray-600 hover:text-gray-400 active:bg-gray-800'
                          }`}
                          title="Заметка"
                        >
                          {sub.note ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          )}
                        </button>

                        {/* Delete button — always visible */}
                        <button
                          onClick={() => removeSubtask(sub.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-red-400 active:bg-gray-800 transition shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {/* Note area */}
                      {(editingNoteFor === sub.id || sub.note) && (
                        <div className="ml-9 mb-2.5">
                          {editingNoteFor === sub.id ? (
                            <textarea
                              autoFocus
                              defaultValue={sub.note}
                              onBlur={e => { saveNote(sub.id, e.target.value); setEditingNoteFor(null) }}
                              onKeyDown={e => { if (e.key === 'Escape') setEditingNoteFor(null) }}
                              placeholder="Комментарий к выполнению..."
                              rows={3}
                              className="w-full bg-gray-800 border border-indigo-500/50 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-indigo-500 resize-none placeholder-gray-600"
                            />
                          ) : (
                            <p
                              className="text-sm text-gray-500 italic cursor-pointer active:text-gray-300 transition bg-gray-800/50 rounded-xl px-3 py-2"
                              onClick={() => setEditingNoteFor(sub.id)}
                            >
                              {sub.note}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {addingSubtaskFor === task.id ? (
                    <div className="flex items-center gap-3 py-2">
                      <div className="w-5 h-5 rounded border border-gray-600 shrink-0" />
                      <input
                        ref={newSubtaskRef}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') addSubtask(task.id)
                          if (e.key === 'Escape') setAddingSubtaskFor(null)
                        }}
                        onBlur={() => { if (!newSubtaskRef.current?.value) setAddingSubtaskFor(null) }}
                        placeholder="Название подзадачи..."
                        className="flex-1 bg-transparent outline-none text-sm text-gray-200 placeholder-gray-600"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubtaskFor(task.id)}
                      className="flex items-center gap-3 py-2 text-sm text-gray-600 hover:text-gray-400 transition w-full"
                    >
                      <div className="w-5 h-5 rounded border border-dashed border-gray-700 shrink-0" />
                      + Добавить подзадачу
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {addingTask ? (
          <div className="bg-gray-900 border border-indigo-600 rounded-xl px-4 py-3">
            <input
              ref={newTaskRef}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') addTask()
                if (e.key === 'Escape') setAddingTask(false)
              }}
              onBlur={() => { if (!newTaskRef.current?.value) setAddingTask(false) }}
              placeholder="Название этапа..."
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:text-gray-400 rounded-xl border border-dashed border-gray-800 hover:border-gray-700 transition"
          >+ Добавить этап</button>
        )}

        {/* Bottom safe area for home indicator */}
        <div className="pb-safe" />
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-gray-900 border-r border-gray-800 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeSection ? mainContent : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-600 text-sm p-6">
            <p>Создайте первый раздел</p>
            <button
              onClick={() => { setSidebarOpen(true); setTimeout(() => setAddingSection(true), 100) }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
            >+ Новый раздел</button>
          </div>
        )}
      </main>

      {stateMenuTaskId && <div className="fixed inset-0 z-40" onClick={() => setStateMenuTaskId(null)} />}
    </div>
  )
}
