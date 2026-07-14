// Миграция: шаблоны операций (быстрые чипсы в форме «+ Новая операция»)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync(new URL('.env.local', 'file://' + process.cwd() + '/'), 'utf8')
const m = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)
const sql = neon(m[1])

await sql`
  CREATE TABLE IF NOT EXISTS finance_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES todo_users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    name text NOT NULL,
    account_id uuid NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT '',
    amount numeric NOT NULL,
    comment text NOT NULL DEFAULT '',
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS finance_templates_space_idx ON finance_templates(space_id)`
console.log('OK')
