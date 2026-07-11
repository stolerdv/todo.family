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

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await sql()`UPDATE todo_users SET password_hash = ${passwordHash} WHERE id = ${userId}`
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

// доступ к секции: владелец ИЛИ участник. Используется как предикат во всех мутациях/чтениях
// раздела «Напоминания», чтобы нельзя было трогать чужие данные по угаданному ID.
export async function archiveSection(id: string, archived: boolean, userId: string): Promise<void> {
  await sql()`
    UPDATE todo_sections s SET archived = ${archived}
    WHERE s.id = ${id} AND (
      s.user_id = ${userId}
      OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId})
    )`
}

// удалять секцию (с каскадом на задачи/подзадачи/комментарии) может только владелец
export async function deleteSection(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM todo_sections WHERE id = ${id} AND user_id = ${userId}`
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(sectionId: string, userId: string): Promise<Task[]> {
  const rows = await sql()`
    SELECT t.id, t.section_id, t.title, t.state, t.created_at, t.priority, t.due_date
    FROM todo_tasks t
    JOIN todo_sections s ON s.id = t.section_id
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE t.section_id = ${sectionId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    ORDER BY t.created_at`
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

export async function createTask(sectionId: string, title: string, userId: string): Promise<Task | null> {
  const rows = await sql()`
    INSERT INTO todo_tasks (section_id, title)
    SELECT ${sectionId}, ${title}
    WHERE EXISTS (
      SELECT 1 FROM todo_sections s
      LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
      WHERE s.id = ${sectionId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    )
    RETURNING id, section_id, title, state, created_at, priority, due_date
  `
  const r = rows[0]
  if (!r) return null
  return { id: r.id, sectionId: r.section_id, title: r.title, state: r.state, createdAt: r.created_at, priority: r.priority, dueDate: r.due_date ?? '' }
}

// доступ к задаче через её секцию (владелец/участник) инлайнится в каждый UPDATE
export async function updateTask(id: string, fields: Partial<{ state: TaskState; title: string; priority: Priority; dueDate: string }>, userId: string): Promise<void> {
  const q = sql()
  if (fields.state    !== undefined) await q`UPDATE todo_tasks t SET state    = ${fields.state}    FROM todo_sections s WHERE t.id = ${id} AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
  if (fields.title    !== undefined) await q`UPDATE todo_tasks t SET title    = ${fields.title}    FROM todo_sections s WHERE t.id = ${id} AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
  if (fields.priority !== undefined) await q`UPDATE todo_tasks t SET priority = ${fields.priority} FROM todo_sections s WHERE t.id = ${id} AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
  if (fields.dueDate  !== undefined) await q`UPDATE todo_tasks t SET due_date = ${fields.dueDate}  FROM todo_sections s WHERE t.id = ${id} AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM todo_tasks t
    USING todo_sections s
    WHERE t.id = ${id} AND s.id = t.section_id AND (
      s.user_id = ${userId}
      OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId})
    )`
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export async function getSubtasks(taskId: string, userId: string): Promise<Subtask[]> {
  const rows = await sql()`
    SELECT st.id, st.task_id, st.title, st.done, st.note, st.created_at, st.priority
    FROM todo_subtasks st
    JOIN todo_tasks t ON t.id = st.task_id
    JOIN todo_sections s ON s.id = t.section_id
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE st.task_id = ${taskId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    ORDER BY st.created_at`
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

export async function createSubtask(taskId: string, title: string, userId: string): Promise<Subtask | null> {
  const rows = await sql()`
    INSERT INTO todo_subtasks (task_id, title)
    SELECT ${taskId}, ${title}
    WHERE EXISTS (
      SELECT 1 FROM todo_tasks t
      JOIN todo_sections s ON s.id = t.section_id
      LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
      WHERE t.id = ${taskId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    )
    RETURNING id, task_id, title, done, note, created_at, priority
  `
  const r = rows[0]
  if (!r) return null
  return { id: r.id, taskId: r.task_id, title: r.title, done: r.done, note: r.note ?? '', createdAt: r.created_at, priority: r.priority }
}

export async function updateSubtask(id: string, fields: { done?: boolean; note?: string; priority?: Priority }, userId: string): Promise<void> {
  const q = sql()
  if (fields.done     !== undefined) await q`UPDATE todo_subtasks st SET done     = ${fields.done}     FROM todo_tasks t, todo_sections s WHERE st.id = ${id} AND t.id = st.task_id AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
  if (fields.note     !== undefined) await q`UPDATE todo_subtasks st SET note     = ${fields.note}     FROM todo_tasks t, todo_sections s WHERE st.id = ${id} AND t.id = st.task_id AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
  if (fields.priority !== undefined) await q`UPDATE todo_subtasks st SET priority = ${fields.priority} FROM todo_tasks t, todo_sections s WHERE st.id = ${id} AND t.id = st.task_id AND s.id = t.section_id AND (s.user_id = ${userId} OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId}))`
}

export async function deleteSubtask(id: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM todo_subtasks st
    USING todo_tasks t, todo_sections s
    WHERE st.id = ${id} AND t.id = st.task_id AND s.id = t.section_id AND (
      s.user_id = ${userId}
      OR EXISTS (SELECT 1 FROM todo_section_members sm WHERE sm.section_id = s.id AND sm.user_id = ${userId})
    )`
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(taskId: string, userId: string): Promise<Comment[]> {
  const rows = await sql()`
    SELECT c.id, c.task_id, c.user_id, c.username, c.text, c.created_at
    FROM todo_comments c
    JOIN todo_tasks t ON t.id = c.task_id
    JOIN todo_sections s ON s.id = t.section_id
    LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
    WHERE c.task_id = ${taskId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    ORDER BY c.created_at`
  return rows.map(r => ({ id: r.id, taskId: r.task_id, userId: r.user_id, username: r.username, text: r.text, createdAt: r.created_at }))
}

export async function createComment(taskId: string, userId: string, username: string, text: string): Promise<Comment | null> {
  const rows = await sql()`
    INSERT INTO todo_comments (task_id, user_id, username, text)
    SELECT ${taskId}, ${userId}, ${username}, ${text}
    WHERE EXISTS (
      SELECT 1 FROM todo_tasks t
      JOIN todo_sections s ON s.id = t.section_id
      LEFT JOIN todo_section_members sm ON sm.section_id = s.id AND sm.user_id = ${userId}
      WHERE t.id = ${taskId} AND (s.user_id = ${userId} OR sm.user_id = ${userId})
    )
    RETURNING id, task_id, user_id, username, text, created_at
  `
  const r = rows[0]
  if (!r) return null
  return { id: r.id, taskId: r.task_id, userId: r.user_id, username: r.username, text: r.text, createdAt: r.created_at }
}

// удалить комментарий может автор или владелец секции
export async function deleteComment(id: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM todo_comments c
    USING todo_tasks t, todo_sections s
    WHERE c.id = ${id} AND t.id = c.task_id AND s.id = t.section_id AND (
      c.user_id = ${userId} OR s.user_id = ${userId}
    )`
}

// ── Events (календарь занятости) ─────────────────────────────────────────────────
// События с временем — отдельная сущность от задач. Личные, скоуп по user_id.

export interface CalEvent {
  id: string
  day: string       // 'YYYY-MM-DD'
  time: string       // 'HH:MM' или '' (весь день)
  endTime: string    // 'HH:MM' или ''
  title: string
  note: string
  createdAt: string
}

function mapEvent(r: any): CalEvent {
  return {
    id: r.id, day: r.day, time: r.time ?? '', endTime: r.end_time ?? '',
    title: r.title, note: r.note ?? '', createdAt: r.created_at,
  }
}

export async function getEvents(userId: string): Promise<CalEvent[]> {
  const rows = await sql()`
    SELECT id, to_char(day, 'YYYY-MM-DD') AS day, time, end_time, title, note, created_at
    FROM todo_events WHERE user_id = ${userId}
    ORDER BY day, COALESCE(time, '00:00'), created_at`
  return (rows as any[]).map(mapEvent)
}

export interface EventInput { day: string; time?: string; endTime?: string; title: string; note?: string }

export async function createEvent(userId: string, e: EventInput): Promise<CalEvent> {
  const rows = await sql()`
    INSERT INTO todo_events (user_id, day, time, end_time, title, note)
    VALUES (${userId}, ${e.day}::date, ${e.time || null}, ${e.endTime || null}, ${e.title}, ${e.note ?? ''})
    RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, time, end_time, title, note, created_at`
  return mapEvent(rows[0])
}

export async function updateEvent(id: string, userId: string, f: Partial<EventInput>): Promise<void> {
  if (f.title   !== undefined) await sql()`UPDATE todo_events SET title    = ${f.title}          WHERE id = ${id} AND user_id = ${userId}`
  if (f.time    !== undefined) await sql()`UPDATE todo_events SET time     = ${f.time || null}    WHERE id = ${id} AND user_id = ${userId}`
  if (f.endTime !== undefined) await sql()`UPDATE todo_events SET end_time = ${f.endTime || null} WHERE id = ${id} AND user_id = ${userId}`
  if (f.note    !== undefined) await sql()`UPDATE todo_events SET note     = ${f.note}           WHERE id = ${id} AND user_id = ${userId}`
  if (f.day     !== undefined) await sql()`UPDATE todo_events SET day      = ${f.day}::date       WHERE id = ${id} AND user_id = ${userId}`
}

export async function deleteEvent(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM todo_events WHERE id = ${id} AND user_id = ${userId}`
}
