// Календарь: события (занятость) — отдельно от задач
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const sql = neon(/DATABASE_URL=["']?([^"'\n]+)/.exec(env)[1])
await sql`
  CREATE TABLE IF NOT EXISTS todo_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES todo_users(id) ON DELETE CASCADE,
    day date NOT NULL,
    time text,               -- 'HH:MM' или NULL (весь день)
    end_time text,           -- 'HH:MM' или NULL
    title text NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS todo_events_user_day_idx ON todo_events(user_id, day)`
console.log('OK todo_events')
