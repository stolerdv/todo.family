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
}

export interface Task {
  id: string
  sectionId: string
  title: string
  state: TaskState
  createdAt: string
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
    range: 'Sections!A2:D',
  })
  const all = (res.data.values ?? []).map(([id, name, createdAt, uid]) => ({ id, name, createdAt, userId: uid ?? '' }))
  return userId ? all.filter(s => s.userId === userId) : all
}

export async function createSection(name: string, userId: string): Promise<Section> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sections!A:D',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, name, createdAt, userId]] },
  })
  return { id, name, createdAt, userId }
}

export async function deleteSection(id: string): Promise<void> {
  const rows = await getRawRows('Sections!A:C')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Sections', rowIndex + 2)
  // also delete tasks belonging to this section
  const taskRows = await getRawRows('Tasks!A:E')
  const taskIndices = taskRows
    .map((r, i) => (r[1] === id ? i + 2 : -1))
    .filter(i => i !== -1)
    .reverse()
  for (const idx of taskIndices) await deleteRow('Tasks', idx)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(sectionId?: string): Promise<Task[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A2:E',
  })
  const rows = (res.data.values ?? []).map(([id, sId, title, state, createdAt]) => ({
    id,
    sectionId: sId,
    title,
    state: state as TaskState,
    createdAt,
  }))
  return sectionId ? rows.filter(t => t.sectionId === sectionId) : rows
}

export async function createTask(sectionId: string, title: string): Promise<Task> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const state: TaskState = 'Todo'
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A:E',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, sectionId, title, state, createdAt]] },
  })
  return { id, sectionId, title, state, createdAt }
}

export async function updateTaskState(id: string, state: TaskState): Promise<void> {
  const rows = await getRawRows('Tasks!A:E')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) throw new Error('Task not found')
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Tasks!D${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[state]] },
  })
}

export async function updateTaskTitle(id: string, title: string): Promise<void> {
  const rows = await getRawRows('Tasks!A:E')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) throw new Error('Task not found')
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Tasks!C${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[title]] },
  })
}

export async function deleteTask(id: string): Promise<void> {
  const rows = await getRawRows('Tasks!A:E')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return
  await deleteRow('Tasks', rowIndex + 2)
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  note: string
  createdAt: string
}

export async function getSubtasks(taskId?: string): Promise<Subtask[]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Subtasks!A2:F',
  })
  const rows = (res.data.values ?? []).map(([id, tId, title, done, createdAt, note]) => ({
    id,
    taskId: tId,
    title,
    done: done === 'true',
    note: note ?? '',
    createdAt,
  }))
  return taskId ? rows.filter(s => s.taskId === taskId) : rows
}

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Subtasks!A:F',
    valueInputOption: 'RAW',
    requestBody: { values: [[id, taskId, title, 'false', createdAt, '']] },
  })
  return { id, taskId, title, done: false, note: '', createdAt }
}

export async function toggleSubtask(id: string, done: boolean, note?: string): Promise<void> {
  const rows = await getRawRows('Subtasks!A:F')
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) throw new Error('Subtask not found')
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Subtasks!D${rowIndex + 2}:F${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(done), rows[rowIndex][4] ?? '', note ?? rows[rowIndex][5] ?? '']] },
  })
}

export async function deleteSubtask(id: string): Promise<void> {
  const rows = await getRawRows('Subtasks!A:E')
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
  if (!sheet?.properties?.sheetId) return
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
