// Weeks start on Monday 00:00 in the user's time zone. Everything here is
// wall-clock math through Intl, so DST weeks are 167/169 hours in epoch time.
// No dependencies; `timeZone` must be a valid IANA zone.

export const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

// 'en-US' short weekday names, Monday first.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface WallParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

/** The wall-clock parts of an instant in a time zone (weekday: Mon=0 … Sun=6). */
function partsOf(ms: number, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
    weekday: WEEKDAYS.indexOf(weekday),
  }
}

/**
 * The epoch ms of the wall time in the time zone. Two-pass: the wall time is
 * read as if it were UTC, and the offset is the difference between that guess
 * and the wall clock the zone shows at that instant.
 */
function wallToUtc(wall: WallParts, timeZone: string): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  const shown = partsOf(guess, timeZone)
  const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second) - guess
  return guess - offset
}

/** The epoch ms of Monday 00:00 in the time zone, for the week containing `ms`. */
export function weekStart(ms: number, timeZone: string): number {
  const parts = partsOf(ms, timeZone)
  // Roll back to Monday on the wall clock (UTC date math handles month/year edges).
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - parts.weekday))
  return wallToUtc(
    {
      year: monday.getUTCFullYear(),
      month: monday.getUTCMonth() + 1,
      day: monday.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      weekday: 0,
    },
    timeZone,
  )
}

export interface WeekRange {
  /** Monday 00:00, epoch ms. */
  start: number
  /** The following Monday 00:00 — not necessarily start + 7 days across DST. */
  end: number
}

export function weekRange(ms: number, timeZone: string): WeekRange {
  const start = weekStart(ms, timeZone)
  // The next Monday 00:00 on the wall clock — not start + 7 absolute days,
  // which is an hour short of the next Monday across a DST fall-back.
  const wall = partsOf(start, timeZone)
  const next = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 7))
  const end = wallToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      weekday: 0,
    },
    timeZone,
  )
  return { start, end }
}

/** The starts of the last `n` weeks ending with the current one, oldest first. */
export function lastNWeeks(now: number, timeZone: string, n: number): number[] {
  const starts: number[] = []
  for (let i = n - 1; i >= 0; i--) starts.push(weekStart(now - i * WEEK_MS, timeZone))
  return starts
}
