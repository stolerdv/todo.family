// Миграция: кабинеты финансов (finance_spaces / members / space_settings + space_id)
// Запуск: node migrate-spaces.mjs (из корня проекта, читает .env.local)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const env = readFileSync(new URL('.env.local', 'file://' + process.cwd() + '/'), 'utf8')
const m = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)
if (!m) { console.error('DATABASE_URL not found in .env.local'); process.exit(1) }
const sql = neon(m[1])

console.log('1. Создаю таблицы кабинетов...')
await sql`
  CREATE TABLE IF NOT EXISTS finance_spaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    emoji text NOT NULL DEFAULT '💼',
    owner_id uuid NOT NULL REFERENCES todo_users(id) ON DELETE CASCADE,
    share_code text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
await sql`
  CREATE TABLE IF NOT EXISTS finance_space_members (
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES todo_users(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id)
  )`
await sql`
  CREATE TABLE IF NOT EXISTS finance_space_settings (
    space_id uuid PRIMARY KEY REFERENCES finance_spaces(id) ON DELETE CASCADE,
    base_currency text NOT NULL DEFAULT '',
    rates jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`

console.log('2. Добавляю space_id в существующие таблицы...')
await sql`ALTER TABLE finance_accounts   ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES finance_spaces(id) ON DELETE CASCADE`
await sql`ALTER TABLE finance_txns       ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES finance_spaces(id) ON DELETE CASCADE`
await sql`ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES finance_spaces(id) ON DELETE CASCADE`
await sql`ALTER TABLE finance_budgets    ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES finance_spaces(id) ON DELETE CASCADE`
await sql`CREATE INDEX IF NOT EXISTS finance_accounts_space_idx   ON finance_accounts(space_id)`
await sql`CREATE INDEX IF NOT EXISTS finance_txns_space_idx       ON finance_txns(space_id)`
await sql`CREATE INDEX IF NOT EXISTS finance_categories_space_idx ON finance_categories(space_id)`
await sql`CREATE INDEX IF NOT EXISTS finance_budgets_space_idx    ON finance_budgets(space_id)`

console.log('3. Переношу данные: каждому пользователю с финансами — кабинет «Личный»...')
const users = await sql`
  SELECT DISTINCT user_id FROM (
    SELECT user_id FROM finance_accounts
    UNION SELECT user_id FROM finance_txns
    UNION SELECT user_id FROM finance_categories
    UNION SELECT user_id FROM finance_budgets
    UNION SELECT user_id FROM finance_settings
  ) x`
for (const { user_id } of users) {
  let sid
  const existing = await sql`SELECT id FROM finance_spaces WHERE owner_id = ${user_id} LIMIT 1`
  if (existing[0]) {
    sid = existing[0].id
  } else {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase()
    const r = await sql`INSERT INTO finance_spaces (name, emoji, owner_id, share_code) VALUES ('Личный', '👤', ${user_id}, ${code}) RETURNING id`
    sid = r[0].id
  }
  await sql`INSERT INTO finance_space_members (space_id, user_id) VALUES (${sid}, ${user_id}) ON CONFLICT DO NOTHING`
  await sql`UPDATE finance_accounts   SET space_id = ${sid} WHERE user_id = ${user_id} AND space_id IS NULL`
  await sql`UPDATE finance_txns       SET space_id = ${sid} WHERE user_id = ${user_id} AND space_id IS NULL`
  await sql`UPDATE finance_categories SET space_id = ${sid} WHERE user_id = ${user_id} AND space_id IS NULL`
  await sql`UPDATE finance_budgets    SET space_id = ${sid} WHERE user_id = ${user_id} AND space_id IS NULL`
  await sql`
    INSERT INTO finance_space_settings (space_id, base_currency, rates)
    SELECT ${sid}, base_currency, COALESCE(rates, '{}'::jsonb) FROM finance_settings WHERE user_id = ${user_id}
    ON CONFLICT (space_id) DO NOTHING`
  console.log('   пользователь', user_id, '→ кабинет', sid)
}

console.log('4. Проверка...')
const check = await sql`
  SELECT
    (SELECT count(*)::int FROM finance_spaces) AS spaces,
    (SELECT count(*)::int FROM finance_space_members) AS members,
    (SELECT count(*)::int FROM finance_accounts WHERE space_id IS NULL) AS accounts_without_space,
    (SELECT count(*)::int FROM finance_txns WHERE space_id IS NULL) AS txns_without_space,
    (SELECT count(*)::int FROM finance_categories WHERE space_id IS NULL) AS cats_without_space,
    (SELECT count(*)::int FROM finance_budgets WHERE space_id IS NULL) AS budgets_without_space,
    (SELECT count(*)::int FROM finance_space_settings) AS space_settings`
console.log(check[0])
console.log('Готово ✅')
