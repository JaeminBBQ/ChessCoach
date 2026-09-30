import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { drillCards, drillReviews, gameReviews, games, linkedAccounts, plans, userSettings, users } from '../db/schema'
import { weekRange } from '../plan/week'
import {
  drillReviewsThisWeek,
  getOrCreatePlan,
  getReview,
  getSettings,
  isValidTimezone,
  listDrillReviews,
  listReviews,
  markReviewed,
  recentGames,
  updateSettings,
} from './plan'

const DAY = 24 * 60 * 60 * 1000
// Wednesday 2026-10-28 12:00 UTC.
const NOW = 1_793_188_800_000

let db: TestDb
let sqlite: ReturnType<typeof createTestDb>['sqlite']
let userId: number
let otherId: number
let accountId: number

beforeEach(() => {
  const testDb = createTestDb()
  db = testDb.db
  sqlite = testDb.sqlite
  userId = db.insert(users).values({ displayName: 'me', createdAt: 1 }).returning({ id: users.id }).get().id
  otherId = db.insert(users).values({ displayName: 'someone', createdAt: 1 }).returning({ id: users.id }).get().id
  accountId = db.insert(linkedAccounts).values({ userId, platform: 'lichess', username: 'poip0i333' }).returning({ id: linkedAccounts.id }).get().id
})

afterEach(() => {
  sqlite.close()
})

let insertCount = 0

function insertGame(fields: Partial<typeof games.$inferInsert> = {}): number {
  return db.insert(games)
    .values({
      userId,
      accountId,
      platform: 'lichess',
      externalId: `game-${insertCount++}`,
      url: 'https://lichess.org/x',
      pgn: '1. e4 e5 1-0',
      playedAt: NOW,
      speed: 'rapid',
      userColor: 'white',
      result: 'win',
      rated: true,
      importedAt: 1,
      ...fields,
    })
    .returning({ id: games.id })
    .get().id
}

function insertCard(gameId: number): number {
  return db.insert(drillCards)
    .values({
      userId,
      gameId,
      ply: 7,
      kind: 'blunder',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      solutionUci: 'd1h5',
      solutionSan: 'Qh5',
      solutionWin: 100,
      playedSan: 'Qd7',
      playedWin: 32.4,
      lastMoveUci: 'e2e4',
      ease: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      due: NOW,
      lastReviewedAt: null,
      createdAt: NOW,
    })
    .returning({ id: drillCards.id })
    .get().id
}

describe('user settings', () => {
  it('creates defaults on first read and scopes per user', () => {
    expect(getSettings(db, userId, NOW)).toEqual({
      timezone: 'America/Los_Angeles',
      weeklyGames: 10,
      planSpeed: 'rapid',
      puzzlesPerWeek: 50,
      updatedAt: NOW,
    })
    expect(getSettings(db, otherId)).toMatchObject({ weeklyGames: 10 })
    expect(db.select().from(userSettings).all()).toHaveLength(2)
  })

  it('updates settings', () => {
    getSettings(db, userId, NOW)
    updateSettings(db, userId, { weeklyGames: 7, planSpeed: 'blitz', timezone: 'Asia/Tokyo' }, NOW + 1)
    expect(getSettings(db, userId)).toMatchObject({
      weeklyGames: 7,
      planSpeed: 'blitz',
      timezone: 'Asia/Tokyo',
      updatedAt: NOW + 1,
    })
  })

  it('validates IANA time zones', () => {
    expect(isValidTimezone('America/Los_Angeles')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

describe('markReviewed', () => {
  it('is idempotent and scoped to the user', () => {
    const gameId = insertGame()
    expect(markReviewed(db, userId, gameId, NOW)).toEqual({ ok: true, reviewedAt: NOW })
    // A second call keeps the original timestamp and writes no new row.
    expect(markReviewed(db, userId, gameId, NOW + 1000)).toEqual({ ok: true, reviewedAt: NOW })
    expect(db.select().from(gameReviews).all()).toHaveLength(1)
    expect(getReview(db, userId, gameId)).toBe(NOW)

    // Another user's game or an unknown id is 404, not a leak.
    expect(markReviewed(db, otherId, gameId, NOW)).toEqual({ ok: false, status: 404, error: 'Game not found' })
    expect(markReviewed(db, userId, 9999, NOW)).toEqual({ ok: false, status: 404, error: 'Game not found' })
    expect(getReview(db, otherId, gameId)).toBeNull()
  })

  it('cascade-deletes reviews with their game', () => {
    const gameId = insertGame()
    markReviewed(db, userId, gameId, NOW)
    db.delete(games).where(eq(games.id, gameId)).run()
    expect(db.select().from(gameReviews).all()).toHaveLength(0)
  })

  it('lists reviews and drill reviews since a cutoff', () => {
    const g1 = insertGame({ playedAt: NOW - 10 * DAY })
    const g2 = insertGame()
    markReviewed(db, userId, g1, NOW - 10 * DAY)
    markReviewed(db, userId, g2, NOW)
    expect(listReviews(db, userId, NOW - DAY)).toEqual([{ gameId: g2, reviewedAt: NOW }])

    const card1 = insertCard(g1)
    const card2 = insertCard(g2)
    db.insert(drillReviews)
      .values([
        { userId, cardId: card1, grade: 'good', correct: true, reviewedAt: NOW - 10 * DAY },
        { userId, cardId: card2, grade: 'again', correct: false, reviewedAt: NOW },
      ])
      .run()
    expect(listDrillReviews(db, userId, NOW - DAY)).toEqual([{ reviewedAt: NOW }])
    expect(drillReviewsThisWeek(db, userId, weekRange(NOW, 'UTC'))).toBe(1)
  })
})

describe('getOrCreatePlan', () => {
  const abandonedGame = (playedAt: number) => ({
    id: insertGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned', playedAt, pgn: '1. e4 e5 0-1' }),
    platform: 'chesscom' as const,
    playedAt,
    userColor: 'white' as const,
    result: 'loss' as const,
    termination: 'abandoned',
    speed: 'rapid' as const,
    rated: true,
    userRating: null,
    opponentRating: null,
    opponentName: null,
    accountId,
    pgn: '1. e4 e5 0-1',
    analysis: null,
  })

  it('computes the focus once and keeps it fixed for the week', () => {
    const week = weekRange(NOW, 'UTC')
    // All six games inside the current week (Oct 26 12:00 → Oct 29 00:00).
    const games = Array.from({ length: 6 }, (_, i) => abandonedGame(week.start + (i + 1) * 12 * 3600_000))

    const row = getOrCreatePlan(db, userId, week.start, games, 'UTC', NOW)
    expect(row.focusId).toBe('early-abandon')
    expect(row.baseline.focus).toMatchObject({ id: 'early-abandon', title: 'Abandoning games early' })
    expect(row.baseline.focus?.habit).toBeTruthy()
    // No games in the previous 4 weeks → no baseline metric.
    expect(row.baseline.metric).toBeNull()

    // Mid-week changes to the game pool don't flip the stored focus.
    const again = getOrCreatePlan(db, userId, week.start, [], 'UTC', NOW + DAY)
    expect(again).toEqual(row)
    expect(db.select().from(plans).all()).toHaveLength(1)
  })

  it('stores one row per user and week', () => {
    const week = weekRange(NOW, 'UTC')
    const row = getOrCreatePlan(db, userId, week.start, [], 'UTC', NOW)
    expect(row.focusId).toBeNull()

    const next = weekRange(week.end, 'UTC')
    const row2 = getOrCreatePlan(db, userId, next.start, [], 'UTC', NOW)
    expect(row2.weekStart).toBe(next.start)
    expect(row2.id).not.toBe(row.id)

    const other = getOrCreatePlan(db, otherId, week.start, [], 'UTC', NOW)
    expect(other.id).not.toBe(row.id)
    expect(db.select().from(plans).all()).toHaveLength(3)
  })

  it('baseline covers only the previous 4 weeks', () => {
    const week = weekRange(NOW, 'UTC')
    // Four abandoned games in the previous week, four in the current week;
    // the baseline metric (per 10 games) counts only the earlier ones.
    const games = [
      ...Array.from({ length: 4 }, (_, i) => abandonedGame(week.start - (i + 1) * DAY)),
      ...Array.from({ length: 4 }, (_, i) => abandonedGame(week.start + (i + 1) * DAY)),
    ]
    const row = getOrCreatePlan(db, userId, week.start, games, 'UTC', NOW)
    expect(row.baseline.metric).toMatchObject({ value: 10, kind: 'per10Games', sample: 4 })
  })
})

describe('recentGames', () => {
  it('returns the newest games for the loss-review fallback', () => {
    const g1 = insertGame({ playedAt: NOW - 3 * DAY, result: 'loss', opponentName: 'old' })
    const g2 = insertGame({ playedAt: NOW - DAY, result: 'win', opponentName: 'new' })
    const g3 = insertGame({ playedAt: NOW - 2 * DAY, result: 'loss', opponentName: 'mid' })
    expect(recentGames(db, userId)).toEqual([
      expect.objectContaining({ id: g2, result: 'win', opponentName: 'new' }),
      expect.objectContaining({ id: g3, opponentName: 'mid' }),
      expect.objectContaining({ id: g1, opponentName: 'old' }),
    ])
    expect(recentGames(db, userId, 2)).toHaveLength(2)
  })
})
