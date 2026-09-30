import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { ANALYSIS_VERSION, replayPgn, type GameAnalysis } from '../analysis/game-analysis'
import { analyses, games, linkedAccounts, users } from '../db/schema'
import { analysisCounts, analysisQueue, getAnalysis, saveAnalysis, summariesForGames } from './analyses'

const PGN = '1. e4 e5 2. Nf3 Nc6 *'

let db: TestDb
let close: () => void
let userId: number
let otherUserId: number
let accountId: number

beforeEach(() => {
  const t = createTestDb()
  db = t.db
  close = () => t.sqlite.close()
  userId = db.insert(users).values({ displayName: 'me', createdAt: 1 }).returning({ id: users.id }).get().id
  otherUserId = db.insert(users).values({ displayName: 'other', createdAt: 1 }).returning({ id: users.id }).get().id
  accountId = db
    .insert(linkedAccounts)
    .values({ userId, platform: 'lichess', username: 'me' })
    .returning({ id: linkedAccounts.id })
    .get().id
})
afterEach(() => close())

function addGame(playedAt: number, speed: 'blitz' | 'rapid' = 'blitz'): number {
  return db
    .insert(games)
    .values({
      userId,
      accountId,
      platform: 'lichess',
      externalId: `g${playedAt}`,
      url: 'https://lichess.org/x',
      pgn: PGN,
      playedAt,
      speed,
      userColor: 'white',
      result: 'win',
      importedAt: 1,
    })
    .returning({ id: games.id })
    .get().id
}

/** A structurally valid analysis for PGN without running an engine. */
function fakeAnalysis(): GameAnalysis {
  return {
    version: ANALYSIS_VERSION,
    engine: 'test',
    nodes: 1,
    plies: replayPgn(PGN).map((p, ply) => ({
      ply,
      fen: p.fen,
      move: p.move,
      eval: { type: 'cp', value: 20 },
      terminal: null,
      best: null,
      second: null,
      depth: 1,
    })),
  }
}

describe('saveAnalysis / getAnalysis', () => {
  it('stores, reads back, and replaces on re-save', () => {
    const gameId = addGame(1)
    expect(saveAnalysis(db, userId, gameId, fakeAnalysis(), 100)).toEqual({ ok: true })
    const second = { ...fakeAnalysis(), nodes: 2 }
    expect(saveAnalysis(db, userId, gameId, second, 200)).toEqual({ ok: true })
    expect(getAnalysis(db, userId, gameId)?.nodes).toBe(2)
    expect(db.select().from(analyses).all()).toHaveLength(1)
  })

  it('rejects analyses that do not match the game, and games of other users', () => {
    const gameId = addGame(1)
    const bad = { ...fakeAnalysis(), plies: fakeAnalysis().plies.slice(1) }
    expect(saveAnalysis(db, userId, gameId, bad)).toMatchObject({ ok: false, status: 400 })
    expect(saveAnalysis(db, otherUserId, gameId, fakeAnalysis())).toMatchObject({ ok: false, status: 404 })
    expect(getAnalysis(db, otherUserId, gameId)).toBeNull()
  })

  it('is deleted with its game', () => {
    const gameId = addGame(1)
    saveAnalysis(db, userId, gameId, fakeAnalysis())
    db.delete(games).where(eq(games.id, gameId)).run()
    expect(db.select().from(analyses).all()).toHaveLength(0)
  })
})

describe('analysisQueue / analysisCounts', () => {
  it('lists unanalyzed games newest first, filtered by speed', () => {
    const old = addGame(1)
    const mid = addGame(2)
    const rapid = addGame(3, 'rapid')
    const newest = addGame(4)
    saveAnalysis(db, userId, mid, fakeAnalysis())
    expect(analysisQueue(db, userId, {}, 10)).toEqual({ gameIds: [newest, rapid, old], remaining: 3 })
    expect(analysisQueue(db, userId, { speed: 'blitz' }, 1)).toEqual({ gameIds: [newest], remaining: 2 })
    expect(analysisQueue(db, otherUserId, {}, 10)).toEqual({ gameIds: [], remaining: 0 })
    expect(analysisCounts(db, userId)).toEqual({ analyzed: 1, total: 4 })
  })
})

describe('summariesForGames', () => {
  /** An analysis whose White moves swing 74.9 → 53.7 → 50 → 50 win % (a mistake, then perfect). */
  function controlledAnalysis(): GameAnalysis {
    const evals = [300, 40, 0, 0, 40]
    return {
      version: ANALYSIS_VERSION,
      engine: 'test',
      nodes: 1,
      plies: replayPgn(PGN).map((p, ply) => ({
        ply,
        fen: p.fen,
        move: p.move,
        eval: { type: 'cp', value: evals[ply] },
        terminal: null,
        best: null,
        second: null,
        depth: 1,
      })),
    }
  }

  it('returns the user\'s accuracy and mistake counts, rounded for display', () => {
    const gameId = addGame(1)
    saveAnalysis(db, userId, gameId, controlledAnalysis())
    const map = summariesForGames(db, userId, [gameId])
    const summary = map.get(gameId)!
    // White: one ~21% drop (mistake, accuracy ≈ 38) and one perfect move.
    expect(summary.accuracy).toBe(69)
    expect(summary.blunders).toBe(0)
    expect(summary.mistakes).toBe(1)
  })

  it('returns nothing for unanalyzed or foreign games and an empty id list', () => {
    const analyzed = addGame(1)
    const unanalyzed = addGame(2)
    saveAnalysis(db, userId, analyzed, controlledAnalysis())
    expect(summariesForGames(db, userId, [unanalyzed]).size).toBe(0)
    expect(summariesForGames(db, otherUserId, [analyzed]).size).toBe(0)
    expect(summariesForGames(db, userId, [unanalyzed, analyzed]).size).toBe(1)
    expect(summariesForGames(db, userId, []).size).toBe(0)
  })
})
