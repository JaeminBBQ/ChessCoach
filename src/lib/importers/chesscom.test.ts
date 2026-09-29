import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import {
  CHESSCOM_USER_AGENT,
  checkChesscomUser,
  fetchChesscomGames,
  listChesscomArchives,
  normalizeChesscomGame,
  type ChesscomGame,
} from './chesscom'
import {
  ImporterHttpError,
  RateLimitedError,
  UserNotFoundError,
  type ImportedGame,
} from './types'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../test/fixtures/chesscom/${name}`, import.meta.url)), 'utf8')

const archivesFixture = JSON.parse(fixture('archives.json')) as { archives: string[] }
const archiveFixture = JSON.parse(fixture('archive-2026-09.json')) as { games: ChesscomGame[] }
const expected = JSON.parse(fixture('expected.json')) as Record<string, Omit<ImportedGame, 'pgn'> | null>

const ARCHIVES_URL = 'https://api.chess.com/pub/player/poip0i333/games/archives'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

async function collect(games: AsyncGenerator<ImportedGame>): Promise<ImportedGame[]> {
  const out: ImportedGame[] = []
  for await (const game of games) out.push(game)
  return out
}

describe('normalizeChesscomGame', () => {
  it('matches the golden output for all 10 fixture games', () => {
    expect(archiveFixture.games).toHaveLength(10)
    for (const raw of archiveFixture.games) {
      const normalized = normalizeChesscomGame(raw, 'poip0i333')
      const golden = expected[raw.uuid]
      if (normalized === null) {
        expect(golden).toBeNull()
      } else {
        expect(golden).not.toBeNull()
        expect(normalized).toMatchObject(golden!)
        expect(normalized.pgn).toBe(raw.pgn)
      }
    }
  })

  it('matches the username case-insensitively', () => {
    const raw = archiveFixture.games[0]
    const normalized = normalizeChesscomGame(raw, 'POIP0I333')
    expect(normalized!.userColor).toBe('white')
    expect(normalized).toMatchObject(expected[raw.uuid]!)
  })

  it('skips games whose time_class is not bullet/blitz/rapid/daily', () => {
    const raw = { ...archiveFixture.games[0], time_class: 'gimmick' }
    expect(normalizeChesscomGame(raw, 'poip0i333')).toBeNull()
  })
})

describe('listChesscomArchives', () => {
  it('lowercases the username and sends the User-Agent header', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(input)).toBe(ARCHIVES_URL)
      expect(new Headers(init?.headers).get('User-Agent')).toBe(CHESSCOM_USER_AGENT)
      return jsonResponse(archivesFixture)
    })
    await expect(listChesscomArchives('POIP0I333', { fetch })).resolves.toEqual(archivesFixture.archives)
  })

  it('throws RateLimitedError on 429, using Retry-After seconds', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 429, headers: { 'Retry-After': '5' } }))
    await expect(listChesscomArchives('poip0i333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof RateLimitedError && e.retryAfterMs === 5000,
    )
  })

  it('defaults to 60s on 429 without a Retry-After header', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 429 }))
    await expect(listChesscomArchives('poip0i333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof RateLimitedError && e.retryAfterMs === 60000,
    )
  })

  it('throws UserNotFoundError on 404', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 404 }))
    await expect(listChesscomArchives('ghost', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.platform === 'chesscom' && e.username === 'ghost',
    )
  })

  it('throws ImporterHttpError on other non-2xx responses', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 500 }))
    await expect(listChesscomArchives('poip0i333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof ImporterHttpError && e.status === 500,
    )
  })
})

describe('checkChesscomUser', () => {
  it('requests the player endpoint with the User-Agent and resolves the canonical username', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(input)).toBe('https://api.chess.com/pub/player/poip0i333')
      expect(new Headers(init?.headers).get('User-Agent')).toBe(CHESSCOM_USER_AGENT)
      return jsonResponse({ username: 'Poip0i333' })
    })
    await expect(checkChesscomUser('poip0i333', { fetch })).resolves.toEqual({ username: 'Poip0i333' })
  })

  it('throws UserNotFoundError on 404', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 404 }))
    await expect(checkChesscomUser('ghost', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.platform === 'chesscom' && e.username === 'ghost',
    )
  })

  it('throws RateLimitedError on 429', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 429, headers: { 'Retry-After': '7' } }))
    await expect(checkChesscomUser('poip0i333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof RateLimitedError && e.retryAfterMs === 7000,
    )
  })
})

describe('fetchChesscomGames', () => {
  function monthFetch(handler?: (url: string) => Response | Promise<Response>) {
    const requested: string[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      requested.push(url)
      if (url.endsWith('/games/archives')) return jsonResponse(archivesFixture)
      return handler ? handler(url) : jsonResponse(archiveFixture)
    })
    return { requested, fetch }
  }

  it('fetches archives oldest → newest, even when the API lists them out of order', async () => {
    const { requested, fetch } = monthFetch()
    await collect(fetchChesscomGames('poip0i333', { fetch }))
    // The archives endpoint returns them shuffled; the client must still walk
    // them in chronological order.
    const archiveUrls = requested.filter((url) => url !== ARCHIVES_URL)
    expect(archiveUrls).toEqual(archivesFixture.archives)
    expect(archiveUrls).toHaveLength(3)
  })

  it('sends the User-Agent header on every request', async () => {
    const uas: (string | null)[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      uas.push(new Headers(init?.headers).get('User-Agent'))
      return String(input).endsWith('/games/archives') ? jsonResponse(archivesFixture) : jsonResponse(archiveFixture)
    })
    await collect(fetchChesscomGames('poip0i333', { fetch }))
    expect(uas).toHaveLength(4)
    expect(uas.every((ua) => ua === CHESSCOM_USER_AGENT)).toBe(true)
  })

  it('fetches only months >= sinceMonth', async () => {
    const { requested, fetch } = monthFetch()
    const games = await collect(fetchChesscomGames('poip0i333', { fetch, sinceMonth: '2026/09' }))
    expect(requested.filter((url) => url !== ARCHIVES_URL)).toEqual([archivesFixture.archives[2]])
    expect(games).toHaveLength(8)
  })

  it('keeps at most one request in flight at any time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight--
      return url.endsWith('/games/archives') ? jsonResponse(archivesFixture) : jsonResponse(archiveFixture)
    })
    const games = await collect(fetchChesscomGames('poip0i333', { fetch }))
    expect(games).toHaveLength(24)
    expect(maxInFlight).toBe(1)
  })

  it('treats a 404 on a month archive as ImporterHttpError, not UserNotFoundError', async () => {
    const { fetch } = monthFetch(() => new Response(null, { status: 404 }))
    await expect(collect(fetchChesscomGames('poip0i333', { fetch }))).rejects.toSatisfy(
      (e) => e instanceof ImporterHttpError && e.status === 404,
    )
  })
})
