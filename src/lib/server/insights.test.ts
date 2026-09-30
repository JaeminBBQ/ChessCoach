import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { games, linkedAccounts, users } from '../db/schema'
import { loadInsightGames } from './insights'

const DAY = 24 * 60 * 60 * 1000

let db: TestDb
let sqlite: ReturnType<typeof createTestDb>['sqlite']
let userId: number
let accountId: number
let otherId: number

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

function insertGame(ownerId: number, playedAt: number, fields: Partial<typeof games.$inferInsert> = {}): void {
  db.insert(games)
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
    .run()
}

describe('loadInsightGames', () => {
  it('applies range, rated (default true), speed, and account filters', () => {
    const now = Date.now()
    insertGame(userId, now - 30 * DAY, { result: 'win' })
    insertGame(userId, now - 200 * DAY, { result: 'loss' })
    insertGame(userId, now - 400 * DAY, { result: 'win' })
    insertGame(userId, now - 30 * DAY, { rated: false })
    insertGame(userId, now - 30 * DAY, { speed: 'rapid' })

    expect(loadInsightGames(db, userId, {})).toHaveLength(3) // rated + last year
    expect(loadInsightGames(db, userId, { range: '90d' })).toHaveLength(2)
    expect(loadInsightGames(db, userId, { range: 'all' })).toHaveLength(4)
    expect(loadInsightGames(db, userId, { rated: false })).toHaveLength(1)
    expect(loadInsightGames(db, userId, { range: 'all', speed: 'rapid' })).toHaveLength(1)
    expect(loadInsightGames(db, userId, { range: 'all', accountId })).toHaveLength(4)
  })

  it('returns only the columns InsightGame needs', () => {
    insertGame(userId, Date.now() - DAY, { result: 'draw', termination: 'stalemate' })
    const [game] = loadInsightGames(db, userId, {})
    expect(game).toEqual({
      playedAt: expect.any(Number),
      userColor: 'white',
      result: 'draw',
      termination: 'stalemate',
      speed: 'blitz',
      rated: true,
      userRating: null,
      opponentRating: null,
      accountId,
      pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
    })
  })

  it('never returns another user’s games', () => {
    insertGame(userId, Date.now() - DAY)
    insertGame(otherId, Date.now() - DAY)
    insertGame(otherId, Date.now() - 2 * DAY)

    expect(loadInsightGames(db, userId, { range: 'all' })).toHaveLength(1)
    expect(loadInsightGames(db, otherId, { range: 'all' })).toHaveLength(2)
  })
})
