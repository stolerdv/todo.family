import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync(new URL('.env.local', 'file://' + process.cwd() + '/'), 'utf8')
const m = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)
const sql = neon(m[1])
await sql`ALTER TABLE todo_events ADD COLUMN IF NOT EXISTS repeat text`
console.log('OK')
