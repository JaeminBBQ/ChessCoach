import { describe, expect, it } from 'vitest'

import { applyReview, buildQueue, NEW_CARDS_PER_DAY, SESSION_CAP, type QueueCard, type SrsState } from './srs'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

const fresh = (overrides: Partial<SrsState> = {}): SrsState => ({
  ease: 2.5,
  intervalDays: 0,
  reps: 0,
  lapses: 0,
  due: NOW,
  ...overrides,
})

describe('applyReview', () => {
  it('grows the interval 1 → 3 → round(3 × 2.5) = 8 days on three goods', () => {
    const first = applyReview(fresh(), 'good', NOW)
    expect(first).toMatchObject({ ease: 2.5, intervalDays: 1, reps: 1, lapses: 0, due: NOW + 1 * DAY })
    const second = applyReview(first, 'good', NOW)
    expect(second).toMatchObject({ intervalDays: 3, reps: 2, due: NOW + 3 * DAY })
    const third = applyReview(second, 'good', NOW)
    expect(third).toMatchObject({ intervalDays: 8, reps: 3, due: NOW + 8 * DAY })
  })

  it('again resets reps, lowers ease with a 1.3 floor, and re-due in 10 minutes', () => {
    const next = applyReview(fresh({ ease: 2.5, intervalDays: 8, reps: 3, lapses: 1 }), 'again', NOW)
    expect(next).toEqual({ ease: 2.3, intervalDays: 0, reps: 0, lapses: 2, due: NOW + 10 * 60_000 })
    // 1.4 − 0.2 = 1.2, floored to 1.3.
    expect(applyReview(fresh({ ease: 1.4 }), 'again', NOW).ease).toBe(1.3)
    expect(applyReview(fresh({ ease: 1.3 }), 'again', NOW).ease).toBe(1.3)
  })

  it('easy is good with the interval × 1.3 and +0.15 ease', () => {
    const next = applyReview(fresh(), 'easy', NOW)
    expect(next.ease).toBeCloseTo(2.65, 6)
    expect(next.intervalDays).toBeCloseTo(1.3, 6)
    expect(next.reps).toBe(1)
    expect(next.due).toBe(NOW + Math.round(1 * 1.3 * DAY))
  })
})

describe('buildQueue', () => {
  const card = (id: number, gameId: number, opts: { due?: number; lastReviewedAt?: number | null } = {}): QueueCard => ({
    id,
    gameId,
    due: opts.due ?? NOW,
    lastReviewedAt: opts.lastReviewedAt ?? null,
  })
  const reviewed = (id: number, gameId: number, due: number): QueueCard =>
    card(id, gameId, { due, lastReviewedAt: NOW - DAY })

  it('orders due cards oldest first, then new cards newest game first', () => {
    const queue = buildQueue(
      [
        reviewed(1, 10, NOW - 500), // due, later
        reviewed(2, 11, NOW - 1000), // due, earlier
        card(3, 30), // new, newer game
        card(4, 20), // new, older game
        reviewed(5, 12, NOW + 500), // not due yet — excluded
      ],
      NOW,
      0,
    )
    expect(queue.map((c) => c.id)).toEqual([2, 1, 3, 4])
  })

  it('caps new cards at 10 − newToday per day', () => {
    const cards = [...Array(15)].map((_, i) => card(i + 1, 100 + i))
    expect(buildQueue(cards, NOW, 7).map((c) => c.id)).toEqual([15, 14, 13]) // newest games first
    expect(buildQueue(cards, NOW, 10)).toEqual([])
    expect(buildQueue(cards, NOW, 0)).toHaveLength(NEW_CARDS_PER_DAY)
  })

  it('caps the session at 20 cards', () => {
    const due = [...Array(25)].map((_, i) => reviewed(i + 1, 1, NOW - 25 + i))
    expect(buildQueue(due, NOW, 0)).toHaveLength(SESSION_CAP)
    expect(buildQueue(due, NOW, 0)[0].id).toBe(1)
  })
})
