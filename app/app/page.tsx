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

  // ── Sections ────────────────────────────────────────────────────────────────

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

  // ── Tasks ───────────────────────────────────────────────────────────────────

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

  // ── Subtasks ────────────────────────────────────────────────────────────────

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

  async function toggleSubtask(id: string, done: boolean, note?: string) {
    const sub = subtasks.find(s => s.id === id)
    if (sub && done) {
      setFlashingTask(sub.taskId)
      setTimeout(() => setFlashingTask(null), 1000)
    }
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done, note: note ?? s.note } : s))
    await fetch(`/api/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done, note }),
    })
  }

  async function saveNote(id: string, note: string) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, note } : s))
    await fetch(`/api/subtasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: subtasks.find(s => s.id === id)?.done ?? false, note }),
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

  // ── Derived state ────────────────────────────────────────────────────────────

  const sectionTasks = tasks.filter(t => t.sectionId === activeSection)
  const visibleTasks = showDone ? sectionTasks : sectionTasks.filter(t => !DONE_STATES.includes(t.state))
  const hiddenCount = sectionTasks.filter(t => DONE_STATES.includes(t.state)).length

  function taskProgress(taskId: string) {
    const all = subtasks.filter(s => s.taskId === taskId)
    const done = all.filter(s => s.done).length
    return { total: all.length, done }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Загрузка...</div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Todo</span>
            <button onClick={logout} className="text-gray-500 hover:text-gray-300 text-xs transition">Выйти</button>
          </div>
          {username && <p className="text-xs text-gray-500 mt-0.5">{username}</p>}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {sections.map(s => (
            <div
              key={s.id}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer text-sm transition ${
                activeSection === s.id ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
              onClick={() => setActiveSection(s.id)}
            >
              <span className="truncate">{s.name}</span>
              <button
                onClick={e => { e.stopPropagation(); removeSection(s.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 ml-1 transition"
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
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingSection(true)}
              className="w-full mt-1 text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition"
            >+ Новый раздел</button>
          )}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeSection ? (
          <>
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <h1 className="text-lg font-semibold">{sections.find(s => s.id === activeSection)?.name}</h1>
              <button
                onClick={() => setShowDone(v => !v)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  showDone ? 'border-indigo-500 text-indigo-400' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                {showDone ? 'Скрыть завершённые' : `Показать завершённые${hiddenCount > 0 ? ` (${hiddenCount})` : ''}`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {visibleTasks.length === 0 && <p className="text-gray-600 text-sm">Нет задач</p>}

              {visibleTasks.map(task => {
                const { total, done } = taskProgress(task.id)
                const isExpanded = expandedTask === task.id
                const taskSubtasks = subtasks.filter(s => s.taskId === task.id)
                const pct = total > 0 ? Math.round((done / total) * 100) : 0

                return (
                  <div key={task.id} className={`bg-gray-900 border rounded-xl transition ${
                    isExpanded ? 'border-gray-600' : 'border-gray-800 hover:border-gray-700'
                  }`}>
                    {/* Task header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      {/* Expand arrow */}
                      <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>

                      {/* State badge */}
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setStateMenuTaskId(stateMenuTaskId === task.id ? null : task.id)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition hover:opacity-80 ${STATE_STYLES[task.state]}`}
                        >
                          {task.state}
                        </button>
                        {stateMenuTaskId === task.id && (
                          <div className="absolute left-0 top-8 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1 min-w-[150px]">
                            {STATES.map(s => (
                              <button
                                key={s}
                                onClick={() => setTaskState(task.id, s)}
                                className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition hover:bg-gray-800 ${s === task.state ? 'opacity-40' : ''}`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATE_STYLES[s].split(' ')[0]}`} />
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <span className={`flex-1 text-sm ${DONE_STATES.includes(task.state) ? 'text-gray-500 line-through' : ''}`}>
                        {task.title}
                      </span>

                      {/* Progress */}
                      {total > 0 && (
                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ease-out ${
                                pct === 100
                                  ? 'bg-green-500'
                                  : flashingTask === task.id
                                  ? 'bg-indigo-400'
                                  : 'bg-indigo-600'
                              } ${flashingTask === task.id ? 'shadow-[0_0_8px_2px_rgba(99,102,241,0.7)]' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs w-8 text-right transition-colors duration-300 ${pct === 100 ? 'text-green-400' : 'text-gray-500'}`}>
                            {done}/{total}
                          </span>
                        </div>
                      )}

                      {/* Delete task */}
                      <button
                        onClick={e => { e.stopPropagation(); removeTask(task.id) }}
                        className="text-gray-600 hover:text-red-400 transition text-lg leading-none ml-1"
                      >×</button>
                    </div>

                    {/* Subtasks */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 px-4 py-2 space-y-1">
                        {taskSubtasks.map(sub => (
                          <div key={sub.id} className="group">
                            <div className="flex items-center gap-3 py-1.5">
                              <button
                                onClick={() => toggleSubtask(sub.id, !sub.done)}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-300 ${
                                  sub.done ? 'bg-green-600 border-green-600 scale-110' : 'border-gray-600 hover:border-gray-400'
                                }`}
                              >
                                {sub.done && <span className="text-white text-xs leading-none">✓</span>}
                              </button>
                              <span className={`flex-1 text-sm transition-all duration-300 ${sub.done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                {sub.title}
                              </span>
                              <button
                                onClick={() => setEditingNoteFor(editingNoteFor === sub.id ? null : sub.id)}
                                className={`opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded transition ${
                                  sub.note ? 'opacity-100 text-indigo-400 hover:text-indigo-300' : 'text-gray-600 hover:text-gray-400'
                                }`}
                                title="Комментарий"
                              >
                                {sub.note ? '💬' : '+ заметка'}
                              </button>
                              <button
                                onClick={() => removeSubtask(sub.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition text-base leading-none"
                              >×</button>
                            </div>
                            {/* Note */}
                            {(editingNoteFor === sub.id || sub.note) && (
                              <div className="ml-7 mb-1">
                                {editingNoteFor === sub.id ? (
                                  <textarea
                                    autoFocus
                                    defaultValue={sub.note}
                                    onBlur={e => { saveNote(sub.id, e.target.value); setEditingNoteFor(null) }}
                                    onKeyDown={e => { if (e.key === 'Escape') setEditingNoteFor(null) }}
                                    placeholder="Комментарий к выполнению..."
                                    rows={2}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none focus:border-indigo-500 resize-none"
                                  />
                                ) : (
                                  <p
                                    className="text-xs text-gray-500 italic cursor-pointer hover:text-gray-400 transition"
                                    onClick={() => setEditingNoteFor(sub.id)}
                                  >
                                    {sub.note}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add subtask */}
                        {addingSubtaskFor === task.id ? (
                          <div className="flex items-center gap-3 py-1.5">
                            <div className="w-4 h-4 rounded border border-gray-600 shrink-0" />
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
                            className="flex items-center gap-3 py-1.5 text-sm text-gray-600 hover:text-gray-400 transition w-full"
                          >
                            <div className="w-4 h-4 rounded border border-dashed border-gray-700 shrink-0" />
                            + Добавить подзадачу
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add task */}
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
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Создайте раздел слева</div>
        )}
      </main>

      {stateMenuTaskId && <div className="fixed inset-0 z-40" onClick={() => setStateMenuTaskId(null)} />}
    </div>
  )
}
