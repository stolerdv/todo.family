// Фикс: убрать гонку, из-за которой у пользователя могло создаться несколько
// кабинетов «Личный» (getSpaces делал SELECT-затем-INSERT без атомарности).
// 1) переименовывает дубли (кроме самого старого), чтобы не мешали уникальному индексу
// 2) создаёт partial unique index — на будущее гонка невозможна (ON CONFLICT DO NOTHING)
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const sql = neon(/DATABASE_URL=["']?([^"'\n]+)/.exec(env)[1])

const dupes = await sql`
  SELECT owner_id, array_agg(id ORDER BY created_at) AS ids
  FROM finance_spaces WHERE name = 'Личный' AND emoji = '👤'
  GROUP BY owner_id HAVING count(*) > 1`

for (const d of dupes) {
  const ids = d.ids
  for (let i = 1; i < ids.length; i++) {
    await sql`UPDATE finance_spaces SET name = ${'Личный (' + (i + 1) + ')'} WHERE id = ${ids[i]}`
    console.log('renamed dup', ids[i], '-> Личный (' + (i + 1) + ')')
  }
}
console.log(dupes.length ? `renamed dupes for ${dupes.length} owner(s)` : 'no duplicates found')

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS finance_spaces_owner_personal_idx
  ON finance_spaces(owner_id) WHERE (name = 'Личный' AND emoji = '👤')`
console.log('OK unique index created')
