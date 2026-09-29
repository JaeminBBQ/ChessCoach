import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from './schema'

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

const NOW = 1727500000000

let sqlite: Database.Database
let db: ReturnType<typeof drizzle>

beforeEach(() => {
  // In-memory database: no files touched, migrations applied fresh each test.
  sqlite = new Database(':memory:')
  db = drizzle(sqlite)
  migrate(db, { migrationsFolder })
})

afterEach(() => {
  sqlite.close()
})

describe('schema', () => {
  it('inserts a user, a linked account, and a game', () => {
    const [user] = db
      .insert(schema.users)
      .values({ displayName: 'Jaemin', createdAt: NOW })
      .returning()
      .all()

    const [account] = db
      .insert(schema.linkedAccounts)
      .values({ userId: user.id, platform: 'lichess', username: 'jaemin', lastSyncedAt: NOW })
      .returning()
      .all()

    db.insert(schema.games)
      .values({
        userId: user.id,
        accountId: account.id,
        platform: 'lichess',
        externalId: 'abc123',
        url: 'https://lichess.org/abc123',
        pgn: '1. e4',
        playedAt: NOW,
        timeControl: '180+2',
        speed: 'blitz',
        userColor: 'white',
        result: 'win',
        termination: 'normal',
        userRating: 1800,
        opponentName: 'opponent',
        opponentRating: 1790,
        openingEco: 'B00',
        openingName: "King's Pawn",
        importedAt: NOW + 1000,
      })
      .run()

    expect(db.select().from(schema.games).all()).toHaveLength(1)
    expect(db.select().from(schema.linkedAccounts).all()).toHaveLength(1)
    expect(db.select().from(schema.users).all()).toHaveLength(1)
  })

  it('rejects a duplicate (platform, externalId, userId) for games', () => {
    const [user] = db
      .insert(schema.users)
      .values({ displayName: 'Jaemin', createdAt: NOW })
      .returning()
      .all()

    const [account] = db
      .insert(schema.linkedAccounts)
      .values({ userId: user.id, platform: 'lichess', username: 'jaemin' })
      .returning()
      .all()

    const game = {
      userId: user.id,
      accountId: account.id,
      platform: 'lichess' as const,
      externalId: 'dup-id',
      url: 'https://lichess.org/dup-id',
      pgn: '1. e4',
      playedAt: NOW,
      speed: 'blitz' as const,
      userColor: 'white' as const,
      result: 'win' as const,
      importedAt: NOW + 1000,
    }

    db.insert(schema.games).values(game).run()
    expect(() => db.insert(schema.games).values(game).run()).toThrow(/UNIQUE/)
  })
})
