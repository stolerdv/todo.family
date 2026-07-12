// Голосовой ассистент: лимит бесплатных команд в месяц на пользователя
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const sql = neon(/DATABASE_URL=["']?([^"'\n]+)/.exec(env)[1])
await sql`
  CREATE TABLE IF NOT EXISTS assistant_usage (
    user_id uuid NOT NULL REFERENCES todo_users(id) ON DELETE CASCADE,
    month text NOT NULL,          -- 'YYYY-MM'
    count int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
  )`
console.log('OK assistant_usage')
