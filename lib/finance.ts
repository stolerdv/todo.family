import { neon } from '@neondatabase/serverless'

export type AccountType = 'cash' | 'card' | 'bank' | 'savings' | 'deposit' | 'other'

export interface DepositRate {
  id: string
  fromDate: string   // 'YYYY-MM-DD'
  rate: number       // годовая ставка, %
}

export interface Account {
  id: string
  userId: string
  name: string
  type: AccountType
  currency: string
  emoji: string
  color: string
  balance: number          // для обычных счетов
  principal: number        // тело депозита
  startDate: string | null // дата открытия депозита
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
    id: r.id, userId: r.user_id, name: r.name, type: r.type as AccountType,
    currency: r.currency, emoji: r.emoji, color: r.color,
    balance: Number(r.balance), principal: Number(r.principal),
    startDate: r.start_date ?? null,
    capitalization: (r.capitalization ?? 'monthly') as 'monthly' | 'none',
    archived: r.archived, sortOrder: r.sort_order ?? 0, createdAt: r.created_at,
    rates,
  }
}

// ── Чтение ────────────────────────────────────────────────────────────────────

export async function getAccounts(userId: string): Promise<Account[]> {
  const rows = await sql()`
    SELECT id, user_id, name, type, currency, emoji, color,
           balance::float8 AS balance, principal::float8 AS principal,
           to_char(start_date, 'YYYY-MM-DD') AS start_date, capitalization, archived, sort_order, created_at
    FROM finance_accounts WHERE user_id = ${userId}
    ORDER BY sort_order, created_at`
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
    SELECT id, user_id, name, type, currency, emoji, color,
           balance::float8 AS balance, principal::float8 AS principal,
           to_char(start_date, 'YYYY-MM-DD') AS start_date, capitalization, archived, sort_order, created_at
    FROM finance_accounts WHERE id = ${id} AND user_id = ${userId} LIMIT 1`
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

export async function createAccount(userId: string, a: AccountInput): Promise<Account> {
  const rows = await sql()`
    INSERT INTO finance_accounts (user_id, name, type, currency, emoji, color, balance, principal, start_date, capitalization)
    VALUES (${userId}, ${a.name}, ${a.type ?? 'cash'}, ${a.currency ?? '₸'}, ${a.emoji ?? '💵'},
            ${a.color ?? '#3ddc97'}, ${a.balance ?? 0}, ${a.principal ?? 0}, ${a.startDate ?? null}::date, ${a.capitalization ?? 'monthly'})
    RETURNING id, user_id, name, type, currency, emoji, color,
              balance::float8 AS balance, principal::float8 AS principal,
              to_char(start_date, 'YYYY-MM-DD') AS start_date, capitalization, archived, sort_order, created_at`
  return mapAccount(rows[0], [])
}

export async function updateAccount(id: string, userId: string, f: Partial<AccountInput & { archived: boolean; sortOrder: number }>): Promise<void> {
  if (f.name       !== undefined) await sql()`UPDATE finance_accounts SET name       = ${f.name}       WHERE id = ${id} AND user_id = ${userId}`
  if (f.type       !== undefined) await sql()`UPDATE finance_accounts SET type       = ${f.type}       WHERE id = ${id} AND user_id = ${userId}`
  if (f.currency   !== undefined) await sql()`UPDATE finance_accounts SET currency   = ${f.currency}   WHERE id = ${id} AND user_id = ${userId}`
  if (f.emoji      !== undefined) await sql()`UPDATE finance_accounts SET emoji      = ${f.emoji}      WHERE id = ${id} AND user_id = ${userId}`
  if (f.color      !== undefined) await sql()`UPDATE finance_accounts SET color      = ${f.color}      WHERE id = ${id} AND user_id = ${userId}`
  if (f.balance    !== undefined) await sql()`UPDATE finance_accounts SET balance    = ${f.balance}    WHERE id = ${id} AND user_id = ${userId}`
  if (f.principal  !== undefined) await sql()`UPDATE finance_accounts SET principal  = ${f.principal}  WHERE id = ${id} AND user_id = ${userId}`
  if (f.startDate  !== undefined) await sql()`UPDATE finance_accounts SET start_date = ${f.startDate}::date WHERE id = ${id} AND user_id = ${userId}`
  if (f.capitalization !== undefined) await sql()`UPDATE finance_accounts SET capitalization = ${f.capitalization} WHERE id = ${id} AND user_id = ${userId}`
  if (f.archived   !== undefined) await sql()`UPDATE finance_accounts SET archived   = ${f.archived}   WHERE id = ${id} AND user_id = ${userId}`
  if (f.sortOrder  !== undefined) await sql()`UPDATE finance_accounts SET sort_order = ${f.sortOrder}  WHERE id = ${id} AND user_id = ${userId}`
}

export async function deleteAccount(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_accounts WHERE id = ${id} AND user_id = ${userId}`
}

// ── Ставки депозита ─────────────────────────────────────────────────────────────

async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
  const r = await sql()`SELECT 1 FROM finance_accounts WHERE id = ${accountId} AND user_id = ${userId} LIMIT 1`
  return !!r[0]
}

export async function addRate(accountId: string, userId: string, fromDate: string, rate: number): Promise<DepositRate> {
  if (!(await ownsAccount(accountId, userId))) throw new Error('not found')
  const rows = await sql()`
    INSERT INTO finance_deposit_rates (account_id, from_date, rate)
    VALUES (${accountId}, ${fromDate}::date, ${rate})
    RETURNING id, to_char(from_date, 'YYYY-MM-DD') AS from_date, rate::float8 AS rate`
  return { id: rows[0].id, fromDate: rows[0].from_date, rate: Number(rows[0].rate) }
}

export async function deleteRate(rateId: string, userId: string): Promise<void> {
  await sql()`
    DELETE FROM finance_deposit_rates r
    USING finance_accounts a
    WHERE r.id = ${rateId} AND r.account_id = a.id AND a.user_id = ${userId}`
}

// ── Настройки (базовая валюта + курсы) ──────────────────────────────────────────

export interface FinanceSettings {
  baseCurrency: string
  rates: Record<string, number>   // 1 единица валюты = X базовой
}

export async function getSettings(userId: string): Promise<FinanceSettings> {
  const rows = await sql()`SELECT base_currency, rates FROM finance_settings WHERE user_id = ${userId} LIMIT 1`
  if (!rows[0]) return { baseCurrency: '', rates: {} }
  const r = rows[0]
  return { baseCurrency: r.base_currency ?? '', rates: (typeof r.rates === 'string' ? JSON.parse(r.rates) : r.rates) ?? {} }
}

export async function saveSettings(userId: string, baseCurrency: string, rates: Record<string, number>): Promise<void> {
  await sql()`
    INSERT INTO finance_settings (user_id, base_currency, rates)
    VALUES (${userId}, ${baseCurrency}, ${JSON.stringify(rates)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET base_currency = EXCLUDED.base_currency, rates = EXCLUDED.rates, updated_at = now()`
}

// ── Транзакции ──────────────────────────────────────────────────────────────────

export type TxnType = 'expense' | 'income' | 'transfer'

export interface Txn {
  id: string
  userId: string
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
    id: r.id, userId: r.user_id, accountId: r.account_id, type: r.type as TxnType,
    amount: Number(r.amount), category: r.category ?? '', comment: r.comment ?? '',
    day: r.day, toAccountId: r.to_account_id ?? null, toAmount: r.to_amount == null ? null : Number(r.to_amount),
    createdAt: r.created_at,
  }
}

export async function getTxns(userId: string, limit = 300): Promise<Txn[]> {
  const rows = await sql()`
    SELECT id, user_id, account_id, type, amount::float8 AS amount, category, comment,
           to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at
    FROM finance_txns WHERE user_id = ${userId}
    ORDER BY day DESC, created_at DESC LIMIT ${limit}`
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
  const own = await sql()`SELECT 1 FROM finance_accounts WHERE id = ${t.accountId} AND user_id = ${userId} LIMIT 1`
  if (!own[0]) throw new Error('not found')
  const amount = Math.abs(Number(t.amount))
  const delta = t.type === 'expense' ? -amount : amount
  const q = sql()
  const res = await q.transaction([
    q`INSERT INTO finance_txns (user_id, account_id, type, amount, category, comment, day)
      VALUES (${userId}, ${t.accountId}, ${t.type}, ${amount}, ${t.category ?? ''}, ${t.comment ?? ''}, COALESCE(${t.day ?? null}::date, CURRENT_DATE))
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`,
    q`UPDATE finance_accounts SET balance = balance + ${delta} WHERE id = ${t.accountId} AND user_id = ${userId}`,
  ])
  return { txn: mapTxn((res[0] as any[])[0]), delta }
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
  const own = await sql()`SELECT count(*)::int AS n FROM finance_accounts WHERE id IN (${t.fromAccountId}, ${t.toAccountId}) AND user_id = ${userId}`
  if ((own[0] as any).n < 2) throw new Error('not found')
  const amount = Math.abs(Number(t.amount))
  const toAmount = Math.abs(Number(t.toAmount ?? t.amount))
  const q = sql()
  const res = await q.transaction([
    q`INSERT INTO finance_txns (user_id, account_id, type, amount, category, comment, day, to_account_id, to_amount)
      VALUES (${userId}, ${t.fromAccountId}, 'transfer', ${amount}, '', ${t.comment ?? ''}, COALESCE(${t.day ?? null}::date, CURRENT_DATE), ${t.toAccountId}, ${toAmount})
      RETURNING id, user_id, account_id, type, amount::float8 AS amount, category, comment,
                to_char(day, 'YYYY-MM-DD') AS day, to_account_id, to_amount::float8 AS to_amount, created_at`,
    q`UPDATE finance_accounts SET balance = balance - ${amount} WHERE id = ${t.fromAccountId} AND user_id = ${userId}`,
    q`UPDATE finance_accounts SET balance = balance + ${toAmount} WHERE id = ${t.toAccountId} AND user_id = ${userId}`,
  ])
  return mapTxn((res[0] as any[])[0])
}

// удаляет операцию и возвращает баланс назад.
export async function deleteTxn(id: string, userId: string): Promise<{ reverts: { accountId: string; delta: number }[] } | null> {
  const rows = await sql()`
    SELECT account_id, type, amount::float8 AS amount, to_account_id, to_amount::float8 AS to_amount
    FROM finance_txns WHERE id = ${id} AND user_id = ${userId} LIMIT 1`
  if (!rows[0]) return null
  const r = rows[0] as any
  const amount = Math.abs(Number(r.amount))
  const q = sql()
  if (r.type === 'transfer') {
    const toAmount = Math.abs(Number(r.to_amount ?? r.amount))
    await q.transaction([
      q`DELETE FROM finance_txns WHERE id = ${id} AND user_id = ${userId}`,
      q`UPDATE finance_accounts SET balance = balance + ${amount} WHERE id = ${r.account_id} AND user_id = ${userId}`,
      q`UPDATE finance_accounts SET balance = balance - ${toAmount} WHERE id = ${r.to_account_id} AND user_id = ${userId}`,
    ])
    return { reverts: [{ accountId: r.account_id, delta: amount }, { accountId: r.to_account_id, delta: -toAmount }] }
  }
  const reverse = r.type === 'expense' ? amount : -amount
  await q.transaction([
    q`DELETE FROM finance_txns WHERE id = ${id} AND user_id = ${userId}`,
    q`UPDATE finance_accounts SET balance = balance + ${reverse} WHERE id = ${r.account_id} AND user_id = ${userId}`,
  ])
  return { reverts: [{ accountId: r.account_id, delta: reverse }] }
}

// ── Категории (пользовательские) ────────────────────────────────────────────────

export interface Category { id: string; kind: 'expense' | 'income'; name: string; emoji: string; sortOrder: number }

const DEFAULT_CATEGORIES: { kind: 'expense' | 'income'; name: string; emoji: string }[] = [
  { kind: 'expense', name: 'Еда', emoji: '🍔' }, { kind: 'expense', name: 'Продукты', emoji: '🛒' },
  { kind: 'expense', name: 'Транспорт', emoji: '🚗' }, { kind: 'expense', name: 'Дом', emoji: '🏠' },
  { kind: 'expense', name: 'Кафе', emoji: '☕' }, { kind: 'expense', name: 'Здоровье', emoji: '💊' },
  { kind: 'expense', name: 'Развлечения', emoji: '🎉' }, { kind: 'expense', name: 'Одежда', emoji: '👕' },
  { kind: 'expense', name: 'Связь/ЖКХ', emoji: '📱' }, { kind: 'expense', name: 'Подарки', emoji: '🎁' },
  { kind: 'expense', name: 'Прочее', emoji: '💸' },
  { kind: 'income', name: 'Зарплата', emoji: '💼' }, { kind: 'income', name: 'Подработка', emoji: '🛠' },
  { kind: 'income', name: 'Подарок', emoji: '🎁' }, { kind: 'income', name: 'Возврат', emoji: '↩️' },
  { kind: 'income', name: 'Прочее', emoji: '💰' },
]

function mapCat(r: any): Category {
  return { id: r.id, kind: r.kind, name: r.name, emoji: r.emoji ?? '•', sortOrder: r.sort_order ?? 0 }
}

export async function getCategories(userId: string): Promise<Category[]> {
  let rows = await sql()`SELECT id, kind, name, emoji, sort_order FROM finance_categories WHERE user_id = ${userId} ORDER BY kind, sort_order, created_at`
  if (rows.length === 0) {
    // засеваем стандартный набор при первом обращении
    const q = sql()
    await q.transaction(DEFAULT_CATEGORIES.map((c, i) =>
      q`INSERT INTO finance_categories (user_id, kind, name, emoji, sort_order) VALUES (${userId}, ${c.kind}, ${c.name}, ${c.emoji}, ${i})`))
    rows = await sql()`SELECT id, kind, name, emoji, sort_order FROM finance_categories WHERE user_id = ${userId} ORDER BY kind, sort_order, created_at`
  }
  return (rows as any[]).map(mapCat)
}

export async function createCategory(userId: string, kind: 'expense' | 'income', name: string, emoji: string): Promise<Category> {
  const rows = await sql()`
    INSERT INTO finance_categories (user_id, kind, name, emoji, sort_order)
    VALUES (${userId}, ${kind}, ${name}, ${emoji || '•'}, 100)
    RETURNING id, kind, name, emoji, sort_order`
  return mapCat(rows[0])
}

export async function deleteCategory(id: string, userId: string): Promise<void> {
  await sql()`DELETE FROM finance_categories WHERE id = ${id} AND user_id = ${userId}`
}

// ── Бюджеты ──────────────────────────────────────────────────────────────────

export interface Budget { id: string; categoryId: string; amount: number }

export async function getBudgets(userId: string): Promise<Budget[]> {
  const rows = await sql()`SELECT id, category_id, amount::float8 AS amount FROM finance_budgets WHERE user_id = ${userId}`
  return (rows as any[]).map(r => ({ id: r.id, categoryId: r.category_id, amount: Number(r.amount) }))
}

export async function setBudget(userId: string, categoryId: string, amount: number): Promise<void> {
  if (amount <= 0) {
    await sql()`DELETE FROM finance_budgets b USING finance_categories c WHERE b.category_id = ${categoryId} AND b.category_id = c.id AND c.user_id = ${userId}`
    return
  }
  await sql()`
    INSERT INTO finance_budgets (user_id, category_id, amount) VALUES (${userId}, ${categoryId}, ${amount})
    ON CONFLICT (category_id) DO UPDATE SET amount = EXCLUDED.amount`
}
