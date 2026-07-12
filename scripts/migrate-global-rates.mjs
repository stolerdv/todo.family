// Курсы валют: были per-kabinet (finance_space_settings), становятся глобальными
// (одна строка на весь аккаунт — курс евро не может отличаться между твоими кабинетами).
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const sql = neon(/DATABASE_URL=["']?([^"'\n]+)/.exec(env)[1])

await sql`
  CREATE TABLE IF NOT EXISTS finance_global_rates (
    id text PRIMARY KEY DEFAULT 'global',
    base_currency text NOT NULL DEFAULT '',
    rates jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`

// сидируем самой полной существующей настройкой (больше валют в rates)
const existing = await sql`
  SELECT base_currency, rates FROM finance_space_settings
  WHERE base_currency IS NOT NULL AND base_currency != '' AND rates != '{}'::jsonb
  ORDER BY (SELECT count(*) FROM jsonb_object_keys(rates)) DESC LIMIT 1`
const seed = existing[0] ?? (await sql`SELECT base_currency, rates FROM finance_space_settings WHERE base_currency IS NOT NULL AND base_currency != '' LIMIT 1`)[0]

if (seed) {
  await sql`
    INSERT INTO finance_global_rates (id, base_currency, rates) VALUES ('global', ${seed.base_currency}, ${JSON.stringify(seed.rates)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET base_currency = EXCLUDED.base_currency, rates = EXCLUDED.rates`
  console.log('seeded from existing:', seed)
} else {
  await sql`INSERT INTO finance_global_rates (id) VALUES ('global') ON CONFLICT (id) DO NOTHING`
  console.log('no existing rates found, created empty global row')
}

const check = await sql`SELECT * FROM finance_global_rates`
console.log('OK', check)
