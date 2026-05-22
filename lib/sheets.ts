import { google } from 'googleapis'

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
}

export interface Comment {
  id: string
  taskId: string
  userId: string
  username: string
  text: string
  createdAt: string
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

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Users!A2:D',
  })
  return (res.data.values ?? []).map(([id, username, passwordHash, createdAt]) => ({ id, username, passwordHash, createdAt }))
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await getUsers()
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) ?? null
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Users!A:D',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, username, passwordHash, createdAt]] },
  })
  return { id, username, passwordHash, createdAt }
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function getSections(userId?: string): Promise<Section[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sections!A2:E',
  })
  const all = (res.data.values ?? []).map(([id, name, createdAt, uid, archived]) => ({
    id, name, createdAt, userId: uid ?? '', archived: archived === 'true',
  }))
  return userId ? all.filter(s => s.userId === userId) : all
}

export async function createSection(name: string, userId: string): Promise<Section> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sections!A:E',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, name, createdAt, userId, 'false']] },
  })
  return { id, name, createdAt, userId, archived: false }
}

export async function archiveSection(id: string, archived: boolean): Promise<void> {
  const rows = await getRawRows('Sections!A:E')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Sections!E${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(archived)]] },
  })
}

export async function deleteSection(id: string): Promise<void> {
  const rows = await getRawRows('Sections!A:E')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Sections', rowIndex + 2)
  // find task ids in this section
  const taskRows = await getRawRows('Tasks!A:G')
  const taskIds = taskRows.filter(r => r[1] === id).map(r => r[0])
  // delete tasks (reverse order to keep indices valid)
  for (const idx of taskRows.map((r, i) => r[1] === id ? i + 2 : -1).filter(i => i !== -1).reverse())
    await deleteRow('Tasks', idx)
  // cascade: delete subtasks for those tasks
  const subtaskRows = await getRawRows('Subtasks!A:G')
  for (const idx of subtaskRows.map((r, i) => taskIds.includes(r[1]) ? i + 2 : -1).filter(i => i !== -1).reverse())
    await deleteRow('Subtasks', idx)
  // cascade: delete comments for those tasks
  const commentRows = await getRawRows('Comments!A:F')
  for (const idx of commentRows.map((r, i) => taskIds.includes(r[1]) ? i + 2 : -1).filter(i => i !== -1).reverse())
    await deleteRow('Comments', idx)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(sectionId?: string): Promise<Task[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A2:G',
  })
  const rows = (res.data.values ?? []).map(([id, sId, title, state, createdAt, priority, dueDate]) => ({
    id, sectionId: sId, title,
    state: (state || 'Todo') as TaskState,
    createdAt: createdAt ?? '',
    priority: (priority || 'None') as Priority,
    dueDate: dueDate ?? '',
  }))
  return sectionId ? rows.filter(t => t.sectionId === sectionId) : rows
}

export async function createTask(sectionId: string, title: string): Promise<Task> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A:G',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, sectionId, title, 'Todo', createdAt, 'None', '']] },
  })
  return { id, sectionId, title, state: 'Todo', createdAt, priority: 'None', dueDate: '' }
}

export async function updateTask(id: string, fields: Partial<{ state: TaskState; title: string; priority: Priority; dueDate: string }>): Promise<void> {
  const rows = await getRawRows('Tasks!A:G')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) throw new Error('Task not found')
  const row = rows[rowIndex]
  const updated = [
    row[0],
    row[1],
    fields.title   ?? row[2] ?? '',
    fields.state   ?? row[3] ?? 'Todo',
    row[4],
    fields.priority ?? row[5] ?? 'None',
    fields.dueDate  ?? row[6] ?? '',
  ]
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Tasks!A${rowIndex + 2}:G${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updated] },
  })
}

export async function deleteTask(id: string): Promise<void> {
  const rows = await getRawRows('Tasks!A:G')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Tasks', rowIndex + 2)
  // cascade: delete subtasks
  const subtaskRows = await getRawRows('Subtasks!A:G')
  for (const idx of subtaskRows.map((r, i) => r[1] === id ? i + 2 : -1).filter(i => i !== -1).reverse())
    await deleteRow('Subtasks', idx)
  // cascade: delete comments
  const commentRows = await getRawRows('Comments!A:F')
  for (const idx of commentRows.map((r, i) => r[1] === id ? i + 2 : -1).filter(i => i !== -1).reverse())
    await deleteRow('Comments', idx)
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<Comment[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Comments!A2:F',
  })
  return (res.data.values ?? [])
    .map(([id, tId, userId, username, text, createdAt]) => ({ id, taskId: tId, userId, username, text, createdAt }))
    .filter(c => c.taskId === taskId)
}

export async function createComment(taskId: string, userId: string, username: string, text: string): Promise<Comment> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Comments!A:F',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, taskId, userId, username, text, createdAt]] },
  })
  return { id, taskId, userId, username, text, createdAt }
}

export async function deleteComment(id: string): Promise<void> {
  const rows = await getRawRows('Comments!A:F')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Comments', rowIndex + 2)
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  note: string
  createdAt: string
  priority: Priority
}

export async function getSubtasks(taskId?: string): Promise<Subtask[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Subtasks!A2:G',
  })
  const rows = (res.data.values ?? []).map(([id, tId, title, done, createdAt, note, priority]) => ({
    id,
    taskId: tId,
    title,
    done: done === 'true',
    note: note ?? '',
    createdAt,
    priority: (priority || 'None') as Priority,
  }))
  return taskId ? rows.filter(s => s.taskId === taskId) : rows
}

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Subtasks!A:G',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, taskId, title, 'false', createdAt, '', 'None']] },
  })
  return { id, taskId, title, done: false, note: '', createdAt, priority: 'None' }
}

export async function updateSubtask(id: string, fields: { done?: boolean; note?: string; priority?: Priority }): Promise<void> {
  const rows = await getRawRows('Subtasks!A:G')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) throw new Error('Subtask not found')
  const row = rows[rowIndex]
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Subtasks!D${rowIndex + 2}:G${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[
      String(fields.done ?? row[3] === 'true'),
      row[4] ?? '',
      fields.note     ?? row[5] ?? '',
      fields.priority ?? row[6] ?? 'None',
    ]] },
  })
}

export async function deleteSubtask(id: string): Promise<void> {
  const rows = await getRawRows('Subtasks!A:G')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Subtasks', rowIndex + 2)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getRawRows(range: string): Promise<string[][]> {
  const res = await sheets().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range })
  return (res.data.values ?? []) as string[][]
}

async function deleteRow(sheetName: string, rowNumber: number): Promise<void> {
  const meta = await sheets().spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName)
  // sheetId can be 0 for the first sheet — must check for null/undefined explicitly
  if (sheet?.properties?.sheetId == null) return
  await sheets().spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties!.sheetId!,
            dimension: 'ROWS',
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    },
  })
}
