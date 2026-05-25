import { neon } from '@neondatabase/serverless'

export type TaskState =
  | 'Todo'
  | 'In Progress'
  | 'Review'
  | 'Blocked'
  | 'Done'
  | 'Cancelled'
  | 'Deferred'
  | 'Delegated'

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low' | 'None'

export interface User {
  id: string
  username: string
  passwordHash: string
  createdAt: string
}

export interface Section {
  id: string
  name: string
  createdAt: string
  userId: string
  archived: boolean
  shareCode: string
  isShared?: boolean
}

export interface SectionMember {
  id: string
  sectionId: string
  userId: string
  joinedAt: string
}

export interface Task {
  id: string
  sectionId: string
  title: string
  state: TaskState
  createdAt: string
  priority: Priority
  dueDate: string
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  note: string
  createdAt: string
  priority: Priority
}

export interface Comment {
  id: string
  taskId: string
  userId: string
  username: string
  text: string
  createdAt: string
}

function sql() {
  return neon(process.env.DATABASE_URL!)
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const rows = await sql()`SELECT id, username, password_hash, created_at FROM todo_users`
  return rows.map(r => ({ id: r.id, username: r.username, passwordHash: r.password_hash, createdAt: r.created_at }))
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const rows = await sql()`SELECT id, username, password_hash, created_at FROM todo_users WHERE lower(username) = lower(${username}) LIMIT 1`
  if (!rows[0]) return null
  const r = rows[0]
  return { id: r.id, username: r.username, passwordHash: r.password_hash, createdAt: r.created_at }
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  const rows = await sql()`
    INSERT INTO todo_users (username, password_hash)
    VALUES (${username}, ${passwordHash})
    RETURNING id, username, password_hash, created_at
  `
  const r = rows[0]
  return { id: r.id, username: r.username, passwordHash: r.password_hash, createdAt: r.created_at }
}

// ── Sections ──────────────────────────────────────────────────────────────────

function genCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export async function getSections(userId?: string): Promise<Section[]> {
  if (!userId) {
    const rows = await sql()`SELECT id, name, created_at, user_id, archived, share_code FROM todo_sections ORDER BY created_at`
    return rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at, userId: r.user_id, archived: r.archived, shareCode: r.share_code }))
  }

  const rows = await sql()`
    SELECT s.id, s.name, s.created_at, s.user_id, s.archived, s.share_code,
           (sm.user_id IS NOT NULL AND s.user_id != ${userId}) AS is_shared
    FROM todo_sections s
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE s.user_id = ${userId} OR (sm.user_id = ${userId} AND s.user_id != ${userId})
    ORDER BY s.created_at
  `
  return rows.map(r => ({
    id: r.id, name: r.name, createdAt: r.created_at, userId: r.user_id,
    archived: r.archived, shareCode: r.share_code,
    isShared: r.is_shared ?? false,
  }))
}

export async function getSectionByCode(code: string): Promise<Section | null> {
  const rows = await sql()`SELECT id, name, created_at, user_id, archived, share_code FROM todo_sections WHERE share_code = ${code} LIMIT 1`
  if (!rows[0]) return null
  const r = rows[0]
  return { id: r.id, name: r.name, createdAt: r.created_at, userId: r.user_id, archived: r.archived, shareCode: r.share_code }
}

export async function joinSection(sectionId: string, userId: string): Promise<void> {
  await sql()`
    INSERT INTO todo_section_members (section_id, user_id)
    VALUES (${sectionId}, ${userId})
    ON CONFLICT (section_id, user_id) DO NOTHING
  `
}

export async function leaveSection(sectionId: string, userId: string): Promise<void> {
  await sql()`DELETE FROM todo_section_members WHERE section_id = ${sectionId} AND user_id = ${userId}`
}

export async function createSection(name: string, userId: string): Promise<Section> {
  const shareCode = genCode()
  const rows = await sql()`
    INSERT INTO todo_sections (name, user_id, share_code)
    VALUES (${name}, ${userId}, ${shareCode})
    RETURNING id, name, created_at, user_id, archived, share_code
  `
  const r = rows[0]
  return { id: r.id, name: r.name, createdAt: r.created_at, userId: r.user_id, archived: r.archived, shareCode: r.share_code }
}

export async function archiveSection(id: string, archived: boolean): Promise<void> {
  await sql()`UPDATE todo_sections SET archived = ${archived} WHERE id = ${id}`
}

export async function deleteSection(id: string): Promise<void> {
  // CASCADE deletes tasks → subtasks, comments via FK
  await sql()`DELETE FROM todo_sections WHERE id = ${id}`
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(sectionId?: string): Promise<Task[]> {
  const rows = sectionId
    ? await sql()`SELECT id, section_id, title, state, created_at, priority, due_date FROM todo_tasks WHERE section_id = ${sectionId} ORDER BY created_at`
    : await sql()`SELECT id, section_id, title, state, created_at, priority, due_date FROM todo_tasks ORDER BY created_at`
  return rows.map(r => ({
    id: r.id, sectionId: r.section_id, title: r.title,
    state: r.state as TaskState, createdAt: r.created_at,
    priority: r.priority as Priority, dueDate: r.due_date ?? '',
  }))
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  const rows = await sql()`
    SELECT t.id, t.section_id, t.title, t.state, t.created_at, t.priority, t.due_date
    FROM todo_tasks t
    JOIN todo_sections s ON s.id = t.section_id
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE s.user_id = ${userId} OR sm.user_id = ${userId}
    ORDER BY t.created_at
  `
  return rows.map(r => ({
    id: r.id, sectionId: r.section_id, title: r.title,
    state: r.state as TaskState, createdAt: r.created_at,
    priority: r.priority as Priority, dueDate: r.due_date ?? '',
  }))
}

export async function createTask(sectionId: string, title: string): Promise<Task> {
  const rows = await sql()`
    INSERT INTO todo_tasks (section_id, title) VALUES (${sectionId}, ${title})
    RETURNING id, section_id, title, state, created_at, priority, due_date
  `
  const r = rows[0]
  return { id: r.id, sectionId: r.section_id, title: r.title, state: r.state, createdAt: r.created_at, priority: r.priority, dueDate: r.due_date ?? '' }
}

export async function updateTask(id: string, fields: Partial<{ state: TaskState; title: string; priority: Priority; dueDate: string }>): Promise<void> {
  if (fields.state   !== undefined) await sql()`UPDATE todo_tasks SET state    = ${fields.state}    WHERE id = ${id}`
  if (fields.title   !== undefined) await sql()`UPDATE todo_tasks SET title    = ${fields.title}    WHERE id = ${id}`
  if (fields.priority !== undefined) await sql()`UPDATE todo_tasks SET priority = ${fields.priority} WHERE id = ${id}`
  if (fields.dueDate !== undefined) await sql()`UPDATE todo_tasks SET due_date = ${fields.dueDate}  WHERE id = ${id}`
}

export async function deleteTask(id: string): Promise<void> {
  await sql()`DELETE FROM todo_tasks WHERE id = ${id}`
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export async function getSubtasks(taskId?: string): Promise<Subtask[]> {
  const rows = taskId
    ? await sql()`SELECT id, task_id, title, done, note, created_at, priority FROM todo_subtasks WHERE task_id = ${taskId} ORDER BY created_at`
    : await sql()`SELECT id, task_id, title, done, note, created_at, priority FROM todo_subtasks ORDER BY created_at`
  return rows.map(r => ({
    id: r.id, taskId: r.task_id, title: r.title,
    done: r.done, note: r.note ?? '', createdAt: r.created_at,
    priority: r.priority as Priority,
  }))
}

export async function getSubtasksByUser(userId: string): Promise<Subtask[]> {
  const rows = await sql()`
    SELECT st.id, st.task_id, st.title, st.done, st.note, st.created_at, st.priority
    FROM todo_subtasks st
    JOIN todo_tasks t ON t.id = st.task_id
    JOIN todo_sections s ON s.id = t.section_id
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE s.user_id = ${userId} OR sm.user_id = ${userId}
    ORDER BY st.created_at
  `
  return rows.map(r => ({
    id: r.id, taskId: r.task_id, title: r.title,
    done: r.done, note: r.note ?? '', createdAt: r.created_at,
    priority: r.priority as Priority,
  }))
}

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  const rows = await sql()`
    INSERT INTO todo_subtasks (task_id, title) VALUES (${taskId}, ${title})
    RETURNING id, task_id, title, done, note, created_at, priority
  `
  const r = rows[0]
  return { id: r.id, taskId: r.task_id, title: r.title, done: r.done, note: r.note ?? '', createdAt: r.created_at, priority: r.priority }
}

export async function updateSubtask(id: string, fields: { done?: boolean; note?: string; priority?: Priority }): Promise<void> {
  if (fields.done     !== undefined) await sql()`UPDATE todo_subtasks SET done     = ${fields.done}     WHERE id = ${id}`
  if (fields.note     !== undefined) await sql()`UPDATE todo_subtasks SET note     = ${fields.note}     WHERE id = ${id}`
  if (fields.priority !== undefined) await sql()`UPDATE todo_subtasks SET priority = ${fields.priority} WHERE id = ${id}`
}

export async function deleteSubtask(id: string): Promise<void> {
  await sql()`DELETE FROM todo_subtasks WHERE id = ${id}`
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<Comment[]> {
  const rows = await sql()`
    SELECT id, task_id, user_id, username, text, created_at
    FROM todo_comments WHERE task_id = ${taskId} ORDER BY created_at
  `
  return rows.map(r => ({ id: r.id, taskId: r.task_id, userId: r.user_id, username: r.username, text: r.text, createdAt: r.created_at }))
}

export async function createComment(taskId: string, userId: string, username: string, text: string): Promise<Comment> {
  const rows = await sql()`
    INSERT INTO todo_comments (task_id, user_id, username, text)
    VALUES (${taskId}, ${userId}, ${username}, ${text})
    RETURNING id, task_id, user_id, username, text, created_at
  `
  const r = rows[0]
  return { id: r.id, taskId: r.task_id, userId: r.user_id, username: r.username, text: r.text, createdAt: r.created_at }
}

export async function deleteComment(id: string): Promise<void> {
  await sql()`DELETE FROM todo_comments WHERE id = ${id}`
}
