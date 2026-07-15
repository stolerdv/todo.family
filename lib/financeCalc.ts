import type { Account, DepositRate, FinanceSettings, Txn } from './finance'
import { Dates } from './trackerStats'

type Translator = (key: string, values?: Record<string, any>) => string

export interface DepositResult {
  value: number       // текущая сумма (тело + начисленные проценты)
  interest: number    // сколько начислено сверх тела
  currentRate: number | null
}

function currentRateOf(rates: DepositRate[], today: string): number | null {
  let cur: number | null = null
  for (const r of rates) if (r.fromDate <= today) cur = r.rate
  return cur
}

// Текущая сумма депозита. Для каждого периода ставки начисляем проценты на текущий баланс:
// при ежемесячной капитализации проценты капитализируются помесячно (номинальная ставка → эффективная),
// иначе — простое начисление. Между периодами баланс всегда переносится.
export function depositValue(acc: Account, today: string): DepositResult {
  const principal = acc.principal || 0
  const start = acc.startDate
  const monthly = acc.capitalization !== 'none'
  const rates = [...acc.rates].sort((a, b) => (a.fromDate < b.fromDate ? -1 : 1))
  if (!start || rates.length === 0) {
    return { value: principal, interest: 0, currentRate: rates.length ? currentRateOf(rates, today) : null }
  }
  let value = principal
  for (let i = 0; i < rates.length; i++) {
    const segStart = rates[i].fromDate < start ? start : rates[i].fromDate
    let segEnd = i + 1 < rates.length ? rates[i + 1].fromDate : today
    if (segEnd > today) segEnd = today
    const days = Dates.diffDays(segStart, segEnd)
    if (days > 0) {
      const r = rates[i].rate / 100
      if (monthly) value *= Math.pow(1 + r / 12, days / 30.4375)
      else value += value * r * (days / 365)
    }
  }
  return { value, interest: value - principal, currentRate: currentRateOf(rates, today) }
}

// эффективная годовая доходность для номинальной ставки (с учётом капитализации)
export function effectiveRate(nominal: number, capitalization: 'monthly' | 'none'): number {
  if (capitalization === 'none') return nominal
  return (Math.pow(1 + nominal / 100 / 12, 12) - 1) * 100
}

// Текущая ценность счёта (для депозита — вычисляется, иначе — баланс)
export function accountValue(acc: Account, today: string): number {
  return acc.type === 'deposit' ? depositValue(acc, today).value : acc.balance
}

// decimals не задан → авто: если есть копейки (не целое число) — показываем 2 знака,
// иначе 0. Раньше всегда округляло до целого и введённые копейки визуально «терялись»
// (сумма сохранялась верно, но не была видна на экране).
export function formatMoney(n: number, currency = '', decimals?: number, locale = 'ru-RU'): string {
  const hasCents = Math.round(n * 100) % 100 !== 0
  const d = decimals !== undefined ? decimals : (hasCents ? 2 : 0)
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(
    d ? n : Math.round(n),
  )
  return currency ? `${s} ${currency}` : s
}

export const ACCOUNT_TYPES: { value: Account['type']; emoji: string }[] = [
  { value: 'cash',    emoji: '💵' },
  { value: 'card',    emoji: '💳' },
  { value: 'bank',    emoji: '🏦' },
  { value: 'savings', emoji: '🐷' },
  { value: 'deposit', emoji: '📈' },
  { value: 'other',   emoji: '💰' },
]

export function typeLabel(t: Account['type'], tr: Translator): string {
  return tr(`accountTypes.${t}`)
}

// ── Валюты: пересчёт в базовую ─────────────────────────────────────────────────
// rate: 1 единица валюты = X базовой. Базовая валюта = 1.
export function convert(amount: number, from: string, settings: FinanceSettings): number | null {
  if (!settings.baseCurrency || from === settings.baseCurrency) return amount
  const r = settings.rates?.[from]
  if (!r || r <= 0) return null
  return amount * r
}

// Пересчитывает settings так, чтобы «базовой» стала другая валюта — для display-only
// переключателя валюты сверху (не меняет реальную сохранённую baseCurrency: бюджеты и
// «Свободно на месяц» хранятся в НАСТОЯЩЕЙ базовой валюте, менять её было бы разрушительно).
// rates остаются «1 единица валюты = X настоящей базовой», тут пересчитываем в «1 единица = X newBase».
export function rebase(settings: FinanceSettings, newBase: string): FinanceSettings {
  if (!newBase || newBase === settings.baseCurrency) return settings
  const toNewBase = settings.rates?.[newBase]
  if (!toNewBase || toNewBase <= 0) return { baseCurrency: newBase, rates: {} }
  const rates: Record<string, number> = { [settings.baseCurrency]: 1 / toNewBase }
  for (const [cur, r] of Object.entries(settings.rates ?? {})) {
    if (cur === newBase) continue
    rates[cur] = r / toNewBase
  }
  return { baseCurrency: newBase, rates }
}

export function combinedTotal(accounts: Account[], today: string, settings: FinanceSettings): { total: number; missing: string[] } {
  let total = 0
  const missing = new Set<string>()
  for (const a of accounts) {
    const v = accountValue(a, today)
    const c = convert(v, a.currency, settings)
    if (c === null) missing.add(a.currency)
    else total += c
  }
  return { total, missing: Array.from(missing) }
}

export function currenciesInUse(accounts: Account[]): string[] {
  return Array.from(new Set(accounts.map(a => a.currency)))
}

// ── Категории операций (легаси-фолбэк для старых операций, у которых category —
// строковый ключ вроде 'food', а не id из finance_categories) ───────────────────
export interface Category { key: string; label: string; emoji: string }

export const EXPENSE_CATEGORIES: { key: string; emoji: string }[] = [
  { key: 'food',      emoji: '🍔' },
  { key: 'groceries', emoji: '🛒' },
  { key: 'transport', emoji: '🚗' },
  { key: 'home',      emoji: '🏠' },
  { key: 'cafe',      emoji: '☕' },
  { key: 'health',    emoji: '💊' },
  { key: 'fun',       emoji: '🎉' },
  { key: 'clothes',   emoji: '👕' },
  { key: 'bills',     emoji: '📱' },
  { key: 'gifts',     emoji: '🎁' },
  { key: 'other',     emoji: '💸' },
]

export const INCOME_CATEGORIES: { key: string; emoji: string }[] = [
  { key: 'salary',    emoji: '💼' },
  { key: 'extra',     emoji: '🛠' },
  { key: 'gift',      emoji: '🎁' },
  { key: 'refund',    emoji: '↩️' },
  { key: 'other_inc', emoji: '💰' },
]

export function categoryMeta(key: string, tr: Translator): Category {
  const inExpense = EXPENSE_CATEGORIES.find(c => c.key === key)
  if (inExpense) return { key, emoji: inExpense.emoji, label: tr(`expense.${key}`) }
  const inIncome = INCOME_CATEGORIES.find(c => c.key === key)
  if (inIncome) return { key, emoji: inIncome.emoji, label: tr(`income.${key}`) }
  return { key, label: key || tr('expense.other'), emoji: '•' }
}

// ── Бюджеты: траты по категории за текущий месяц (в базовой валюте) ──────────────
export function categorySpend(categoryId: string, txns: Txn[], accounts: Account[], settings: FinanceSettings, today: string): number {
  const month = today.slice(0, 7) // 'YYYY-MM'
  const curOf = (id: string) => accounts.find(a => a.id === id)?.currency ?? settings.baseCurrency
  let sum = 0
  for (const t of txns) {
    if (t.type !== 'expense' || t.category !== categoryId) continue
    if (!t.day.startsWith(month)) continue
    const c = convert(t.amount, curOf(t.accountId), settings)
    if (c != null) sum += c
  }
  return sum
}
