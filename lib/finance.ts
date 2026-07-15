import { neon } from '@neondatabase/serverless'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'

export type AccountType = 'cash' | 'card' | 'bank' | 'savings' | 'deposit' | 'other'

export interface DepositRate {
  id: string
  fromDate: string   // 'YYYY-MM-DD'
  rate: number       // годовая ставка, %
}

export interface Account {
  id: string
  userId: string
  spaceId: string
  name: string
  type: AccountType
  currency: string
  emoji: string
  color: string
  balance: number          // для обычных счетов
  principal: number        // тело депозита
  startDate: string | null // с какой даты идут проценты депозита
  capitalization: 'monthly' | 'none' // капитализация процентов депозита
  archived: boolean
  sortOrder: number
  createdAt: string
  rates: DepositRate[]      // ставки депозита (по датам)
}

function sql() {
  return neon(process.env.DATABASE_URL!)
}

function mapAccount(r: any, rates: DepositRate[] = []): Account {
  return {
    id: r.id, userId: r.user_id, spaceId: r.space_id, name: r.name, type: r.type as AccountType,
    currency: r.currency, emoji: r.emoji, color: r.color,
    balance: Number(r.balance), principal: Number(r.principal),
    startDate: r.start_date ?? null,
    capitalization: (r.capitalization ?? 'monthly') as 'monthly' | 'none',
    archived: r.archived, sortOrder: r.sort_order ?? 0, createdAt: r.created_at,
    rates,
  }
}

// ── Кабинеты (spaces): общие пространства финансов, доступ по share-коду ────────
// Паттерн как у todo_section_members: участник кабинета видит и правит всё внутри.

export interface SpaceMember { id: string; username: string }
export interface Space {
  id: string
  name: string
  emoji: string
  ownerId: string
  shareCode: string
  createdAt: string
  members: SpaceMember[]
}

function genCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export async function isMember(spaceId: string, userId: string): Promise<boolean> {
  const r = await sql()`SELECT 1 FROM finance_space_members WHERE space_id = ${spaceId} AND user_id = ${userId} LIMIT 1`
  return !!r[0]
}

async function spaceRows(userId: string) {
  return sql()`
    SELECT s.id, s.name, s.emoji, s.owner_id, s.share_code, s.created_at
    FROM finance_spaces s
    JOIN finance_space_members m ON m.space_id = s.id AND m.user_id = ${userId}
    ORDER BY s.created_at`
}

// список кабинетов пользователя; если нет ни одного — создаёт «Личный».
// Атомарно (ON CONFLICT на partial unique index finance_spaces_owner_personal_idx),
// иначе параллельные GET /api/finance/spaces (двойной рендер, медленная сеть и
// повторный тап) создавали по несколько дублей «Личный» одному пользователю.
export async function getSpaces(userId: string): Promise<Space[]> {
  let rows = await spaceRows(userId)
  if (rows.length === 0) {
    await ensurePersonalSpace(userId)
    rows = await spaceRows(userId)
  }
  const ids = (rows as any[]).map(r => r.id)
  const mem = await sql()`
    SELECT m.space_id, u.id, u.username
    FROM finance_space_members m JOIN todo_users u ON u.id = m.user_id
    WHERE m.space_id = ANY(${ids}) ORDER BY m.joined_at`
  const byId: Record<string, SpaceMember[]> = {}
  for (const r of mem as any[]) (byId[r.space_id] ??= []).push({ id: r.id, username: r.username })
  return (rows as any[]).map(r => ({
    id: r.id, name: r.name, emoji: r.emoji, ownerId: r.owner_id, shareCode: r.share_code,
    createdAt: r.created_at, members: byId[r.id] ?? [],
  }))
}

async function ensurePersonalSpace(userId: string): Promise<void> {
  const q = sql()
  const inserted = await q`
    INSERT INTO finance_spaces (name, emoji, owner_id, share_code)
    VALUES ('Личный', '👤', ${userId}, ${genCode()})
    ON CONFLICT (owner_id) WHERE (name = 'Личный' AND emoji = '👤') DO NOTHING
    RETURNING id`
  const spaceId = (inserted[0] as any)?.id
  if (spaceId) {
    await q`INSERT INTO finance_space_members (space_id, user_id) VALUES (${spaceId}, ${userId}) ON CONFLICT DO NOTHING`
    return
  }
  // проиграли гонку за создание — участник уже добавлен победившим запросом,
  // но на всякий случай подстрахуемся (idempotent)
  const existing = await q`SELECT id FROM finance_spaces WHERE owner_id = ${userId} AND name = 'Личный' AND emoji = '👤' LIMIT 1`
  const existingId = (existing[0] as any)?.id
  if (existingId) await q`INSERT INTO finance_space_members (space_id, user_id) VALUES (${existingId}, ${userId}) ON CONFLICT DO NOTHING`
}

export async function createSpace(userId: string, name: string, emoji: string): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  const q = sql()
  await q.transaction([
    q`INSERT INTO finance_spaces (id, name, emoji, owner_id, share_code) VALUES (${id}, ${name}, ${emoji}, ${userId}, ${genCode()})`,
    q`INSERT INTO finance_space_members (space_id, user_id) VALUES (${id}, ${userId})`,
  ])
  return { id }
}

export async function updateSpace(id: string, userId: string, f: { name?: string; emoji?: string }): Promise<void> {
  if (f.name  !== undefined) await sql()`UPDATE finance_spaces s SET name  = ${f.name}  FROM finance_space_members m WHERE s.id = ${id} AND m.space_id = s.id AND m.user_id = ${userId}`
  if (f.emoji !== undefined) await sql()`UPDATE finance_spaces s SET emoji = ${f.emoji} FROM finance_space_members m WHERE s.id = ${id} AND m.space_id = s.id AND m.user_id = ${userId}`
}

// удалить может только владелец; каскад снесёт счета, операции, категории, бюджеты, настройки
export async function deleteSpace(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_spaces WHERE id = ${id} AND owner_id = ${userId}`
}

export async function joinSpaceByCode(code: string, userId: string): Promise<{ id: string; name: string } | null> {
  const rows = await sql()`SELECT id, name FROM finance_spaces WHERE share_code = ${code.trim().toUpperCase()} LIMIT 1`
  if (!rows[0]) return null
  await sql()`INSERT INTO finance_space_members (space_id, user_id) VALUES (${rows[0].id}, ${userId}) ON CONFLICT DO NOTHING`
  return { id: rows[0].id, name: rows[0].name }
}

// владелец не выходит из своего кабинета — он его удаляет
export async function leaveSpace(spaceId: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM finance_space_members WHERE space_id = ${spaceId} AND user_id = ${userId}
    AND NOT EXISTS (SELECT 1 FROM finance_spaces WHERE id = ${spaceId} AND owner_id = ${userId})`
}

// ── Чтение ────────────────────────────────────────────────────────────────────

export async function getAccounts(spaceId: string, userId: string): Promise<Account[]> {
  const rows = await sql()`
    SELECT a.id, a.user_id, a.space_id, a.name, a.type, a.currency, a.emoji, a.color,
           a.balance::float8 AS balance, a.principal::float8 AS principal,
           to_char(a.start_date, 'YYYY-MM-DD') AS start_date, a.capitalization, a.archived, a.sort_order, a.created_at
    FROM finance_accounts a
    JOIN finance_space_members m ON m.space_id = a.space_id AND m.user_id = ${userId}
    WHERE a.space_id = ${spaceId}
    ORDER BY a.sort_order, a.created_at`
  if (rows.length === 0) return []
  const ids = rows.map((r: any) => r.id)
  const rateRows = await sql()`
    SELECT id, account_id, to_char(from_date, 'YYYY-MM-DD') AS from_date, rate::float8 AS rate
    FROM finance_deposit_rates WHERE account_id = ANY(${ids}) ORDER BY from_date`
  const byAcc: Record<string, DepositRate[]> = {}
  for (const r of rateRows as any[]) (byAcc[r.account_id] ??= []).push({ id: r.id, fromDate: r.from_date, rate: Number(r.rate) })
  return rows.map((r: any) => mapAccount(r, byAcc[r.id] ?? []))
}

export async function getAccount(id: string, userId: string): Promise<Account | null> {
  const rows = await sql()`
    SELECT a.id, a.user_id, a.space_id, a.name, a.type, a.currency, a.emoji, a.color,
           a.balance::float8 AS balance, a.principal::float8 AS principal,
           to_char(a.start_date, 'YYYY-MM-DD') AS start_date, a.capitalization, a.archived, a.sort_order, a.created_at
    FROM finance_accounts a
    JOIN finance_space_members m ON m.space_id = a.space_id AND m.user_id = ${userId}
    WHERE a.id = ${id} LIMIT 1`
  if (!rows[0]) return null
  const rateRows = await sql()`
    SELECT id, to_char(from_date, 'YYYY-MM-DD') AS from_date, rate::float8 AS rate
    FROM finance_deposit_rates WHERE account_id = ${id} ORDER BY from_date`
  return mapAccount(rows[0], (rateRows as any[]).map(r => ({ id: r.id, fromDate: r.from_date, rate: Number(r.rate) })))
}

// ── Запись ────────────────────────────────────────────────────────────────────

export interface AccountInput {
  name: string
  type?: AccountType
  currency?: string
  emoji?: string
  color?: string
  balance?: number
  principal?: number
  startDate?: string | null
  capitalization?: 'monthly' | 'none'
}

export async function createAccount(spaceId: string, userId: string, a: AccountInput): Promise<Account> {
  if (!(await isMember(spaceId, userId))) throw new Error('not found')
  const rows = await sql()`
    INSERT INTO finance_accounts (user_id, space_id, name, type, currency, emoji, color, balance, principal, start_date, capitalization)
    VALUES (${userId}, ${spaceId}, ${a.name}, ${a.type ?? 'cash'}, ${a.currency ?? '₸'}, ${a.emoji ?? '💵'},
            ${a.color ?? '#3ddc97'}, ${a.balance ?? 0}, ${a.principal ?? 0}, ${a.startDate ?? null}::date, ${a.capitalization ?? 'monthly'})
    RETURNING id, user_id, space_id, name, type, currency, emoji, color,
              balance::float8 AS balance, principal::float8 AS principal,
              to_char(start_date, 'YYYY-MM-DD') AS start_date, capitalization, archived, sort_order, created_at`
  return mapAccount(rows[0], [])
}

// правки скоупятся по членству в кабинете счёта — участники правят общие счета
export async function updateAccount(id: string, userId: string, f: Partial<AccountInput & { archived: boolean; sortOrder: number }>): Promise<void> {
  if (f.name       !== undefined) await sql()`UPDATE finance_accounts a SET name       = ${f.name}       FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.type       !== undefined) await sql()`UPDATE finance_accounts a SET type       = ${f.type}       FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.currency   !== undefined) await sql()`UPDATE finance_accounts a SET currency   = ${f.currency}   FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.emoji      !== undefined) await sql()`UPDATE finance_accounts a SET emoji      = ${f.emoji}      FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.color      !== undefined) await sql()`UPDATE finance_accounts a SET color      = ${f.color}      FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.balance    !== undefined) await sql()`UPDATE finance_accounts a SET balance    = ${f.balance}    FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.principal  !== undefined) await sql()`UPDATE finance_accounts a SET principal  = ${f.principal}  FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.startDate  !== undefined) await sql()`UPDATE finance_accounts a SET start_date = ${f.startDate}::date FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.capitalization !== undefined) await sql()`UPDATE finance_accounts a SET capitalization = ${f.capitalization} FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.archived   !== undefined) await sql()`UPDATE finance_accounts a SET archived   = ${f.archived}   FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
  if (f.sortOrder  !== undefined) await sql()`UPDATE finance_accounts a SET sort_order = ${f.sortOrder}  FROM finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
}

export async function deleteAccount(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_accounts a USING finance_space_members m WHERE a.id = ${id} AND m.space_id = a.space_id AND m.user_id = ${userId}`
}

// ── Ставки депозита ─────────────────────────────────────────────────────────────

async function memberOfAccount(accountId: string, userId: string): Promise<{ spaceId: string } | null> {
  const r = await sql()`
    SELECT a.space_id FROM finance_accounts a
    JOIN finance_space_members m ON m.space_id = a.space_id AND m.user_id = ${userId}
    WHERE a.id = ${accountId} LIMIT 1`
  return r[0] ? { spaceId: (r[0] as any).space_id } : null
}

export async function addRate(accountId: string, userId: string, fromDate: string, rate: number): Promise<DepositRate> {
  if (!(await memberOfAccount(accountId, userId))) throw new Error('not found')
  const rows = await sql()`
    INSERT INTO finance_deposit_rates (account_id, from_date, rate)
    VALUES (${accountId}, ${fromDate}::date, ${rate})
    RETURNING id, to_char(from_date, 'YYYY-MM-DD') AS from_date, rate::float8 AS rate`
  return { id: rows[0].id, fromDate: rows[0].from_date, rate: Number(rows[0].rate) }
}

export async function deleteRate(rateId: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM finance_deposit_rates r
    USING finance_accounts a, finance_space_members m
    WHERE r.id = ${rateId} AND r.account_id = a.id AND m.space_id = a.space_id AND m.user_id = ${userId}`
}

// ── Курсы валют (глобальные — одни на все кабинеты пользователя) ─────────────────
// Раньше были per-kabinet (finance_space_settings); курс валюты — объективный
// факт, а не мнение кабинета, так что держать его разным для «Личного» и
// «Бизнеса» не имело смысла. Теперь одна строка finance_global_rates на всех.

export interface FinanceSettings {
  baseCurrency: string
  rates: Record<string, number>   // 1 единица валюты = X базовой
}

export async function getSettings(userId: string): Promise<FinanceSettings> {
  const rows = await sql()`SELECT base_currency, rates FROM finance_global_rates WHERE id = 'global' LIMIT 1`
  if (!rows[0]) return { baseCurrency: '', rates: {} }
  const r = rows[0]
  return { baseCurrency: r.base_currency ?? '', rates: (typeof r.rates === 'string' ? JSON.parse(r.rates) : r.rates) ?? {} }
}

export async function saveSettings(userId: string, baseCurrency: string, rates: Record<string, number>): Promise<void> {
  await sql()`
    INSERT INTO finance_global_rates (id, base_currency, rates, updated_at)
    VALUES ('global', ${baseCurrency}, ${JSON.stringify(rates)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET base_currency = EXCLUDED.base_currency, rates = EXCLUDED.rates, updated_at = now()`
}

// ── Транзакции ──────────────────────────────────────────────────────────────────

export type TxnType = 'expense' | 'income' | 'transfer'

export interface Txn {
  id: string
  userId: string
  authorName: string
  accountId: string
  type: TxnType
  amount: number
  category: string
  comment: string
  day: string
  toAccountId: string | null
  toAmount: number | null
  createdAt: string
}

function mapTxn(r: any): Txn {
  return {
    id: r.id, userId: r.user_id, authorName: r.author_name ?? '', accountId: r.account_id, type: r.type as TxnType,
    amount: Number(r.amount), category: r.category ?? '', comment: r.comment ?? '',
    day: r.day, toAccountId: r.to_account_id ?? null, toAmount: r.to_amount == null ? null : Number(r.to_amount),
    createdAt: r.created_at,
  }
}

export async function getTxns(spaceId: string, userId: string, limit = 300): Promise<Txn[]> {
  const rows = await sql()`
    SELECT t.id, t.user_id, u.username AS author_name, t.account_id, t.type, t.amount::float8 AS amount, t.category, t.comment,
           to_char(t.day, 'YYYY-MM-DD') AS day, t.to_account_id, t.to_amount::float8 AS to_amount, t.created_at
    FROM finance_txns t
    JOIN finance_space_members m ON m.space_id = t.space_id AND m.user_id = ${userId}
    LEFT JOIN todo_users u ON u.id = t.user_id
    WHERE t.space_id = ${spaceId}
    ORDER BY t.day DESC, t.created_at DESC LIMIT ${limit}`
  return (rows as any[]).map(mapTxn)
}

export interface TxnInput {
  accountId: string
  type: TxnType
  amount: number
  category?: string
  comment?: string
  day?: string
}

// создаёт операцию и атомарно меняет баланс счёта. Возвращает {txn, delta}.
export async function createTxn(userId: string, t: TxnInput): Promise<{ txn: Txn; delta: number }> {
  const acc = await memberOfAccount(t.accountId, userId)
  if (!acc) throw new Error('not found')
  const amount = Math.abs(Number(t.amount))
  const delta = t.type === 'expense' ? -amount : amount
  const q = sql()
  const res = await q.transaction([
    q`INSERT INTO finance_txns (user_id, space_id, account_id, type, amount, category, comment, day)
      VALUES (${userId}, ${acc.spaceId}, ${t.accountId}, ${t.type}, ${amount}, ${t.category ?? ''}, ${t.comment ?? ''}, COALESCE(${t.day ?? null}::date, CURRENT_DATE))
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`,
    q`UPDATE finance_accounts SET balance = balance + ${delta} WHERE id = ${t.accountId}`,
  ])
  const row = (res[0] as any[])[0]
  const author = await sql()`SELECT username FROM todo_users WHERE id = ${userId} LIMIT 1`
  row.author_name = (author[0] as any)?.username ?? ''
  return { txn: mapTxn(row), delta }
}

// редактирует расход/доход (не перевод — тот трогает 2 счёта, правится через удаление+создание).
// Атомарно доносит разницу суммы до баланса счёта, если amount изменился.
export interface TxnEditInput { amount?: number; category?: string; comment?: string; day?: string }

export async function editTxn(id: string, userId: string, patch: TxnEditInput): Promise<{ txn: Txn; balanceDelta: number } | null> {
  const rows = await sql()`
    SELECT t.account_id, t.type, t.amount::float8 AS amount
    FROM finance_txns t
    JOIN finance_space_members m ON m.space_id = t.space_id AND m.user_id = ${userId}
    WHERE t.id = ${id} AND t.type IN ('expense','income') LIMIT 1`
  const cur = rows[0] as any
  if (!cur) return null

  const newAmount = patch.amount !== undefined ? Math.abs(Number(patch.amount)) : Number(cur.amount)
  const sign = cur.type === 'expense' ? -1 : 1
  const balanceDelta = (newAmount - Number(cur.amount)) * sign

  const q = sql()
  const statements = [
    q`UPDATE finance_txns SET
        amount   = ${newAmount},
        category = COALESCE(${patch.category ?? null}, category),
        comment  = COALESCE(${patch.comment ?? null}, comment),
        day      = COALESCE(${patch.day ?? null}::date, day)
      WHERE id = ${id}
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`,
  ]
  if (balanceDelta !== 0) statements.push(q`UPDATE finance_accounts SET balance = balance + ${balanceDelta} WHERE id = ${cur.account_id}`)
  const res = await q.transaction(statements)
  const row = (res[0] as any[])[0]
  const author = await sql()`SELECT username FROM todo_users WHERE id = ${row.user_id} LIMIT 1`
  row.author_name = (author[0] as any)?.username ?? ''
  return { txn: mapTxn(row), balanceDelta }
}

export interface TransferInput {
  fromAccountId: string
  toAccountId: string
  amount: number       // списывается с fromAccount
  toAmount?: number    // зачисляется на toAccount (для разных валют); по умолчанию = amount
  comment?: string
  day?: string
}

// перевод между счетами: списывает с одного, зачисляет на другой (атомарно)
export async function createTransfer(userId: string, t: TransferInput): Promise<Txn> {
  const own = await sql()`
    SELECT a.id, a.space_id FROM finance_accounts a
    JOIN finance_space_members m ON m.space_id = a.space_id AND m.user_id = ${userId}
    WHERE a.id IN (${t.fromAccountId}, ${t.toAccountId})`
  if (own.length < 2) throw new Error('not found')
  const spaceId = (own as any[]).find(r => r.id === t.fromAccountId)!.space_id
  const amount = Math.abs(Number(t.amount))
  const toAmount = Math.abs(Number(t.toAmount ?? t.amount))
  const q = sql()
  const res = await q.transaction([
    q`INSERT INTO finance_txns (user_id, space_id, account_id, type, amount, category, comment, day, to_account_id, to_amount)
      VALUES (${userId}, ${spaceId}, ${t.fromAccountId}, 'transfer', ${amount}, '', ${t.comment ?? ''}, COALESCE(${t.day ?? null}::date, CURRENT_DATE), ${t.toAccountId}, ${toAmount})
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`,
    q`UPDATE finance_accounts SET balance = balance - ${amount} WHERE id = ${t.fromAccountId}`,
    q`UPDATE finance_accounts SET balance = balance + ${toAmount} WHERE id = ${t.toAccountId}`,
  ])
  return mapTxn((res[0] as any[])[0])
}

// удаляет операцию и возвращает баланс назад.
export async function deleteTxn(id: string, userId: string): Promise<{ reverts: { accountId: string; delta: number }[]; creditId?: string } | null> {
  const rows = await sql()`
    SELECT t.account_id, t.type, t.amount::float8 AS amount, t.to_account_id, t.to_amount::float8 AS to_amount, t.category
    FROM finance_txns t
    JOIN finance_space_members m ON m.space_id = t.space_id AND m.user_id = ${userId}
    WHERE t.id = ${id} LIMIT 1`
  if (!rows[0]) return null
  const r = rows[0] as any
  const amount = Math.abs(Number(r.amount))
  const q = sql()
  if (r.type === 'transfer') {
    const toAmount = Math.abs(Number(r.to_amount ?? r.amount))
    await q.transaction([
      q`DELETE FROM finance_txns WHERE id = ${id}`,
      q`UPDATE finance_accounts SET balance = balance + ${amount} WHERE id = ${r.account_id}`,
      q`UPDATE finance_accounts SET balance = balance - ${toAmount} WHERE id = ${r.to_account_id}`,
    ])
    return { reverts: [{ accountId: r.account_id, delta: amount }, { accountId: r.to_account_id, delta: -toAmount }] }
  }
  const reverse = r.type === 'expense' ? amount : -amount
  const statements = [
    q`DELETE FROM finance_txns WHERE id = ${id}`,
    q`UPDATE finance_accounts SET balance = balance + ${reverse} WHERE id = ${r.account_id}`,
  ]
  // операция связана с платежом по кредиту/долгу (см. createCreditPayment) — откатываем и его,
  // иначе кредит останется «погашен» на эту сумму без единой видимой операции
  let creditId: string | undefined
  if (typeof r.category === 'string' && r.category.startsWith('credit:')) {
    creditId = r.category.slice('credit:'.length)
    const crows = await sql()`SELECT remaining::float8 AS remaining FROM finance_credits WHERE id = ${creditId} LIMIT 1`
    if (crows[0]) {
      const newRemaining = Math.round((Number((crows[0] as any).remaining) + amount) * 100) / 100
      statements.push(q`UPDATE finance_credits SET remaining = ${newRemaining}, archived = false WHERE id = ${creditId}`)
      statements.push(q`DELETE FROM finance_credit_payments WHERE txn_id = ${id}`)
    } else {
      creditId = undefined
    }
  }
  await q.transaction(statements)
  return { reverts: [{ accountId: r.account_id, delta: reverse }], creditId }
}

// ── Категории (свои у каждого кабинета) ─────────────────────────────────────────

export interface Category { id: string; kind: 'expense' | 'income'; name: string; emoji: string; sortOrder: number }

const DEFAULT_CATEGORIES: { kind: 'expense' | 'income'; key: string; emoji: string }[] = [
  { kind: 'expense', key: 'food', emoji: '🍔' }, { kind: 'expense', key: 'groceries', emoji: '🛒' },
  { kind: 'expense', key: 'transport', emoji: '🚗' }, { kind: 'expense', key: 'home', emoji: '🏠' },
  { kind: 'expense', key: 'cafe', emoji: '☕' }, { kind: 'expense', key: 'health', emoji: '💊' },
  { kind: 'expense', key: 'fun', emoji: '🎉' }, { kind: 'expense', key: 'clothes', emoji: '👕' },
  { kind: 'expense', key: 'bills', emoji: '📱' }, { kind: 'expense', key: 'gifts', emoji: '🎁' },
  { kind: 'expense', key: 'other', emoji: '💸' },
  { kind: 'income', key: 'salary', emoji: '💼' }, { kind: 'income', key: 'extra', emoji: '🛠' },
  { kind: 'income', key: 'gift', emoji: '🎁' }, { kind: 'income', key: 'refund', emoji: '↩️' },
  { kind: 'income', key: 'other_inc', emoji: '💰' },
]

function mapCat(r: any): Category {
  return { id: r.id, kind: r.kind, name: r.name, emoji: r.emoji ?? '•', sortOrder: r.sort_order ?? 0 }
}

export async function getCategories(spaceId: string, userId: string, locale: Locale = 'ru'): Promise<Category[]> {
  if (!(await isMember(spaceId, userId))) return []
  let rows = await sql()`SELECT id, kind, name, emoji, sort_order FROM finance_categories WHERE space_id = ${spaceId} ORDER BY kind, sort_order, created_at`
  if (rows.length === 0) {
    // засеваем стандартный набор на языке того, кто первым открыл кабинет
    const tr = await getTranslations({ locale, namespace: 'financeDefaults.categories' })
    const q = sql()
    await q.transaction(DEFAULT_CATEGORIES.map((c, i) =>
      q`INSERT INTO finance_categories (user_id, space_id, kind, name, emoji, sort_order) VALUES (${userId}, ${spaceId}, ${c.kind}, ${tr(`${c.kind}.${c.key}`)}, ${c.emoji}, ${i})`))
    rows = await sql()`SELECT id, kind, name, emoji, sort_order FROM finance_categories WHERE space_id = ${spaceId} ORDER BY kind, sort_order, created_at`
  }
  return (rows as any[]).map(mapCat)
}

export async function createCategory(spaceId: string, userId: string, kind: 'expense' | 'income', name: string, emoji: string): Promise<Category> {
  if (!(await isMember(spaceId, userId))) throw new Error('not found')
  const rows = await sql()`
    INSERT INTO finance_categories (user_id, space_id, kind, name, emoji, sort_order)
    VALUES (${userId}, ${spaceId}, ${kind}, ${name}, ${emoji || '•'}, 100)
    RETURNING id, kind, name, emoji, sort_order`
  return mapCat(rows[0])
}

export async function deleteCategory(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_categories c USING finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
}

export async function updateCategory(id: string, userId: string, f: { name?: string; emoji?: string }): Promise<void> {
  if (f.name  !== undefined) await sql()`UPDATE finance_categories c SET name  = ${f.name}  FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.emoji !== undefined) await sql()`UPDATE finance_categories c SET emoji = ${f.emoji} FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
}

// ── Бюджеты ──────────────────────────────────────────────────────────────────

export interface Budget { id: string; categoryId: string; amount: number }

export async function getBudgets(spaceId: string, userId: string): Promise<Budget[]> {
  const rows = await sql()`
    SELECT b.id, b.category_id, b.amount::float8 AS amount
    FROM finance_budgets b
    JOIN finance_space_members m ON m.space_id = b.space_id AND m.user_id = ${userId}
    WHERE b.space_id = ${spaceId}`
  return (rows as any[]).map(r => ({ id: r.id, categoryId: r.category_id, amount: Number(r.amount) }))
}

export async function setBudget(userId: string, categoryId: string, amount: number): Promise<void> {
  const c = await sql()`
    SELECT c.space_id FROM finance_categories c
    JOIN finance_space_members m ON m.space_id = c.space_id AND m.user_id = ${userId}
    WHERE c.id = ${categoryId} LIMIT 1`
  if (!c[0]) throw new Error('not found')
  if (amount <= 0) {
    await sql()`DELETE FROM finance_budgets WHERE category_id = ${categoryId}`
    return
  }
  await sql()`
    INSERT INTO finance_budgets (user_id, space_id, category_id, amount) VALUES (${userId}, ${(c[0] as any).space_id}, ${categoryId}, ${amount})
    ON CONFLICT (category_id) DO UPDATE SET amount = EXCLUDED.amount`
}

// ── Шаблоны операций ────────────────────────────────────────────────────────────
// Быстрые чипсы в форме «+ Новая операция» для часто повторяющихся расход/доход —
// не отдельный экран, максимум 5 на кабинет, чтобы не разрастаться.
const MAX_TEMPLATES = 5

export interface OpTemplate {
  id: string
  kind: 'expense' | 'income'
  name: string
  accountId: string
  category: string
  amount: number
  comment: string
}

function mapTemplate(r: any): OpTemplate {
  return { id: r.id, kind: r.kind, name: r.name, accountId: r.account_id, category: r.category ?? '', amount: Number(r.amount), comment: r.comment ?? '' }
}

export async function getTemplates(spaceId: string, userId: string): Promise<OpTemplate[]> {
  if (!(await isMember(spaceId, userId))) return []
  const rows = await sql()`
    SELECT id, kind, name, account_id, category, amount::float8 AS amount, comment
    FROM finance_templates WHERE space_id = ${spaceId} ORDER BY sort_order, created_at`
  return (rows as any[]).map(mapTemplate)
}

export interface TemplateInput { kind: 'expense' | 'income'; name: string; accountId: string; category: string; amount: number; comment?: string }

export async function createTemplate(spaceId: string, userId: string, t: TemplateInput): Promise<OpTemplate> {
  if (!(await isMember(spaceId, userId))) throw new Error('not found')
  const count = await sql()`SELECT count(*)::int AS n FROM finance_templates WHERE space_id = ${spaceId}`
  if ((count[0] as any).n >= MAX_TEMPLATES) throw new Error('limit')
  const rows = await sql()`
    INSERT INTO finance_templates (space_id, user_id, kind, name, account_id, category, amount, comment, sort_order)
    VALUES (${spaceId}, ${userId}, ${t.kind}, ${t.name}, ${t.accountId}, ${t.category}, ${t.amount}, ${t.comment ?? ''},
      (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM finance_templates WHERE space_id = ${spaceId}))
    RETURNING id, kind, name, account_id, category, amount::float8 AS amount, comment`
  return mapTemplate(rows[0])
}

export async function deleteTemplate(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_templates t USING finance_space_members m WHERE t.id = ${id} AND m.space_id = t.space_id AND m.user_id = ${userId}`
}

// ── Кредиты / долги / рассрочки ────────────────────────────────────────────────
// direction осмыслен для kind='debt': 'owe' — я должен (платёж списывается со счёта),
// 'owed' — мне должны (платёж зачисляется на счёт). Кредит/рассрочка всегда 'owe'.

export type CreditKind = 'credit' | 'debt' | 'installment'
export type CreditDirection = 'owe' | 'owed'

export interface CreditPayment {
  id: string
  creditId: string
  userId: string
  authorName: string
  accountId: string | null
  amount: number
  day: string
  comment: string
  createdAt: string
}

export interface Credit {
  id: string
  spaceId: string
  userId: string
  kind: CreditKind
  direction: CreditDirection
  name: string
  counterparty: string
  currency: string
  principal: number
  remaining: number
  rate: number | null
  monthlyPayment: number | null
  startDate: string | null
  dueDate: string | null
  nextPaymentDate: string | null
  comment: string
  archived: boolean
  createdAt: string
  payments: CreditPayment[]
}

function mapPayment(r: any): CreditPayment {
  return {
    id: r.id, creditId: r.credit_id, userId: r.user_id, authorName: r.author_name ?? '',
    accountId: r.account_id ?? null, amount: Number(r.amount), day: r.day, comment: r.comment ?? '', createdAt: r.created_at,
  }
}

function mapCredit(r: any, payments: CreditPayment[] = []): Credit {
  return {
    id: r.id, spaceId: r.space_id, userId: r.user_id, kind: r.kind as CreditKind, direction: r.direction as CreditDirection,
    name: r.name, counterparty: r.counterparty ?? '', currency: r.currency,
    principal: Number(r.principal), remaining: Number(r.remaining),
    rate: r.rate == null ? null : Number(r.rate), monthlyPayment: r.monthly_payment == null ? null : Number(r.monthly_payment),
    startDate: r.start_date ?? null, dueDate: r.due_date ?? null, nextPaymentDate: r.next_payment_date ?? null,
    comment: r.comment ?? '', archived: r.archived, createdAt: r.created_at, payments,
  }
}

function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, d))
  return dt.toISOString().slice(0, 10)
}

// столбцы всегда квалифицированы алиасом c — finance_space_members тоже содержит
// space_id/user_id, без префикса Postgres даёт "column reference is ambiguous"
// при джойне (getCredits); в INSERT/UPDATE без джойна алиас c добавляется явно.
const CREDIT_FIELDS = `
  c.id, c.space_id, c.user_id, c.kind, c.direction, c.name, c.counterparty, c.currency,
  c.principal::float8 AS principal, c.remaining::float8 AS remaining, c.rate::float8 AS rate, c.monthly_payment::float8 AS monthly_payment,
  to_char(c.start_date,'YYYY-MM-DD') AS start_date, to_char(c.due_date,'YYYY-MM-DD') AS due_date,
  to_char(c.next_payment_date,'YYYY-MM-DD') AS next_payment_date, c.comment, c.archived, c.created_at`

export async function getCredits(spaceId: string, userId: string): Promise<Credit[]> {
  const rows = await sql()`
    SELECT ${sql().unsafe(CREDIT_FIELDS)} FROM finance_credits c
    JOIN finance_space_members m ON m.space_id = c.space_id AND m.user_id = ${userId}
    WHERE c.space_id = ${spaceId}
    ORDER BY c.archived, c.created_at DESC`
  if (rows.length === 0) return []
  const ids = (rows as any[]).map(r => r.id)
  const payRows = await sql()`
    SELECT p.id, p.credit_id, p.user_id, u.username AS author_name, p.account_id, p.amount::float8 AS amount,
      to_char(p.day,'YYYY-MM-DD') AS day, p.comment, p.created_at
    FROM finance_credit_payments p
    LEFT JOIN todo_users u ON u.id = p.user_id
    WHERE p.credit_id = ANY(${ids}) ORDER BY p.day DESC, p.created_at DESC`
  const byCredit: Record<string, CreditPayment[]> = {}
  for (const r of payRows as any[]) (byCredit[r.credit_id] ??= []).push(mapPayment(r))
  return (rows as any[]).map(r => mapCredit(r, byCredit[r.id] ?? []))
}

export interface CreditInput {
  kind: CreditKind
  direction?: CreditDirection
  name: string
  counterparty?: string
  currency?: string
  principal?: number
  remaining?: number
  rate?: number | null
  monthlyPayment?: number | null
  startDate?: string | null
  dueDate?: string | null
  nextPaymentDate?: string | null
  comment?: string
}

export async function createCredit(spaceId: string, userId: string, c: CreditInput): Promise<Credit> {
  if (!(await isMember(spaceId, userId))) throw new Error('not found')
  const principal = c.principal ?? 0
  const remaining = c.remaining ?? principal
  const rows = await sql()`
    INSERT INTO finance_credits AS c (space_id, user_id, kind, direction, name, counterparty, currency, principal, remaining, rate, monthly_payment, start_date, due_date, next_payment_date, comment)
    VALUES (${spaceId}, ${userId}, ${c.kind}, ${c.direction ?? 'owe'}, ${c.name}, ${c.counterparty ?? ''}, ${c.currency ?? '₸'},
            ${principal}, ${remaining}, ${c.rate ?? null}, ${c.monthlyPayment ?? null},
            ${c.startDate ?? null}::date, ${c.dueDate ?? null}::date, ${c.nextPaymentDate ?? null}::date, ${c.comment ?? ''})
    RETURNING ${sql().unsafe(CREDIT_FIELDS)}`
  return mapCredit(rows[0], [])
}

export async function updateCredit(id: string, userId: string, f: Partial<CreditInput & { archived: boolean }>): Promise<void> {
  if (f.kind            !== undefined) await sql()`UPDATE finance_credits c SET kind             = ${f.kind}            FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.direction        !== undefined) await sql()`UPDATE finance_credits c SET direction        = ${f.direction}        FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.name             !== undefined) await sql()`UPDATE finance_credits c SET name             = ${f.name}             FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.counterparty      !== undefined) await sql()`UPDATE finance_credits c SET counterparty     = ${f.counterparty}      FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.currency          !== undefined) await sql()`UPDATE finance_credits c SET currency         = ${f.currency}          FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.principal         !== undefined) await sql()`UPDATE finance_credits c SET principal        = ${f.principal}         FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.remaining         !== undefined) await sql()`UPDATE finance_credits c SET remaining        = ${f.remaining}         FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.rate              !== undefined) await sql()`UPDATE finance_credits c SET rate             = ${f.rate}              FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.monthlyPayment    !== undefined) await sql()`UPDATE finance_credits c SET monthly_payment  = ${f.monthlyPayment}    FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.startDate         !== undefined) await sql()`UPDATE finance_credits c SET start_date       = ${f.startDate}::date   FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.dueDate            !== undefined) await sql()`UPDATE finance_credits c SET due_date         = ${f.dueDate}::date     FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.nextPaymentDate    !== undefined) await sql()`UPDATE finance_credits c SET next_payment_date = ${f.nextPaymentDate}::date FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.comment           !== undefined) await sql()`UPDATE finance_credits c SET comment          = ${f.comment}          FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
  if (f.archived          !== undefined) await sql()`UPDATE finance_credits c SET archived         = ${f.archived}         FROM finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
}

export async function deleteCredit(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_credits c USING finance_space_members m WHERE c.id = ${id} AND m.space_id = c.space_id AND m.user_id = ${userId}`
}

export interface CreditPaymentInput {
  accountId?: string | null
  amount: number
  day?: string
  comment?: string
  advanceNextPayment?: boolean // сдвинуть next_payment_date на месяц вперёд (оплата регулярного платежа)
}

// платёж по кредиту/долгу: уменьшает остаток и (если указан счёт) атомарно меняет его баланс —
// списание для 'owe', зачисление для 'owed'. Остаток не уходит в минус, при 0 кредит закрывается.
// Если указан счёт — платёж ТАКЖЕ пишется в finance_txns (category = 'credit:<id>', вне бюджетов
// по категориям), чтобы он был виден в «Последние операции», а не только в истории платежей кредита.
export async function createCreditPayment(creditId: string, userId: string, p: CreditPaymentInput): Promise<{ payment: CreditPayment; credit: Credit; txn: Txn | null } | null> {
  const rows = await sql()`
    SELECT c.space_id, c.name, c.direction, c.remaining::float8 AS remaining, to_char(c.next_payment_date,'YYYY-MM-DD') AS next_payment_date
    FROM finance_credits c
    JOIN finance_space_members m ON m.space_id = c.space_id AND m.user_id = ${userId}
    WHERE c.id = ${creditId} LIMIT 1`
  const cur = rows[0] as any
  if (!cur) return null
  const amount = Math.abs(Number(p.amount))
  const accountDelta = cur.direction === 'owe' ? -amount : amount
  const newRemaining = Math.max(0, Math.round((Number(cur.remaining) - amount) * 100) / 100)
  const newNextDate = (p.advanceNextPayment && cur.next_payment_date) ? addMonths(cur.next_payment_date, 1) : null

  const q = sql()
  const statements = [
    q`INSERT INTO finance_credit_payments (credit_id, user_id, account_id, amount, day, comment)
      VALUES (${creditId}, ${userId}, ${p.accountId ?? null}, ${amount}, COALESCE(${p.day ?? null}::date, CURRENT_DATE), ${p.comment ?? ''})
      RETURNING id, credit_id, user_id, account_id, amount::float8 AS amount, to_char(day,'YYYY-MM-DD') AS day, comment, created_at`,
    newNextDate
      ? q`UPDATE finance_credits AS c SET remaining = ${newRemaining}, archived = ${newRemaining <= 0}, next_payment_date = ${newNextDate}::date WHERE id = ${creditId} RETURNING ${sql().unsafe(CREDIT_FIELDS)}`
      : q`UPDATE finance_credits AS c SET remaining = ${newRemaining}, archived = ${newRemaining <= 0} WHERE id = ${creditId} RETURNING ${sql().unsafe(CREDIT_FIELDS)}`,
  ]
  let txnIndex = -1
  if (p.accountId) {
    statements.push(q`UPDATE finance_accounts SET balance = balance + ${accountDelta} WHERE id = ${p.accountId}`)
    const txnType = cur.direction === 'owe' ? 'expense' : 'income'
    const txnComment = cur.name + (p.comment ? ` · ${p.comment}` : '')
    statements.push(q`INSERT INTO finance_txns (user_id, space_id, account_id, type, amount, category, comment, day)
      VALUES (${userId}, ${cur.space_id}, ${p.accountId}, ${txnType}, ${amount}, ${'credit:' + creditId}, ${txnComment}, COALESCE(${p.day ?? null}::date, CURRENT_DATE))
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`)
    txnIndex = 3
  }
  const res = await q.transaction(statements)
  const payRow = (res[0] as any[])[0]
  const author = await sql()`SELECT username FROM todo_users WHERE id = ${userId} LIMIT 1`
  payRow.author_name = (author[0] as any)?.username ?? ''
  const creditRow = (res[1] as any[])[0]
  let txn: Txn | null = null
  if (txnIndex >= 0) {
    const txnRow = (res[txnIndex] as any[])[0]
    txnRow.author_name = payRow.author_name
    txn = mapTxn(txnRow)
    // связываем платёж с операцией, чтобы при удалении платежа удалить и её (см. deleteCreditPayment)
    await sql()`UPDATE finance_credit_payments SET txn_id = ${txn.id} WHERE id = ${payRow.id}`
  }
  return { payment: mapPayment(payRow), credit: mapCredit(creditRow, []), txn }
}

// удаляет платёж и возвращает остаток кредита / баланс счёта назад; если платёж был связан
// с операцией в finance_txns (см. createCreditPayment) — удаляет и её, чтобы не оставалась «призраком»
export async function deleteCreditPayment(paymentId: string, userId: string): Promise<{ creditId: string; accountId: string | null; accountDelta: number; txnId: string | null } | null> {
  const rows = await sql()`
    SELECT p.credit_id, p.account_id, p.amount::float8 AS amount, p.txn_id, c.direction, c.remaining::float8 AS remaining
    FROM finance_credit_payments p
    JOIN finance_credits c ON c.id = p.credit_id
    JOIN finance_space_members m ON m.space_id = c.space_id AND m.user_id = ${userId}
    WHERE p.id = ${paymentId} LIMIT 1`
  const cur = rows[0] as any
  if (!cur) return null
  const amount = Math.abs(Number(cur.amount))
  const newRemaining = Math.round((Number(cur.remaining) + amount) * 100) / 100
  const accountDelta = cur.direction === 'owe' ? amount : -amount // revert
  const q = sql()
  const statements = [
    q`DELETE FROM finance_credit_payments WHERE id = ${paymentId}`,
    q`UPDATE finance_credits SET remaining = ${newRemaining}, archived = false WHERE id = ${cur.credit_id}`,
  ]
  if (cur.account_id) statements.push(q`UPDATE finance_accounts SET balance = balance + ${accountDelta} WHERE id = ${cur.account_id}`)
  if (cur.txn_id) statements.push(q`DELETE FROM finance_txns WHERE id = ${cur.txn_id}`)
  await q.transaction(statements)
  return { creditId: cur.credit_id, accountId: cur.account_id ?? null, accountDelta: cur.account_id ? accountDelta : 0, txnId: cur.txn_id ?? null }
}
