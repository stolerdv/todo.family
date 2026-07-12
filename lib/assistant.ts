import { neon } from '@neondatabase/serverless'

function sql() {
  return neon(process.env.DATABASE_URL!)
}

export const FREE_MONTHLY_LIMIT = 15

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}

export async function getUsage(userId: string): Promise<{ count: number; limit: number }> {
  const month = currentMonth()
  const rows = await sql()`SELECT count FROM assistant_usage WHERE user_id = ${userId} AND month = ${month} LIMIT 1`
  return { count: rows[0] ? Number((rows[0] as any).count) : 0, limit: FREE_MONTHLY_LIMIT }
}

// атомарно инкрементит счётчик, но только если лимит ещё не исчерпан — возвращает false, если уже исчерпан
export async function tryConsumeUsage(userId: string): Promise<boolean> {
  const month = currentMonth()
  const rows = await sql()`
    INSERT INTO assistant_usage (user_id, month, count)
    VALUES (${userId}, ${month}, 1)
    ON CONFLICT (user_id, month) DO UPDATE
      SET count = assistant_usage.count + 1, updated_at = now()
      WHERE assistant_usage.count < ${FREE_MONTHLY_LIMIT}
    RETURNING count`
  return rows.length > 0
}
