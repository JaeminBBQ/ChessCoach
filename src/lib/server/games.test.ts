import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { games, linkedAccounts, users } from '../db/schema'
import {
  DuplicateAccountError,
  GAMES_PAGE_SIZE,
  gameStats,
  linkAccount,
  listAccounts,
  listGames,
  unlinkAccount,
} from './games'
import { UserNotFoundError } from '../importers/types'

let db: TestDb
let sqlite: ReturnType<typeof createTestDb>['sqlite']
let userId: number

beforeEach(() => {
  const testDb = createTestDb()
  db = testDb.db
  sqlite = testDb.sqlite
  userId = db.insert(users).values({ displayName: 'me', createdAt: 1 }).returning({ id: users.id }).get().id
})

afterEach(() => {
  sqlite.close()
})

function createAccount(platform: 'lichess' | 'chesscom', username: string, ownerId: number = userId): number {
  return db
    .insert(linkedAccounts)
    .values({ userId: ownerId, platform, username })
    .returning({ id: linkedAccounts.id })
    .get().id
}

function insertGame(accountId: number, ownerId: number, fields: Partial<typeof games.$inferInsert>): void {
  db.insert(games)
    .values({
      userId: ownerId,
      accountId,
      platform: 'lichess',
      externalId: `game-${fields.playedAt ?? 0}-${fields.userColor ?? 'white'}-${fields.speed ?? 'blitz'}`,
      url: 'https://lichess.org/x',
      pgn: '1. e4',
      playedAt: 1000,
      speed: 'blitz',
      userColor: 'white',
      result: 'win',
      rated: true,
      importedAt: 1,
      ...fields,
    })
    .run()
}

describe('listGames / gameStats', () => {
  it('returns games newest first and filters by speed, color, result, and rated', () => {
    const accountId = createAccount('lichess', 'poip0i333')
    insertGame(accountId, userId, { playedAt: 1000, speed: 'blitz', userColor: 'white', result: 'win', rated: true })
    insertGame(accountId, userId, { playedAt: 2000, speed: 'blitz', userColor: 'white', result: 'loss', rated: true })
    insertGame(accountId, userId, { playedAt: 3000, speed: 'rapid', userColor: 'black', result: 'draw', rated: true })
    insertGame(accountId, userId, { playedAt: 4000, speed: 'rapid', userColor: 'black', result: 'win', rated: false })

    const all = listGames(db, userId, {}, 1)
    expect(all.total).toBe(4)
    expect(all.games.map((game) => game.playedAt)).toEqual([4000, 3000, 2000, 1000])

    const blitz = listGames(db, userId, { speed: 'blitz' }, 1)
    expect(blitz.total).toBe(2)
    expect(blitz.games.map((game) => game.speed)).toEqual(['blitz', 'blitz'])

    const blackWins = listGames(db, userId, { userColor: 'black', result: 'win' }, 1)
    expect(blackWins.total).toBe(1)
    expect(blackWins.games[0].playedAt).toBe(4000)

    const casual = listGames(db, userId, { rated: false }, 1)
    expect(casual.total).toBe(1)
    expect(casual.games[0].rated).toBe(false)
  })

  it('paginates 50 per page without overlap', () => {
    const accountId = createAccount('lichess', 'poip0i333')
    for (let i = 1; i <= 55; i++) {
      insertGame(accountId, userId, { playedAt: i })
    }
    const page1 = listGames(db, userId, {}, 1)
    const page2 = listGames(db, userId, {}, 2)
    expect(page1.total).toBe(55)
    expect(page1.games).toHaveLength(GAMES_PAGE_SIZE)
    expect(page2.games).toHaveLength(5)
    expect(page1.games[0].playedAt).toBe(55)
    expect(page2.games[0].playedAt).toBe(5)
    const ids = new Set([...page1.games, ...page2.games].map((game) => game.id))
    expect(ids.size).toBe(55)
  })

  it('aggregates stats for the same filters', () => {
    const accountId = createAccount('lichess', 'poip0i333')
    insertGame(accountId, userId, { playedAt: 1000, speed: 'blitz', result: 'win' })
    insertGame(accountId, userId, { playedAt: 2000, speed: 'blitz', result: 'loss' })
    insertGame(accountId, userId, { playedAt: 3000, speed: 'blitz', result: 'draw' })
    insertGame(accountId, userId, { playedAt: 4000, speed: 'rapid', result: 'win' })

    expect(gameStats(db, userId, {})).toEqual({ total: 4, wins: 2, losses: 1, draws: 1 })
    expect(gameStats(db, userId, { speed: 'blitz' })).toEqual({ total: 3, wins: 1, losses: 1, draws: 1 })
    expect(gameStats(db, userId, { speed: 'rapid' })).toEqual({ total: 1, wins: 1, losses: 0, draws: 0 })
  })

  it('filters by accountId', () => {
    const accountA = createAccount('lichess', 'poip0i333')
    const accountB = createAccount('lichess', 'jaeminbbq')
    insertGame(accountA, userId, { playedAt: 1000 })
    insertGame(accountB, userId, { playedAt: 2000 })
    insertGame(accountB, userId, { playedAt: 3000 })

    const a = listGames(db, userId, { accountId: accountA }, 1)
    expect(a.total).toBe(1)
    expect(a.games[0].accountId).toBe(accountA)
    expect(gameStats(db, userId, { accountId: accountB }).total).toBe(2)
  })

  it('never returns another user’s games', () => {
    const accountId = createAccount('lichess', 'poip0i333')
    const other = db
      .insert(users)
      .values({ displayName: 'someone', createdAt: 1 })
      .returning({ id: users.id })
      .get().id
    const otherAccount = createAccount('lichess', 'other-user', other)
    insertGame(accountId, userId, { playedAt: 1000 })
    insertGame(otherAccount, other, { playedAt: 2000 })
    insertGame(otherAccount, other, { playedAt: 3000 })

    expect(listGames(db, userId, {}, 1).total).toBe(1)
    expect(gameStats(db, other, {}).total).toBe(2)
    expect(listAccounts(db, userId)).toHaveLength(1)
    expect(listAccounts(db, other)).toHaveLength(1)
  })
})

describe('listAccounts', () => {
  it('reports game counts and the latest playedAt per account', () => {
    const accountA = createAccount('lichess', 'poip0i333')
    const accountB = createAccount('chesscom', 'poip0i333')
    insertGame(accountA, userId, { playedAt: 1000 })
    insertGame(accountA, userId, { playedAt: 5000 })
    insertGame(accountB, userId, { playedAt: 3000 })

    const accounts = listAccounts(db, userId)
    expect(accounts).toHaveLength(2)
    const a = accounts.find((account) => account.id === accountA)!
    const b = accounts.find((account) => account.id === accountB)!
    expect(a.gameCount).toBe(2)
    expect(a.lastPlayedAt).toBe(5000)
    expect(b.gameCount).toBe(1)
    expect(b.lastPlayedAt).toBe(3000)
  })
})

describe('linkAccount', () => {
  it('stores the platform’s canonical casing', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ username: 'Poip0i333' }), { status: 200 }))
    const id = await linkAccount(db, userId, 'lichess', 'poip0i333', { fetch })
    const account = db.select().from(linkedAccounts).where(eq(linkedAccounts.id, id)).get()
    expect(account?.username).toBe('Poip0i333')
  })

  it('rejects a duplicate for this user with a clear error, case-insensitively', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ username: 'Poip0i333' }), { status: 200 }))
    await linkAccount(db, userId, 'lichess', 'poip0i333', { fetch })
    await expect(linkAccount(db, userId, 'lichess', 'POIP0I333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof DuplicateAccountError && /already linked/.test(e.message),
    )
    // The duplicate is rejected without a second network call.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('propagates UserNotFoundError from the platform check', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 404 }))
    await expect(linkAccount(db, userId, 'lichess', 'ghost', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError,
    )
  })

  it('allows the same username on different platforms', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ username: 'Poip0i333' }), { status: 200 }))
    await linkAccount(db, userId, 'lichess', 'poip0i333', { fetch })
    await expect(linkAccount(db, userId, 'chesscom', 'poip0i333', { fetch })).resolves.toBeTypeOf('number')
    expect(listAccounts(db, userId)).toHaveLength(2)
  })
})

describe('unlinkAccount', () => {
  it('deletes the account and cascades to its games', () => {
    const accountId = createAccount('lichess', 'poip0i333')
    insertGame(accountId, userId, { playedAt: 1000 })
    insertGame(accountId, userId, { playedAt: 2000 })
    const otherAccount = createAccount('lichess', 'jaeminbbq')
    insertGame(otherAccount, userId, { playedAt: 3000 })

    unlinkAccount(db, userId, accountId)
    expect(db.select().from(linkedAccounts).all()).toHaveLength(1)
    expect(db.select().from(games).all()).toHaveLength(1)
    expect(db.select().from(games).all()[0].accountId).toBe(otherAccount)
  })

  it('does not delete another user’s account', () => {
    const other = db
      .insert(users)
      .values({ displayName: 'someone', createdAt: 1 })
      .returning({ id: users.id })
      .get().id
    const otherAccount = createAccount('lichess', 'other-user', other)
    insertGame(otherAccount, other, { playedAt: 1000 })

    unlinkAccount(db, userId, otherAccount)
    expect(db.select().from(linkedAccounts).all()).toHaveLength(1)
    expect(db.select().from(games).all()).toHaveLength(1)
  })
})
