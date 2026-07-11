// Миграция: привычка несколько раз в день (target_per_day + count у отметки)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const sql = neon(/DATABASE_URL=["']?([^"'\n]+)/.exec(env)[1])
await sql`ALTER TABLE tracker_habits ADD COLUMN IF NOT EXISTS target_per_day int NOT NULL DEFAULT 1`
await sql`ALTER TABLE tracker_completions ADD COLUMN IF NOT EXISTS count int NOT NULL DEFAULT 1`
const chk = (await sql`SELECT
  (SELECT count(*)::int FROM tracker_habits WHERE target_per_day IS NULL) AS habits_null_target,
  (SELECT count(*)::int FROM tracker_completions WHERE count IS NULL) AS comps_null_count`)[0]
console.log('OK', chk)
