// Миграция: плановый бюджет на месяц (finance_space_settings.free_budget)
// Запуск: node scripts/migrate-free-budget.mjs (из корня проекта, читает .env.local)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const env = readFileSync(new URL('.env.local', 'file://' + process.cwd() + '/'), 'utf8')
const m = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)
if (!m) { console.error('DATABASE_URL not found in .env.local'); process.exit(1) }
const sql = neon(m[1])

await sql`ALTER TABLE finance_space_settings ADD COLUMN IF NOT EXISTS free_budget numeric`

const chk = (await sql`SELECT count(*)::int AS n FROM finance_space_settings`)[0]
console.log('OK', chk)
