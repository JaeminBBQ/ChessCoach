import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, max } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import { games, linkedAccounts, users } from '../db/schema'
import { syncAccount } from './sync'

const fixture = (dir: string, name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../test/fixtures/${dir}/${name}`, import.meta.url)), 'utf8')

const archivesFixture = JSON.parse(fixture('chesscom', 'archives.json')) as { archives: string[] }
const archiveFixture = JSON.parse(fixture('chesscom', 'archive-2026-09.json'))
const lichessNdjson = fixture('lichess', 'games-poip0i333.ndjson')

// Two games for a second Lichess account, with IDs that don't collide with the fixture.
const ALT_NDJSON = [
  {
    id: 'alt001',
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    status: 'resign',
    lastMoveAt: 1700000000000,
    winner: 'white',
    players: {
      white: { user: { id: 'jaeminbbq', name: 'JaeminBBQ' }, rating: 1500 },
      black: { user: { id: 'alt-opponent', name: 'AltOpponent' }, rating: 1490 },
    },
    opening: { eco: 'B01', name: 'Scandinavian Defense' },
    pgn: '1. e4 d5 2. exd5 Qxd5',
  },
  {
    id: 'alt002',
    rated: true,
    variant: 'standard',
    speed: 'rapid',
    status: 'mate',
    lastMoveAt: 1700000001000,
    winner: 'black',
    players: {
      white: { user: { id: 'alt-opponent', name: 'AltOpponent' }, rating: 1501 },
      black: { user: { id: 'jaeminbbq', name: 'JaeminBBQ' }, rating: 1499 },
    },
    opening: { eco: 'B02', name: "Alekhine's Defense" },
    pgn: '1. e4 Nf6',
  },
]
  .map((line) => JSON.stringify(line))
  .join('\n')

const LICHESS_OVERLAP_MS = 3 * 24 * 60 * 60 * 1000

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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

/** Mock Chess.com fetch: archives list + the same archive fixture for every month. */
function chesscomFetch(monthUrls: string[] = archivesFixture.archives, onArchive?: (url: string) => Response) {
  const requested: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('/games/archives')) return jsonResponse({ archives: monthUrls })
    return onArchive ? onArchive(url) : jsonResponse(archiveFixture)
  })
  return { fetch, requested }
}

/** Mock Lichess fetch: the fixture NDJSON, recording requested URLs. */
function lichessFetch(body: string = lichessNdjson) {
  const urls: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    urls.push(String(input))
    return new Response(body, { status: 200 })
  })
  return { fetch, urls }
}

describe('syncAccount · Chess.com', () => {
  it('first sync inserts 8 unique games out of 24 seen and sets lastSyncedAt', async () => {
    const accountId = createAccount('chesscom', 'poip0i333')
    const { fetch } = chesscomFetch()
    const result = await syncAccount(db, userId, accountId, { fetch, now: () => 1000 })
    expect(result).toEqual({ status: 'ok', inserted: 8, seen: 24 })
    const account = db.select().from(linkedAccounts).where(eq(linkedAccounts.id, accountId)).get()
    expect(account?.lastSyncedAt).toBe(1000)
    expect(db.select().from(games).all()).toHaveLength(8)
  })

  it('second sync inserts nothing and starts the archive list at the latest game month', async () => {
    const accountId = createAccount('chesscom', 'poip0i333')
    const { fetch } = chesscomFetch()
    await syncAccount(db, userId, accountId, { fetch })

    // An older month appears in the API response; the cursor must skip it.
    const withOlderMonth = [
      'https://api.chess.com/pub/player/poip0i333/games/2026/06',
      ...archivesFixture.archives,
    ]
    const second = chesscomFetch(withOlderMonth)
    const result = await syncAccount(db, userId, accountId, { fetch: second.fetch })
    expect(result.status).toBe('ok')
    expect(result.inserted).toBe(0)
    expect(result.seen).toBe(24)
    const months = second.requested.filter((url) => !url.endsWith('/games/archives'))
    expect(months).toEqual(archivesFixture.archives)
  })

  it('a 429 on the second archive keeps the first month and leaves lastSyncedAt unchanged', async () => {
    const accountId = createAccount('chesscom', 'poip0i333')
    let calls = 0
    const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      calls++
      if (url.endsWith('/games/archives')) return jsonResponse(archivesFixture)
      if (calls === 3) return new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
      return jsonResponse(archiveFixture)
    })
    const result = await syncAccount(db, userId, accountId, { fetch })
    expect(result.status).toBe('rate_limited')
    expect(result.retryAfterMs).toBe(30000)
    expect(result.inserted).toBe(8)
    expect(result.seen).toBe(8)
    expect(db.select().from(games).all()).toHaveLength(8)
    const account = db.select().from(linkedAccounts).where(eq(linkedAccounts.id, accountId)).get()
    expect(account?.lastSyncedAt).toBeNull()
  })
})

describe('syncAccount · Lichess', () => {
  it('first sync fetches without since and inserts 7 games', async () => {
    const accountId = createAccount('lichess', 'poip0i333')
    const { fetch, urls } = lichessFetch()
    const result = await syncAccount(db, userId, accountId, { fetch })
    expect(result).toEqual({ status: 'ok', inserted: 7, seen: 7 })
    expect(urls).toHaveLength(1)
    expect(urls[0]).not.toContain('since=')
  })

  it('second sync uses since = latest playedAt − 3 days', async () => {
    const accountId = createAccount('lichess', 'poip0i333')
    const { fetch, urls } = lichessFetch()
    await syncAccount(db, userId, accountId, { fetch })
    urls.length = 0
    const result = await syncAccount(db, userId, accountId, { fetch })
    expect(result.inserted).toBe(0)
    const latest = db
      .select({ playedAt: max(games.playedAt) })
      .from(games)
      .where(eq(games.accountId, accountId))
      .get()?.playedAt
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain(`since=${latest! - LICHESS_OVERLAP_MS}`)
  })

  it('games from two Lichess accounts get the right accountId', async () => {
    const accountA = createAccount('lichess', 'poip0i333')
    const accountB = createAccount('lichess', 'jaeminbbq')
    const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.includes('/poip0i333')) return new Response(lichessNdjson, { status: 200 })
      if (url.includes('/jaeminbbq')) return new Response(ALT_NDJSON, { status: 200 })
      throw new Error(`unexpected URL: ${url}`)
    })
    await syncAccount(db, userId, accountA, { fetch })
    await syncAccount(db, userId, accountB, { fetch })
    const rows = db.select().from(games).all()
    expect(rows).toHaveLength(9)
    for (const row of rows) {
      if (row.externalId.startsWith('alt')) expect(row.accountId).toBe(accountB)
      else expect(row.accountId).toBe(accountA)
    }
  })
})

describe('syncAccount · ownership', () => {
  it('throws when the account belongs to another user', async () => {
    const other = db
      .insert(users)
      .values({ displayName: 'someone', createdAt: 1 })
      .returning({ id: users.id })
      .get().id
    const accountId = createAccount('lichess', 'poip0i333', other)
    const { fetch } = lichessFetch()
    await expect(syncAccount(db, userId, accountId, { fetch })).rejects.toThrow(/does not belong/)
    expect(db.select().from(games).all()).toHaveLength(0)
  })

  it('throws for an account that does not exist', async () => {
    await expect(syncAccount(db, userId, 999, {})).rejects.toThrow(/does not belong/)
  })
})
