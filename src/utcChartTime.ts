import { TickMarkType, type Time } from 'lightweight-charts'

const UTC_PLUS_3_MS = 3 * 60 * 60 * 1000

function utcDate(time: Time): Date | null {
  let utcMs: number
  if (typeof time === 'number') {
    utcMs = time * 1000
  } else if (typeof time === 'string') {
    utcMs = Date.parse(`${time}T00:00:00Z`)
  } else {
    utcMs = Date.UTC(time.year, time.month - 1, time.day)
  }

  if (Number.isNaN(utcMs)) {
    return null
  }

  return new Date(utcMs + UTC_PLUS_3_MS)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatUtcTime(time: Time): string {
  const date = utcDate(time)
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

export function formatUtcTick(time: Time, tickMarkType: TickMarkType): string | null {
  const date = utcDate(time)
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  switch (tickMarkType) {
    case TickMarkType.Year:
      return String(date.getUTCFullYear())
    case TickMarkType.Month:
      return months[date.getUTCMonth()]
    case TickMarkType.DayOfMonth:
      return String(date.getUTCDate())
    case TickMarkType.Time:
      return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
    case TickMarkType.TimeWithSeconds:
      return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    default:
      return null
  }
}
