import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { drillCards, drillReviews, gameReviews, games, linkedAccounts, plans, planTaskChecks, userSettings, users } from '../db/schema'
import { weekRange } from '../plan/week'
import {
  drillReviewsThisWeek,
  getOrCreatePlan,
  getReview,
  getSettings,
  isValidTimezone,
  listDrillReviews,
  listPlanPatterns,
  listReviews,
  listTaskChecks,
  markReviewed,
  recentGames,
  taskChecksForWeek,
  toggleTaskCheck,
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

describe('manual task checks', () => {
  it('toggles a check on and off, scoped to user and week', () => {
    const week = weekRange(NOW, 'UTC')
    expect(taskChecksForWeek(db, userId, week.start).size).toBe(0)

    toggleTaskCheck(db, userId, week.start, 'lichess-theme-puzzles', NOW)
    expect(taskChecksForWeek(db, userId, week.start)).toEqual(new Set(['lichess-theme-puzzles']))
    expect(listTaskChecks(db, userId, week.start)).toEqual([
      { weekStart: week.start, taskId: 'lichess-theme-puzzles' },
    ])

    // Toggling again unchecks.
    toggleTaskCheck(db, userId, week.start, 'lichess-theme-puzzles', NOW + 1)
    expect(taskChecksForWeek(db, userId, week.start).size).toBe(0)

    // Other users and other weeks have their own checks.
    toggleTaskCheck(db, userId, week.start, 'lichess-theme-puzzles', NOW)
    expect(taskChecksForWeek(db, otherId, week.start).size).toBe(0)
    expect(taskChecksForWeek(db, userId, week.end).size).toBe(0)
    expect(listTaskChecks(db, userId, week.start + 7 * DAY)).toEqual([])
    expect(db.select().from(planTaskChecks).all()).toHaveLength(1)
  })
})

describe('plan pattern snapshot', () => {
  const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const cp = (value: number) => ({ type: 'cp' as const, value })

  /** An analyzed game whose only move is the engine's best (no findings). */
  function quietGame(playedAt: number) {
    return {
      id: insertGame({ playedAt, pgn: '1. d4 1-0' }),
      platform: 'lichess' as const,
      playedAt,
      userColor: 'white' as const,
      result: 'win' as const,
      termination: null,
      speed: 'rapid' as const,
      rated: true,
      userRating: null,
      opponentRating: null,
      opponentName: null,
      accountId,
      pgn: '1. d4 1-0',
      analysis: {
        version: 1,
        engine: 'test',
        nodes: 1,
        plies: [
          { ply: 0, fen: FEN, move: null, eval: cp(0), terminal: null, best: { uci: 'd2d4', san: 'd4', eval: cp(0) }, second: null, depth: 10 },
          { ply: 1, fen: FEN, move: { san: 'd4', uci: 'd2d4' }, eval: cp(0), terminal: null, best: { uci: 'e2e4', san: 'e4', eval: cp(0) }, second: null, depth: 10 },
        ],
      },
    }
  }

  /** A White-user mistake at ply 1 (motif 'other': the best reply is quiet) inside an analyzed game. */
  function mistakeGame(playedAt: number) {
    return {
      ...quietGame(playedAt),
      result: 'loss' as const,
      pgn: '1. a3 e5 0-1',
      analysis: {
        version: 1,
        engine: 'test',
        nodes: 1,
        plies: [
          { ply: 0, fen: FEN, move: null, eval: cp(0), terminal: null, best: { uci: 'd2d4', san: 'd4', eval: cp(0) }, second: null, depth: 10 },
          { ply: 1, fen: FEN, move: { san: 'a3', uci: 'a2a3' }, eval: cp(-300), terminal: null, best: { uci: 'e2e4', san: 'e4', eval: cp(0) }, second: null, depth: 10 },
        ],
      },
    }
  }

  /** A White-user mistake at ply 1 where Black's best reply takes the knight: motif 'hangingPiece'. */
  function hangingGame(playedAt: number) {
    const after = 'rnbqkb1r/ppp2ppp/3p1n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 2 4'
    return {
      ...quietGame(playedAt),
      result: 'loss' as const,
      pgn: '1. e4 0-1',
      analysis: {
        version: 1,
        engine: 'test',
        nodes: 1,
        plies: [
          { ply: 0, fen: after, move: null, eval: cp(0), terminal: null, best: { uci: 'd2d4', san: 'd4', eval: cp(0) }, second: null, depth: 10 },
          { ply: 1, fen: after, move: { san: 'Ne5', uci: 'f3e5' }, eval: cp(-300), terminal: null, best: { uci: 'd6e5', san: 'dxe5', eval: cp(-300) }, second: null, depth: 10 },
        ],
      },
    }
  }

  it("stores no pattern when every mistake is 'other'", () => {
    const week = weekRange(NOW, 'UTC')
    const games = [
      ...Array.from({ length: 20 }, (_, i) => quietGame(week.start + i * 3600_000)),
      ...Array.from({ length: 5 }, (_, i) => mistakeGame(week.start + (30 + i) * 3600_000)),
    ]
    const row = getOrCreatePlan(db, userId, week.start, games, 'UTC', NOW)
    expect(row.focusId).toBe('mistakes-opening')
    expect(row.baseline.pattern).toBeNull()
  })

  it('stores the top pattern with the focus and backfills rows without one', () => {
    const week = weekRange(NOW, 'UTC')
    // Coach needs ≥ 20 analyzed games for engine findings and ≥ 5 mistakes for
    // the finding itself: 20 quiet games + 5 with a mistake.
    const games = [
      ...Array.from({ length: 20 }, (_, i) => quietGame(week.start + i * 3600_000)),
      ...Array.from({ length: 5 }, (_, i) => hangingGame(week.start + (30 + i) * 3600_000)),
    ]

    // New plan: the focus is mistakes-opening and the pattern snapshot is stored.
    const row = getOrCreatePlan(db, userId, week.start, games, 'UTC', NOW)
    expect(row.focusId).toBe('mistakes-opening')
    expect(row.baseline.pattern).toMatchObject({
      motif: 'hangingPiece',
      label: 'Left a piece hanging',
      count: 5,
      theme: 'hangingPiece',
      themeUrl: 'https://lichess.org/training/hangingPiece',
    })
    expect(row.baseline.pattern?.metric).toBeNull() // no games in the previous 4 weeks

    // A pre-T006b row without the pattern gets backfilled on read.
    db.update(plans)
      .set({ baseline: JSON.stringify({ focus: row.baseline.focus, metric: null }) })
      .where(eq(plans.id, row.id))
      .run()
    const backfilled = getOrCreatePlan(db, userId, week.start, games, 'UTC', NOW)
    expect(backfilled.baseline.pattern).toMatchObject({ motif: 'hangingPiece' })
    expect(db.select().from(plans).all()).toHaveLength(1)

    expect(listPlanPatterns(db, userId, week.start)).toEqual([
      { weekStart: week.start, pattern: expect.objectContaining({ motif: 'hangingPiece' }) },
    ])
    expect(listPlanPatterns(db, userId, week.end)).toEqual([])
  })

  it('non-pattern findings (e.g. early-abandon) store no pattern', () => {
    const week = weekRange(NOW, 'UTC')
    const abandoned = {
      id: insertGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned', playedAt: week.start + DAY, pgn: '1. e4 e5 0-1' }),
      platform: 'chesscom' as const,
      playedAt: week.start + DAY,
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
    }
    const row = getOrCreatePlan(db, userId, week.start, Array.from({ length: 6 }, () => abandoned), 'UTC', NOW)
    expect(row.focusId).toBe('early-abandon')
    expect(row.baseline.pattern).toBeNull()
  })
})
