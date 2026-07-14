// Экспорт события/задачи в .ics — «Добавить в календарь» на телефоне.
// Только экспорт (в одну сторону), без живой синхронизации — этого достаточно,
// чтобы разово закинуть дату в системный календарь.

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function nowStamp(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function dateOnly(day: string): string { return day.replace(/-/g, '') }

// «плавающее» время без таймзоны — так проще: устройство просто трактует его как
// локальное, а мы нигде не храним таймзону пользователя, только часы:минуты
function dateTime(day: string, time: string): string {
  return `${dateOnly(day)}T${time.replace(':', '')}00`
}

const RRULE_FREQ: Record<string, string> = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }

export function buildIcs(opts: { uid: string; title: string; day: string; time?: string; endTime?: string; note?: string; repeat?: string | null }): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pen//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT']
  lines.push(`UID:${opts.uid}@pen.app`)
  lines.push(`DTSTAMP:${nowStamp()}`)
  if (opts.time) {
    lines.push(`DTSTART:${dateTime(opts.day, opts.time)}`)
    if (opts.endTime) lines.push(`DTEND:${dateTime(opts.day, opts.endTime)}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(opts.day)}`)
  }
  lines.push(`SUMMARY:${icsEscape(opts.title)}`)
  if (opts.note) lines.push(`DESCRIPTION:${icsEscape(opts.note)}`)
  if (opts.repeat && RRULE_FREQ[opts.repeat]) lines.push(`RRULE:${RRULE_FREQ[opts.repeat]}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
