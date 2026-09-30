import { describe, expect, it } from 'vitest'

import { lastNWeeks, weekRange, weekStart } from './week'

// Epoch seconds for the fixtures below (2026-10-26 is a Monday; US DST ends
// Sunday 2026-11-01, inside the week starting Monday 2026-10-26).
const LA = 'America/Los_Angeles'
const MON_OCT26_00Z = 1_792_972_800 // Monday 2026-10-26 00:00 UTC
const MON_OCT26_LA = MON_OCT26_00Z + 7 * 3600 // 00:00 PDT (UTC-7)
const MON_OCT19_LA = MON_OCT26_LA - 7 * 86400
const MON_NOV02_LA = MON_OCT26_00Z + 7 * 86400 + 8 * 3600 // 00:00 PST (UTC-8)
const MON_OCT26_TOKYO = MON_OCT26_00Z - 9 * 3600 // 00:00 JST (UTC+9)

const ms = (s: number) => s * 1000

describe('weekStart', () => {
  it('is Monday 00:00 in the time zone', () => {
    // A Wednesday afternoon in LA belongs to the week starting Monday 00:00 PDT.
    expect(weekStart(ms(MON_OCT26_00Z + 3 * 86400 + 12 * 3600), LA)).toBe(ms(MON_OCT26_LA))
    // Exactly Monday 00:00 local.
    expect(weekStart(ms(MON_OCT26_LA), LA)).toBe(ms(MON_OCT26_LA))
    // One second before Monday midnight is still the previous week.
    expect(weekStart(ms(MON_OCT26_LA - 1), LA)).toBe(ms(MON_OCT19_LA))
  })

  it('is Monday 00:00 UTC for UTC', () => {
    expect(weekStart(ms(MON_OCT26_00Z), 'UTC')).toBe(ms(MON_OCT26_00Z))
    expect(weekStart(ms(MON_OCT26_00Z + 5 * 86400), 'UTC')).toBe(ms(MON_OCT26_00Z))
  })

  it('is Monday 00:00 JST for Tokyo (UTC+9, no DST)', () => {
    expect(weekStart(ms(MON_OCT26_TOKYO), 'Asia/Tokyo')).toBe(ms(MON_OCT26_TOKYO))
    // Sunday 23:00 JST is still the previous week.
    expect(weekStart(ms(MON_OCT26_TOKYO - 3600), 'Asia/Tokyo')).toBe(ms(MON_OCT26_TOKYO - 7 * 86400))
  })
})

describe('weekRange', () => {
  it('spans a DST week as 169 hours', () => {
    // Mid-week instant; the week contains the US fall-back on 2026-11-01.
    const range = weekRange(ms(MON_OCT26_00Z + 3 * 86400), LA)
    expect(range).toEqual({ start: ms(MON_OCT26_LA), end: ms(MON_NOV02_LA) })
    expect(range.end - range.start).toBe(169 * 3600 * 1000)
  })

  it('spans exactly 7 days in zones without DST', () => {
    const range = weekRange(ms(MON_OCT26_TOKYO), 'Asia/Tokyo')
    expect(range.end - range.start).toBe(7 * 86400 * 1000)
  })
})

describe('lastNWeeks', () => {
  it('returns the last n Monday starts, oldest first, current week last', () => {
    const now = ms(MON_OCT26_00Z + 3 * 86400 + 12 * 3600) // Wednesday noon UTC
    expect(lastNWeeks(now, LA, 3)).toEqual([
      ms(MON_OCT19_LA - 7 * 86400), // 2026-10-12
      ms(MON_OCT19_LA),
      ms(MON_OCT26_LA),
    ])
  })

  it('returns the current week start for n = 1', () => {
    expect(lastNWeeks(ms(MON_OCT26_LA), LA, 1)).toEqual([ms(MON_OCT26_LA)])
  })
})
