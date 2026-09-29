import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { checkLichessUser, fetchLichessGames, normalizeLichessGame, type LichessGame } from './lichess'
import { RateLimitedError, UserNotFoundError, type ImportedGame } from './types'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../test/fixtures/lichess/${name}`, import.meta.url)), 'utf8')

const ndjsonFixture = fixture('games-poip0i333.ndjson')
const expected = JSON.parse(fixture('expected.json')) as Record<string, Omit<ImportedGame, 'pgn'> | null>

const fixtureGames = ndjsonFixture
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as LichessGame)

const STANDARD_IDS = Object.keys(expected).filter((id) => expected[id] !== null)

async function collect(games: AsyncGenerator<ImportedGame>): Promise<ImportedGame[]> {
  const out: ImportedGame[] = []
  for await (const game of games) out.push(game)
  return out
}

describe('normalizeLichessGame', () => {
  it('matches the golden output for all 10 fixture lines', () => {
    expect(fixtureGames).toHaveLength(10)
    for (const raw of fixtureGames) {
      const normalized = normalizeLichessGame(raw, 'poip0i333')
      const golden = expected[raw.id]
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
    const normalized = normalizeLichessGame(fixtureGames[0], 'POIP0I333')
    expect(normalized!.userColor).toBe('white')
    expect(normalized).toMatchObject(expected[fixtureGames[0].id]!)
  })
})

describe('checkLichessUser', () => {
  function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), { status: 200, ...init })
  }

  it('requests the user endpoint and resolves the canonical username', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(input)).toBe('https://lichess.org/api/user/poip0i333')
      expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
      return jsonResponse({ id: 'poip0i333', username: 'Poip0i333' })
    })
    await expect(checkLichessUser('poip0i333', { fetch })).resolves.toEqual({ username: 'Poip0i333' })
  })

  it('throws UserNotFoundError on 404', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 404 }))
    await expect(checkLichessUser('ghost', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.platform === 'lichess' && e.username === 'ghost',
    )
  })

  it('throws UserNotFoundError for disabled accounts', async () => {
    const fetch = vi.fn(async (): Promise<Response> => jsonResponse({ username: 'Old', disabled: true }))
    await expect(checkLichessUser('old', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.username === 'old',
    )
  })

  it('throws UserNotFoundError for closed accounts', async () => {
    const fetch = vi.fn(async (): Promise<Response> => jsonResponse({ username: 'Old', closed: true }))
    await expect(checkLichessUser('old', { fetch })).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.username === 'old',
    )
  })

  it('throws RateLimitedError on 429', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 429, headers: { 'Retry-After': '8' } }))
    await expect(checkLichessUser('poip0i333', { fetch })).rejects.toSatisfy(
      (e) => e instanceof RateLimitedError && e.retryAfterMs === 8000,
    )
  })
})

describe('fetchLichessGames', () => {
  it('requests exactly the documented query params, adding since only when given', async () => {
    const urls: string[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input))
      return new Response(null, { status: 200 })
    })
    await collect(fetchLichessGames('poip0i333', { fetch }))
    await collect(fetchLichessGames('poip0i333', { fetch, since: 1700000000000 }))
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe(
      'https://lichess.org/api/games/user/poip0i333?pgnInJson=true&opening=true&clocks=true&evals=true&finished=true&sort=dateAsc',
    )
    expect(urls[1]).toBe(
      'https://lichess.org/api/games/user/poip0i333?pgnInJson=true&opening=true&clocks=true&evals=true&finished=true&sort=dateAsc&since=1700000000000',
    )
  })

  it('sends Accept always and the Bearer header only when a token is given', async () => {
    const headers: Headers[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      headers.push(new Headers(init?.headers))
      return new Response(null, { status: 200 })
    })
    await collect(fetchLichessGames('poip0i333', { fetch }))
    await collect(fetchLichessGames('poip0i333', { fetch, token: 'lip_test' }))
    expect(headers[0].get('Accept')).toBe('application/x-ndjson')
    expect(headers[0].get('Authorization')).toBeNull()
    expect(headers[1].get('Authorization')).toBe('Bearer lip_test')
  })

  it('yields exactly the 7 standard games from a body split mid-line and mid-UTF-8', async () => {
    // The fixture is pure ASCII, so append one synthetic line with a 4-byte
    // emoji (normalizes to null: chess960) and split a chunk inside it.
    const body = ndjsonFixture + '{"id":"synthEmoji","variant":"chess960","status":"resign","pgn":"😀😀😀😀"}\n'
    const bytes = new TextEncoder().encode(body)
    const emojiByte = new TextEncoder().encode(body.slice(0, body.indexOf('😀'))).byteLength
    const cuts = [3, 400, 9000, emojiByte + 2, bytes.length - 7]
    const chunks: Uint8Array[] = []
    let start = 0
    for (const cut of [...cuts].sort((a, b) => a - b)) {
      chunks.push(bytes.slice(start, cut))
      start = cut
    }
    chunks.push(bytes.slice(start))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })
    const fetch = vi.fn(async (): Promise<Response> => new Response(stream, { status: 200 }))
    const games = await collect(fetchLichessGames('poip0i333', { fetch }))
    expect(games.map((game) => game.externalId).sort()).toEqual([...STANDARD_IDS].sort())
    for (const game of games) {
      expect(game).toMatchObject(expected[game.externalId]!)
    }
  })

  it('throws RateLimitedError on 429', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 429, headers: { 'Retry-After': '10' } }))
    await expect(collect(fetchLichessGames('poip0i333', { fetch }))).rejects.toSatisfy(
      (e) => e instanceof RateLimitedError && e.retryAfterMs === 10000,
    )
  })

  it('throws UserNotFoundError on 404', async () => {
    const fetch = vi.fn(async (): Promise<Response> => new Response(null, { status: 404 }))
    await expect(collect(fetchLichessGames('ghost', { fetch }))).rejects.toSatisfy(
      (e) => e instanceof UserNotFoundError && e.platform === 'lichess' && e.username === 'ghost',
    )
  })
})
