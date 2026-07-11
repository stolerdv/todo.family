import type { Habit, Schedule } from './tracker'

const DAY = 86400000

// Привычка с быстрым доступом к отметкам (Set вместо массива)
export interface HabitCalc {
  id: string
  name: string
  description: string
  emoji: string
  color: string
  schedule: Schedule
  startDate: string
  archived: boolean
  done: Set<string>
}

export function toCalc(h: Habit): HabitCalc {
  return {
    id: h.id, name: h.name, description: h.description, emoji: h.emoji,
    color: h.color, schedule: h.schedule, startDate: h.startDate,
    archived: h.archived, done: new Set(h.completions),
  }
}

export const Dates = {
  todayKey(): string { return Dates.key(new Date()) },

  key(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  parse(key: string): Date {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, m - 1, d)
  },

  addDays(key: string, n: number): string {
    const d = Dates.parse(key)
    d.setDate(d.getDate() + n)
    return Dates.key(d)
  },

  diffDays(a: string, b: string): number {
    return Math.round((Dates.parse(b).getTime() - Dates.parse(a).getTime()) / DAY)
  },

  weekday(key: string): number { // 0=Пн ... 6=Вс
    return (Dates.parse(key).getDay() + 6) % 7
  },

  weekStart(key: string): string {
    return Dates.addDays(key, -Dates.weekday(key))
  },

  human(key: string): string {
    return Dates.parse(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  },

  humanShort(key: string): string {
    return Dates.parse(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  },

  weekdayNames: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const,
}

export interface HeatCell {
  key: string; done: boolean; scheduled: boolean; future: boolean; beforeStart: boolean
}

export const Stats = {
  isScheduled(h: HabitCalc, key: string): boolean {
    if (key < h.startDate) return false
    const s = h.schedule || { type: 'daily' }
    if (s.type === 'daily') return true
    if (s.type === 'weekdays') return (s.days || []).includes(Dates.weekday(key))
    if (s.type === 'count') return true
    return true
  },

  scheduleLabel(h: HabitCalc): string {
    const s = h.schedule || { type: 'daily' }
    if (s.type === 'daily') return 'Каждый день'
    if (s.type === 'count') return `${s.perWeek} ${plural(s.perWeek, 'раз', 'раза', 'раз')} в неделю`
    if (s.type === 'weekdays') {
      const days = (s.days || []).slice().sort((a, b) => a - b)
      if (days.length === 7) return 'Каждый день'
      return days.map(d => Dates.weekdayNames[d]).join(', ')
    }
    return ''
  },

  scheduledDates(h: HabitCalc, today: string): string[] {
    const out: string[] = []
    let cur = h.startDate
    if (cur < earliest(h)) cur = earliest(h)
    while (cur <= today) {
      if (Stats.isScheduled(h, cur)) out.push(cur)
      cur = Dates.addDays(cur, 1)
    }
    return out
  },

  currentStreak(h: HabitCalc, today: string): number {
    const s = h.schedule || { type: 'daily' }
    if (s.type === 'count') return weekStreak(h, today).current

    let streak = 0
    let cur = today
    if (Stats.isScheduled(h, cur) && !h.done.has(cur)) cur = Dates.addDays(cur, -1)
    while (cur >= h.startDate) {
      if (Stats.isScheduled(h, cur)) {
        if (h.done.has(cur)) streak++
        else break
      }
      cur = Dates.addDays(cur, -1)
    }
    return streak
  },

  bestStreak(h: HabitCalc, today: string): number {
    const s = h.schedule || { type: 'daily' }
    if (s.type === 'count') return weekStreak(h, today).best

    const dates = Stats.scheduledDates(h, today)
    let best = 0, run = 0
    for (const d of dates) {
      if (h.done.has(d)) { run++; best = Math.max(best, run) }
      else run = 0
    }
    return best
  },

  weeklyBuckets(h: HabitCalc, today: string, maxWeeks: number): { weekStart: string; count: number }[] {
    const map: Record<string, number> = {}
    h.done.forEach(key => {
      const ws = Dates.weekStart(key)
      map[ws] = (map[ws] || 0) + 1
    })
    const out: { weekStart: string; count: number }[] = []
    let ws = Dates.weekStart(today)
    const startWeek = Dates.weekStart(h.startDate)
    let guard = 0
    while (ws >= startWeek && guard < maxWeeks) {
      out.unshift({ weekStart: ws, count: map[ws] || 0 })
      ws = Dates.addDays(ws, -7)
      guard++
    }
    return out
  },

  totalDone(h: HabitCalc): number { return h.done.size },

  completionRate(h: HabitCalc, today: string): number {
    const s = h.schedule || { type: 'daily' }
    if (s.type === 'count') {
      const perWeek = s.perWeek || 1
      const weeks = Stats.weeklyBuckets(h, today, 520)
      if (!weeks.length) return 0
      const thisWeek = Dates.weekStart(today)
      let target = 0, done = 0
      for (const w of weeks) {
        if (w.weekStart === thisWeek && Dates.diffDays(thisWeek, today) < 6) {
          done += Math.min(w.count, perWeek)
          continue
        }
        target += perWeek
        done += Math.min(w.count, perWeek)
      }
      if (target === 0) return Math.min(100, Math.round((done / perWeek) * 100))
      return Math.min(100, Math.round((done / target) * 100))
    }
    const dates = Stats.scheduledDates(h, today)
    let planned = dates.length
    let done = 0
    for (const d of dates) if (h.done.has(d)) done++
    if (dates.length && dates[dates.length - 1] === today && !h.done.has(today)) planned -= 1
    if (planned <= 0) return 0
    return Math.round((done / planned) * 100)
  },

  heatmap(h: HabitCalc, today: string, weeks: number): HeatCell[] {
    const cells: HeatCell[] = []
    const end = Dates.weekStart(today)
    const start = Dates.addDays(end, -7 * (weeks - 1))
    let cur = start
    const total = weeks * 7
    for (let i = 0; i < total; i++) {
      cells.push({
        key: cur,
        done: h.done.has(cur),
        scheduled: Stats.isScheduled(h, cur),
        future: cur > today,
        beforeStart: cur < h.startDate,
      })
      cur = Dates.addDays(cur, 1)
    }
    return cells
  },

  todaySummary(habits: HabitCalc[], today: string): { due: number; done: number } {
    let due = 0, done = 0
    for (const h of habits) {
      if (!Stats.isScheduled(h, today)) continue
      due++
      if (h.done.has(today)) done++
    }
    return { due, done }
  },

  globalDay(habits: HabitCalc[], day: string): { due: number; allDone: boolean } {
    let due = 0, done = 0
    for (const h of habits) {
      if (!Stats.isScheduled(h, day)) continue
      due++
      if (h.done.has(day)) done++
    }
    return { due, allDone: due > 0 && done === due }
  },

  // «серия без пропусков»: дней подряд, когда выполнены ВСЕ привычки дня
  globalStreak(habits: HabitCalc[], today: string): { current: number; best: number } {
    if (!habits.length) return { current: 0, best: 0 }
    let earliestDay = today
    for (const h of habits) if (h.startDate < earliestDay) earliestDay = h.startDate

    let cur = today
    const t = Stats.globalDay(habits, today)
    if (t.due > 0 && !t.allDone) cur = Dates.addDays(cur, -1)
    let current = 0
    while (cur >= earliestDay) {
      const d = Stats.globalDay(habits, cur)
      if (d.due === 0) { cur = Dates.addDays(cur, -1); continue }
      if (d.allDone) current++; else break
      cur = Dates.addDays(cur, -1)
    }

    let best = 0, run = 0, c = earliestDay
    while (c <= today) {
      const d = Stats.globalDay(habits, c)
      if (d.due === 0) { c = Dates.addDays(c, 1); continue }
      if (d.allDone) { run++; if (run > best) best = run } else run = 0
      c = Dates.addDays(c, 1)
    }
    best = Math.max(best, current)
    return { current, best }
  },
}

function weekStreak(h: HabitCalc, today: string): { best: number; current: number } {
  const perWeek = (h.schedule && (h.schedule as any).perWeek) || 1
  const weeks = Stats.weeklyBuckets(h, today, 520)
  const startWeek = Dates.weekStart(h.startDate)
  const thisWeek = Dates.weekStart(today)
  let best = 0, run = 0
  for (const w of weeks) {
    if (w.weekStart < startWeek) continue
    const met = w.count >= perWeek
    if (met) { run++; best = Math.max(best, run) }
    else if (w.weekStart === thisWeek) { /* текущая идёт */ }
    else run = 0
  }
  run = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i]
    if (w.weekStart < startWeek) break
    const met = w.count >= perWeek
    if (met) run++
    else if (w.weekStart === thisWeek) continue
    else break
  }
  return { best, current: run }
}

function earliest(h: HabitCalc): string {
  let min = h.startDate
  h.done.forEach(k => { if (k < min) min = k })
  return min
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function hexA(hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}
