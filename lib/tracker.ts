import { neon } from '@neondatabase/serverless'

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }   // 0=Пн ... 6=Вс
  | { type: 'count'; perWeek: number }

export interface Habit {
  id: string
  userId: string
  name: string
  description: string
  emoji: string
  color: string
  schedule: Schedule
  startDate: string        // 'YYYY-MM-DD'
  archived: boolean
  sortOrder: number
  createdAt: string
  completions: string[]    // список дат 'YYYY-MM-DD'
}

function sql() {
  return neon(process.env.DATABASE_URL!)
}

function mapHabit(r: any, completions: string[] = []): Habit {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description ?? '',
    emoji: r.emoji ?? '✅',
    color: r.color ?? '#6d8bff',
    schedule: (typeof r.schedule === 'string' ? JSON.parse(r.schedule) : r.schedule) as Schedule,
    startDate: r.start_date,
    archived: r.archived,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    completions,
  }
}

// ── Чтение ────────────────────────────────────────────────────────────────────

export async function getHabits(userId: string): Promise<Habit[]> {
  const rows = await sql()`
    SELECT id, user_id, name, description, emoji, color, schedule,
           to_char(start_date, 'YYYY-MM-DD') AS start_date, archived, sort_order, created_at
    FROM tracker_habits
    WHERE user_id = ${userId}
    ORDER BY sort_order, created_at`
  if (rows.length === 0) return []

  const ids = rows.map((r: any) => r.id)
  const comp = await sql()`
    SELECT habit_id, to_char(day, 'YYYY-MM-DD') AS day
    FROM tracker_completions
    WHERE habit_id = ANY(${ids})`
  const byHabit: Record<string, string[]> = {}
  for (const c of comp as any[]) (byHabit[c.habit_id] ??= []).push(c.day)

  return rows.map((r: any) => mapHabit(r, byHabit[r.id] ?? []))
}

export async function getHabit(id: string, userId: string): Promise<Habit | null> {
  const rows = await sql()`
    SELECT id, user_id, name, description, emoji, color, schedule,
           to_char(start_date, 'YYYY-MM-DD') AS start_date, archived, sort_order, created_at
    FROM tracker_habits WHERE id = ${id} AND user_id = ${userId} LIMIT 1`
  if (!rows[0]) return null
  const comp = await sql()`
    SELECT to_char(day, 'YYYY-MM-DD') AS day FROM tracker_completions WHERE habit_id = ${id}`
  return mapHabit(rows[0], (comp as any[]).map(c => c.day))
}

// ── Запись ────────────────────────────────────────────────────────────────────

export interface HabitInput {
  name: string
  description?: string
  emoji?: string
  color?: string
  schedule?: Schedule
  startDate?: string
}

export async function createHabit(userId: string, h: HabitInput): Promise<Habit> {
  const rows = await sql()`
    INSERT INTO tracker_habits (user_id, name, description, emoji, color, schedule, start_date)
    VALUES (
      ${userId}, ${h.name}, ${h.description ?? ''}, ${h.emoji ?? '✅'}, ${h.color ?? '#6d8bff'},
      ${JSON.stringify(h.schedule ?? { type: 'daily' })}::jsonb,
      ${h.startDate ?? null}::date
    )
    RETURNING id, user_id, name, description, emoji, color, schedule,
              to_char(start_date, 'YYYY-MM-DD') AS start_date, archived, sort_order, created_at`
  return mapHabit(rows[0], [])
}

export async function updateHabit(
  id: string,
  userId: string,
  f: Partial<HabitInput & { archived: boolean; sortOrder: number }>,
): Promise<void> {
  if (f.name        !== undefined) await sql()`UPDATE tracker_habits SET name        = ${f.name}        WHERE id = ${id} AND user_id = ${userId}`
  if (f.description  !== undefined) await sql()`UPDATE tracker_habits SET description = ${f.description} WHERE id = ${id} AND user_id = ${userId}`
  if (f.emoji       !== undefined) await sql()`UPDATE tracker_habits SET emoji       = ${f.emoji}       WHERE id = ${id} AND user_id = ${userId}`
  if (f.color       !== undefined) await sql()`UPDATE tracker_habits SET color       = ${f.color}       WHERE id = ${id} AND user_id = ${userId}`
  if (f.schedule    !== undefined) await sql()`UPDATE tracker_habits SET schedule    = ${JSON.stringify(f.schedule)}::jsonb WHERE id = ${id} AND user_id = ${userId}`
  if (f.startDate   !== undefined) await sql()`UPDATE tracker_habits SET start_date  = ${f.startDate}::date WHERE id = ${id} AND user_id = ${userId}`
  if (f.archived    !== undefined) await sql()`UPDATE tracker_habits SET archived    = ${f.archived}    WHERE id = ${id} AND user_id = ${userId}`
  if (f.sortOrder   !== undefined) await sql()`UPDATE tracker_habits SET sort_order  = ${f.sortOrder}   WHERE id = ${id} AND user_id = ${userId}`
}

export async function deleteHabit(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM tracker_habits WHERE id = ${id} AND user_id = ${userId}`
}

// ── Отметки ───────────────────────────────────────────────────────────────────

// Возвращает true если отметка стоит после операции
export async function setCompletion(
  habitId: string, userId: string, day: string, done: boolean,
): Promise<boolean> {
  // проверяем принадлежность привычки пользователю
  const own = await sql()`SELECT 1 FROM tracker_habits WHERE id = ${habitId} AND user_id = ${userId} LIMIT 1`
  if (!own[0]) throw new Error('not found')

  if (done) {
    await sql()`INSERT INTO tracker_completions (habit_id, day) VALUES (${habitId}, ${day}::date) ON CONFLICT (habit_id, day) DO NOTHING`
    return true
  }
  await sql()`DELETE FROM tracker_completions WHERE habit_id = ${habitId} AND day = ${day}::date`
  return false
}
