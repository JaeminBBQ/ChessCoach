import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { winPercent } from '../analysis/classify'
import type { GameAnalysis, PlyAnalysis } from '../analysis/game-analysis'
import type { Score } from '../engine/uci'
import { analyses, drillCards, drillReviews, games, linkedAccounts, users } from '../db/schema'
import { motifCardCounts, newCardsToday, reviewCard, syncDrillCards, trainingQueue, trainingStats } from './training'

const DAY = 24 * 60 * 60 * 1000
// 12:00 UTC — safely mid-day in any likely local timezone, so "since local
// midnight" boundaries don't straddle the test's recent timestamps.
const NOW = 1_800_014_400_000

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

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

function insertGame(ownerId: number = userId, fields: Partial<typeof games.$inferInsert> = {}): number {
  return db.insert(games)
    .values({
      userId: ownerId,
      accountId,
      platform: 'lichess',
      externalId: `game-${ownerId}-${insertCount++}`,
      url: 'https://lichess.org/x',
      pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
      playedAt: NOW - insertCount * DAY,
      speed: 'blitz',
      userColor: 'white',
      result: 'win',
      rated: true,
      importedAt: 1,
      ...fields,
    })
    .returning({ id: games.id })
    .get().id
}

function insertAnalysis(ownerId: number, gameId: number, analysis: GameAnalysis): void {
  db.insert(analyses)
    .values({ userId: ownerId, gameId, engine: 'test', nodes: 1, version: 1, data: JSON.stringify(analysis), createdAt: 1 })
    .run()
}

/**
 * A White-user blunder at ply 7 that passes every fair-puzzle gate: the
 * solution Qh5 keeps a mate eval (100%), the second move Nc3 leaves 50%, and
 * the played Qd7 collapses to 32% — a clean `blunder` card.
 */
function passingAnalysis(): GameAnalysis {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const quietBest = { uci: 'e2e4', san: 'e4', eval: cp(0) }
  const quietSecond = { uci: 'b1c3', san: 'Nc3', eval: cp(0) }
  const plies: PlyAnalysis[] = []
  for (let ply = 0; ply < 8; ply++) {
    const isUserMove = ply === 7
    const isPreBlunder = ply === 5 || ply === 6
    plies.push({
      ply,
      fen,
      move: ply === 0 ? null : isUserMove ? { san: 'Qd7', uci: 'd8d7' } : { san: 'e4', uci: 'e2e4' },
      eval: isUserMove ? cp(-200) : isPreBlunder ? cp(200) : cp(0),
      terminal: null,
      best: ply === 0 ? null : ply === 6 ? { uci: 'd1h5', san: 'Qh5', eval: mate(5) } : quietBest,
      second: ply === 0 ? null : quietSecond,
      depth: 10,
    })
  }
  return { version: 1, engine: 'test', nodes: 1, plies }
}

function insertCard(gameId: number, fields: Partial<typeof drillCards.$inferInsert> = {}): number {
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
      ...fields,
    })
    .returning({ id: drillCards.id })
    .get().id
}

describe('syncDrillCards', () => {
  it('builds cards for analyzed games without them and is idempotent', () => {
    const good = insertGame()
    insertAnalysis(userId, good, passingAnalysis())
    const empty = insertGame()
    insertAnalysis(userId, empty, { version: 1, engine: 'test', nodes: 1, plies: [] })
    insertGame() // never analyzed

    expect(syncDrillCards(db, userId, NOW)).toBe(1)
    const cards = db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      gameId: good,
      ply: 7,
      kind: 'blunder',
      solutionUci: 'd1h5',
      solutionSan: 'Qh5',
      solutionWin: 100,
      playedSan: 'Qd7',
      lastMoveUci: 'e2e4',
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    })
    expect(cards[0].playedWin).toBeCloseTo(winPercent(cp(-200)), 6)
    expect(cards[0].due).toBe(NOW) // new cards are due at creation

    // Idempotent: a second sync changes nothing.
    expect(syncDrillCards(db, userId, NOW)).toBe(0)
    expect(db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()).toHaveLength(1)

    // A newly analyzed game feeds the deck on the next sync.
    const fresh = insertGame()
    insertAnalysis(userId, fresh, passingAnalysis())
    expect(syncDrillCards(db, userId, NOW)).toBe(1)
    expect(db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()).toHaveLength(2)
  })

  it('cascade-deletes cards with their game', () => {
    const good = insertGame()
    insertAnalysis(userId, good, passingAnalysis())
    syncDrillCards(db, userId, NOW)
    expect(db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()).toHaveLength(1)
    db.delete(games).where(eq(games.id, good)).run()
    expect(db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()).toHaveLength(0)
  })
})

describe('reviewCard and queue', () => {
  it('other users’ cards are invisible and reviewing them gives 404', () => {
    const good = insertGame(userId)
    insertAnalysis(userId, good, passingAnalysis())
    syncDrillCards(db, userId, NOW)
    const card = db.select().from(drillCards).where(eq(drillCards.userId, userId)).get()!

    expect(trainingQueue(db, otherId, NOW, 0)).toEqual([])
    expect(reviewCard(db, otherId, card.id, 'good', true, NOW)).toEqual({ ok: false, status: 404, error: 'Card not found' })
    expect(reviewCard(db, userId, 9999, 'good', true, NOW)).toEqual({ ok: false, status: 404, error: 'Card not found' })
  })

  it('reviews write history and a new schedule', () => {
    const cardId = insertCard(insertGame())
    expect(reviewCard(db, userId, cardId, 'bogus', true, NOW)).toEqual({ ok: false, status: 400, error: 'Unknown grade' })

    expect(reviewCard(db, userId, cardId, 'good', true, NOW)).toEqual({ ok: true })
    const card = db.select().from(drillCards).where(eq(drillCards.id, cardId)).get()!
    expect(card).toMatchObject({ reps: 1, intervalDays: 1, lapses: 0, lastReviewedAt: NOW })
    expect(card.due).toBe(NOW + 1 * DAY)

    const history = db.select().from(drillReviews).where(eq(drillReviews.userId, userId)).all()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ cardId, grade: 'good', correct: true, reviewedAt: NOW })
  })

  it('queues due cards oldest first and counts new cards introduced today', () => {
    const oldGame = insertGame()
    const card1 = insertCard(oldGame, { due: NOW - 2 * DAY, lastReviewedAt: NOW - 3 * DAY, reps: 1 })
    const card2 = insertCard(insertGame(), { due: NOW - DAY, lastReviewedAt: NOW - 3 * DAY, reps: 1 })
    // Their first reviews happened days ago (a reviewed card always has history).
    db.insert(drillReviews)
      .values([
        { userId, cardId: card1, grade: 'good', correct: true, reviewedAt: NOW - 3 * DAY },
        { userId, cardId: card2, grade: 'good', correct: true, reviewedAt: NOW - 3 * DAY },
      ])
      .run()

    expect(trainingQueue(db, userId, NOW, 0).map((c) => c.id)).toEqual([card1, card2])
    expect(newCardsToday(db, userId, NOW)).toBe(0)

    // Review one of them today: it is no longer new, but its first review
    // was days ago, so it does not consume today's new-card allowance.
    reviewCard(db, userId, card1, 'good', true, NOW)
    expect(newCardsToday(db, userId, NOW)).toBe(0)

    // A genuinely new card reviewed today counts toward the allowance.
    const card3 = insertCard(insertGame())
    reviewCard(db, userId, card3, 'again', false, NOW)
    expect(newCardsToday(db, userId, NOW)).toBe(1)
  })
})

describe('trainingStats', () => {
  it('counts due, new, learned, totals, today’s reviews, 7-day accuracy, and the next due time', () => {
    insertCard(insertGame()) // new
    insertCard(insertGame(), { due: NOW - DAY, lastReviewedAt: NOW - DAY, reps: 2 }) // due + learned
    const futureCard = insertCard(insertGame(), { due: NOW + 3 * DAY, lastReviewedAt: NOW - DAY, reps: 2 }) // learned

    db.insert(drillReviews)
      .values([
        { userId, cardId: futureCard, grade: 'good', correct: true, reviewedAt: NOW - 60_000 },
        { userId, cardId: futureCard, grade: 'again', correct: false, reviewedAt: NOW - 2 * DAY },
      ])
      .run()

    expect(trainingStats(db, userId, NOW)).toEqual({
      due: 1,
      new: 1,
      learned: 2,
      total: 3,
      reviewedToday: 1,
      accuracy7d: 50,
      nextDue: NOW + 3 * DAY,
    })
  })
})

describe('motifs', () => {
  it('stores the motif on new cards and backfills nulls, idempotently', () => {
    const good = insertGame()
    insertAnalysis(userId, good, passingAnalysis())
    syncDrillCards(db, userId, NOW)
    const card = db.select().from(drillCards).where(eq(drillCards.userId, userId)).get()!
    expect(card.motif).toBe('other')

    // A legacy card without a motif gets it from the stored analysis.
    db.update(drillCards).set({ motif: null }).where(eq(drillCards.id, card.id)).run()
    expect(syncDrillCards(db, userId, NOW)).toBe(0) // backfill only, no new cards
    expect(db.select().from(drillCards).where(eq(drillCards.id, card.id)).get()!.motif).toBe('other')

    // Idempotent: running again rewrites nothing and adds nothing.
    db.update(drillCards).set({ motif: null }).where(eq(drillCards.id, card.id)).run()
    syncDrillCards(db, userId, NOW)
    expect(db.select().from(drillCards).where(eq(drillCards.id, card.id)).get()!.motif).toBe('other')
    expect(db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()).toHaveLength(1)
  })

  it('filters the queue by motif with the same due/new rules', () => {
    const good = insertGame()
    insertAnalysis(userId, good, passingAnalysis())
    syncDrillCards(db, userId, NOW) // motif 'other'
    const hanging = insertCard(insertGame(), { motif: 'hangingPiece' })

    // Both are new; newest game first.
    expect(trainingQueue(db, userId, NOW, 0).map((c) => c.id)).toEqual([hanging, db.select().from(drillCards).where(eq(drillCards.motif, 'other')).get()!.id])
    expect(trainingQueue(db, userId, NOW, 0, 'hangingPiece').map((c) => c.id)).toEqual([hanging])
    expect(trainingQueue(db, userId, NOW, 0, 'fork')).toEqual([])
    // The new-per-day cap still applies inside the filter.
    expect(trainingQueue(db, userId, NOW, 10, 'hangingPiece')).toEqual([])
  })

  it('counts cards per motif for the coach links', () => {
    insertCard(insertGame(), { motif: 'hangingPiece' })
    insertCard(insertGame(), { motif: 'hangingPiece' })
    insertCard(insertGame(), { motif: 'fork' })
    insertCard(insertGame()) // null motif → excluded
    expect(motifCardCounts(db, userId)).toEqual(new Map([['hangingPiece', 2], ['fork', 1]]))
  })
})
