// «Скрыть деньги» — режим приватности для сумм в Финансах и на «Сегодня».
// Флаг живёт вне React (модульная переменная), а не в контексте: компонентам,
// которые просто показывают суммы, не нужны пропсы или хуки — они вызывают
// fmt() вместо formatMoney() и получают текущее состояние автоматически.
// Перерисовку после переключения форсирует сама кнопка-переключатель (см.
// использование loadMoneyHidden/setMoneyHidden в FinancePage/TodayPage).
// Инициализируем false (не читаем localStorage на модульном уровне) — иначе
// SSR (там нет localStorage) и первый клиентский рендер разойдутся и React
// выдаст hydration mismatch; правильное значение подхватывается в useEffect.
import { formatMoney as formatMoneyReal } from './financeCalc'

let hidden = false

export function isMoneyHidden(): boolean {
  return hidden
}

export function setMoneyHidden(v: boolean): void {
  hidden = v
  if (typeof localStorage !== 'undefined') localStorage.setItem('fin_hide_money', v ? '1' : '0')
}

// вызывать в useEffect (после гидратации) — синхронизирует с сохранённым выбором
export function loadMoneyHidden(): void {
  if (typeof localStorage !== 'undefined') hidden = localStorage.getItem('fin_hide_money') === '1'
}

export function fmt(n: number, currency = '', decimals?: number): string {
  return hidden ? (currency ? `•••• ${currency}` : '••••') : formatMoneyReal(n, currency, decimals)
}
