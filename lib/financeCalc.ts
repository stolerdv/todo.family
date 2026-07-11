import type { Account, DepositRate, FinanceSettings, Txn } from './finance'
import { Dates } from './trackerStats'

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

export function formatMoney(n: number, currency = '', decimals = 0): string {
  const s = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    decimals ? n : Math.round(n),
  )
  return currency ? `${s} ${currency}` : s
}

export const ACCOUNT_TYPES: { value: Account['type']; label: string; emoji: string }[] = [
  { value: 'cash',    label: 'Наличные', emoji: '💵' },
  { value: 'card',    label: 'Карта',    emoji: '💳' },
  { value: 'bank',    label: 'Счёт',     emoji: '🏦' },
  { value: 'savings', label: 'Накопления', emoji: '🐷' },
  { value: 'deposit', label: 'Депозит',  emoji: '📈' },
  { value: 'other',   label: 'Другое',   emoji: '💰' },
]

export function typeLabel(t: Account['type']): string {
  return ACCOUNT_TYPES.find(x => x.value === t)?.label ?? t
}

// ── Валюты: пересчёт в базовую ─────────────────────────────────────────────────
// rate: 1 единица валюты = X базовой. Базовая валюта = 1.
export function convert(amount: number, from: string, settings: FinanceSettings): number | null {
  if (!settings.baseCurrency || from === settings.baseCurrency) return amount
  const r = settings.rates?.[from]
  if (!r || r <= 0) return null
  return amount * r
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

// ── Категории операций ─────────────────────────────────────────────────────────
export interface Category { key: string; label: string; emoji: string }

export const EXPENSE_CATEGORIES: Category[] = [
  { key: 'food',      label: 'Еда',         emoji: '🍔' },
  { key: 'groceries', label: 'Продукты',    emoji: '🛒' },
  { key: 'transport', label: 'Транспорт',   emoji: '🚗' },
  { key: 'home',      label: 'Дом',         emoji: '🏠' },
  { key: 'cafe',      label: 'Кафе',        emoji: '☕' },
  { key: 'health',    label: 'Здоровье',    emoji: '💊' },
  { key: 'fun',       label: 'Развлечения', emoji: '🎉' },
  { key: 'clothes',   label: 'Одежда',      emoji: '👕' },
  { key: 'bills',     label: 'Связь/ЖКХ',   emoji: '📱' },
  { key: 'gifts',     label: 'Подарки',     emoji: '🎁' },
  { key: 'other',     label: 'Прочее',      emoji: '💸' },
]

export const INCOME_CATEGORIES: Category[] = [
  { key: 'salary',    label: 'Зарплата',   emoji: '💼' },
  { key: 'extra',     label: 'Подработка', emoji: '🛠' },
  { key: 'gift',      label: 'Подарок',    emoji: '🎁' },
  { key: 'refund',    label: 'Возврат',    emoji: '↩️' },
  { key: 'other_inc', label: 'Прочее',     emoji: '💰' },
]

export function categoryMeta(key: string): Category {
  return [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.key === key)
    ?? { key, label: key || 'Прочее', emoji: '•' }
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
