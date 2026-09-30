import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { analyses, games, linkedAccounts, users } from '../db/schema'
import { loadCoachGames } from './coach'

const DAY = 24 * 60 * 60 * 1000

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

function insertGame(ownerId: number, playedAt: number, fields: Partial<typeof games.$inferInsert> = {}): number {
  return db.insert(games)
    .values({
      userId: ownerId,
      accountId,
      platform: 'lichess',
      externalId: `game-${ownerId}-${playedAt}-${insertCount++}`,
      url: 'https://lichess.org/x',
      pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
      playedAt,
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

function insertAnalysis(ownerId: number, gameId: number, data: unknown): void {
  db.insert(analyses)
    .values({ userId: ownerId, gameId, engine: 'test', nodes: 1, version: 1, data: JSON.stringify(data), createdAt: 1 })
    .run()
}

describe('loadCoachGames', () => {
  it('returns the coach fields and joins the analysis via gameId and userId', () => {
    const analyzed = insertGame(userId, Date.now() - DAY)
    const unanalyzed = insertGame(userId, Date.now() - 2 * DAY)
    const analysis = { version: 1, engine: 'test', nodes: 1, plies: [] }
    insertAnalysis(userId, analyzed, analysis)
    // An analysis stored under a different owner must not be joined onto our game.
    insertAnalysis(otherId, unanalyzed, { ...analysis, engine: 'other' })

    const games = loadCoachGames(db, userId, { range: 'all' })
    expect(games).toHaveLength(2)
    const byId = new Map(games.map((game) => [game.id, game]))
    expect(byId.get(analyzed)?.analysis).toEqual(analysis)
    expect(byId.get(unanalyzed)?.analysis).toBeNull()
    const [game] = games
    expect(game).toMatchObject({
      platform: 'lichess',
      pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
      speed: 'blitz',
      rated: true,
      accountId,
    })
  })

  it('applies range, rated (default true), speed, and account filters', () => {
    const now = Date.now()
    insertGame(userId, now - 30 * DAY)
    insertGame(userId, now - 200 * DAY)
    insertGame(userId, now - 400 * DAY)
    insertGame(userId, now - 30 * DAY, { rated: false })
    insertGame(userId, now - 30 * DAY, { speed: 'rapid' })

    expect(loadCoachGames(db, userId, {})).toHaveLength(3) // rated + last year
    expect(loadCoachGames(db, userId, { range: '90d' })).toHaveLength(2)
    expect(loadCoachGames(db, userId, { range: 'all' })).toHaveLength(4)
    expect(loadCoachGames(db, userId, { rated: false })).toHaveLength(1)
    expect(loadCoachGames(db, userId, { range: 'all', speed: 'rapid' })).toHaveLength(1)
    expect(loadCoachGames(db, userId, { range: 'all', accountId })).toHaveLength(4)
  })

  it('never returns another user’s games', () => {
    insertGame(userId, Date.now() - DAY)
    insertGame(otherId, Date.now() - DAY)
    insertGame(otherId, Date.now() - 2 * DAY)

    expect(loadCoachGames(db, userId, { range: 'all' })).toHaveLength(1)
    expect(loadCoachGames(db, otherId, { range: 'all' })).toHaveLength(2)
  })
})
