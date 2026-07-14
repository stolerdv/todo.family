import type { CalEvent } from './db'
import { Dates } from './trackerStats'

// Есть ли событие (в т.ч. повторяющееся) на конкретную дату — считается на лету,
// без материализации будущих строк: цена одной проверки не растёт от того, что
// повторение уходит на много лет вперёд.
export function eventOccursOn(e: CalEvent, date: string): boolean {
  if (date < e.day) return false
  if (!e.repeat) return date === e.day
  if (e.repeat === 'daily') return true
  if (e.repeat === 'weekly') return Dates.weekday(date) === Dates.weekday(e.day)
  const d1 = Dates.parse(date), d2 = Dates.parse(e.day)
  if (e.repeat === 'monthly') return d1.getDate() === d2.getDate()
  if (e.repeat === 'yearly') return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth()
  return false
}
