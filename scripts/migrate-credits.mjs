// Миграция: кредиты/долги/рассрочки (finance_credits + finance_credit_payments)
// Запуск: node scripts/migrate-credits.mjs (из корня проекта, читает .env.local)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const env = readFileSync(new URL('.env.local', 'file://' + process.cwd() + '/'), 'utf8')
const m = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)
if (!m) { console.error('DATABASE_URL not found in .env.local'); process.exit(1) }
const sql = neon(m[1])

console.log('1. Создаю finance_credits...')
await sql`
  CREATE TABLE IF NOT EXISTS finance_credits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES todo_users(id),
    kind text NOT NULL DEFAULT 'credit',
    direction text NOT NULL DEFAULT 'owe',
    name text NOT NULL,
    counterparty text NOT NULL DEFAULT '',
    currency text NOT NULL DEFAULT '₸',
    principal numeric NOT NULL DEFAULT 0,
    remaining numeric NOT NULL DEFAULT 0,
    rate numeric,
    monthly_payment numeric,
    start_date date,
    due_date date,
    next_payment_date date,
    comment text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS finance_credits_space_idx ON finance_credits(space_id)`

console.log('2. Создаю finance_credit_payments...')
await sql`
  CREATE TABLE IF NOT EXISTS finance_credit_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id uuid NOT NULL REFERENCES finance_credits(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES todo_users(id),
    account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    day date NOT NULL DEFAULT CURRENT_DATE,
    comment text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS finance_credit_payments_credit_idx ON finance_credit_payments(credit_id)`

const chk = (await sql`SELECT
  (SELECT count(*)::int FROM finance_credits) AS credits,
  (SELECT count(*)::int FROM finance_credit_payments) AS payments`)[0]
console.log('OK', chk)
