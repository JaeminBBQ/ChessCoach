// Lichess opening explorer (lichess games at club ratings) for repertoire
// generation: which moves real club players choose in a position. Responses
// are cached on disk forever (positions don't change), and requests are
// serialized across the parallel generation shards with a lock directory:
// one request at a time, ≥ 1 s apart, and a 60 s pause on HTTP 429.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CACHE = path.resolve('content/repertoire/explorer-cache.json')
const LOCK = path.resolve('content/repertoire/.explorer.lock')
const USER_AGENT = 'ChessCoach/0.1 (personal training app; contact.jaemin@gmail.com)'
const RATINGS = '1000,1200,1400,1600'
const SPEEDS = 'blitz,rapid'
/** Positions with fewer explorer games than this give no popularity data. */
const MIN_GAMES = 50

export interface PopularMove {
  san: string
  share: number
}

type Cache = Record<string, { total: number; moves: { san: string; games: number }[] }>

/** LICHESS_TOKEN from the environment or `.env` (never logged). */
export function lichessToken(): string | null {
  if (process.env.LICHESS_TOKEN) return process.env.LICHESS_TOKEN
  if (!existsSync('.env')) return null
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('LICHESS_TOKEN='))
  return line ? line.slice('LICHESS_TOKEN='.length).trim().replace(/^["']|["']$/g, '') || null : null
}

function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

function readCache(): Cache {
  return existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, 'utf8')) as Cache) : {}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Cross-process mutex: mkdir is atomic. A lock older than 3 minutes is stale. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      mkdirSync(LOCK)
      break
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 180_000) rmSync(LOCK, { recursive: true, force: true })
      } catch {
        // The holder released it in between; retry.
      }
      await sleep(100)
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(LOCK, { recursive: true, force: true })
  }
}

/** A `popular` source for `buildRepertoire`, or null without a token. */
export function explorerSource(): ((fen: string) => Promise<PopularMove[]>) | null {
  const token = lichessToken()
  if (!token) return null
  return async (fen) => {
    const key = fenKey(fen)
    let entry = readCache()[key]
    if (!entry) {
      entry = await withLock(async () => {
        // Another shard may have fetched it while we waited.
        const cached = readCache()[key]
        if (cached) return cached
        const fetched = await fetchExplorer(fen, token)
        await sleep(1000)
        const cache = readCache()
        cache[key] = fetched
        writeFileSync(CACHE, JSON.stringify(cache) + '\n')
        return fetched
      })
    }
    if (entry.total < MIN_GAMES) return []
    return entry.moves.map((m) => ({ san: m.san, share: Math.round((m.games / entry.total) * 1000) / 1000 }))
  }
}

async function fetchExplorer(fen: string, token: string): Promise<Cache[string]> {
  const url =
    'https://explorer.lichess.ovh/lichess?variant=standard' +
    `&fen=${encodeURIComponent(fen)}&speeds=${SPEEDS}&ratings=${RATINGS}&moves=12&topGames=0&recentGames=0`
  // Network errors and 5xx back off 5 s → 10 s → … (capped at 2 min); 429 waits 61 s.
  for (let attempt = 0; attempt < 10; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      await sleep(Math.min(120_000, 5_000 * 2 ** attempt))
      continue
    }
    if (res.status === 429) {
      await sleep(61_000)
      continue
    }
    if (res.status >= 500) {
      await sleep(Math.min(120_000, 5_000 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`explorer HTTP ${res.status}`)
    const body = (await res.json()) as { moves: { san: string; white: number; draws: number; black: number }[] }
    const moves = body.moves.map((m) => ({ san: m.san, games: m.white + m.draws + m.black }))
    return { total: moves.reduce((sum, m) => sum + m.games, 0), moves }
  }
  throw new Error('explorer: unreachable after 10 attempts')
}
