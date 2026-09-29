import type { Result, Speed, UserColor } from '../db/schema'
import { parseNdjson } from './ndjson'
import {
  ImporterHttpError,
  RateLimitedError,
  UserNotFoundError,
  type FetchDeps,
  type ImportedGame,
} from './types'

/** Lichess game statuses that never reach a result and must be skipped. */
const UNFINISHED_STATUSES = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])

/** Lichess speed values for standard games, mapped onto our Speed type. */
const SPEED_MAP: Record<string, Speed> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
}

export interface LichessPlayer {
  user?: { id?: string; name?: string }
  rating?: number
  aiLevel?: number
}

export interface LichessGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  status: string
  lastMoveAt: number
  winner?: string
  clock?: { initial: number; increment: number }
  daysPerTurn?: number
  players: { white: LichessPlayer; black: LichessPlayer }
  opening?: { eco?: string; name?: string }
  pgn?: string
}

/**
 * Maps one NDJSON export entry to the normalized shape, or null when the game
 * must be skipped (non-standard variant or unfinished).
 */
export function normalizeLichessGame(raw: LichessGame, username: string): ImportedGame | null {
  if (raw.variant !== 'standard') return null
  if (UNFINISHED_STATUSES.has(raw.status)) return null

  const userColor = sideOf(raw, username)
  if (!userColor) return null
  // pgnInJson=true guarantees a pgn; skip rather than store an empty game.
  if (!raw.pgn) return null
  const opponentColor: UserColor = userColor === 'white' ? 'black' : 'white'

  const userSide = raw.players[userColor]
  const opponentSide = raw.players[opponentColor]

  // An unknown speed for a standard game shouldn't happen; skip rather than guess.
  const speed = SPEED_MAP[raw.speed]
  if (!speed) return null

  let result: Result
  if (!raw.winner) result = 'draw'
  else if (raw.winner === userColor) result = 'win'
  else result = 'loss'

  return {
    platform: 'lichess',
    externalId: raw.id,
    url: `https://lichess.org/${raw.id}${userColor === 'black' ? '/black' : ''}`,
    pgn: raw.pgn,
    playedAt: raw.lastMoveAt,
    timeControl: timeControlOf(raw),
    speed,
    userColor,
    result,
    termination: raw.status,
    rated: raw.rated,
    userRating: userSide.rating ?? null,
    opponentName: opponentNameOf(opponentSide),
    opponentRating: opponentSide.rating ?? null,
    openingEco: raw.opening?.eco ?? null,
    openingName: raw.opening?.name ?? null,
  }
}

/**
 * Checks that a Lichess user exists; resolves the canonical casing of the
 * username as stored by the platform. Closed and disabled accounts count as
 * not found.
 */
export async function checkLichessUser(
  username: string,
  deps: FetchDeps = {},
): Promise<{ username: string }> {
  const url = `https://lichess.org/api/user/${username}`
  const response = await (deps.fetch ?? globalThis.fetch)(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throwForUserEndpoint(response, url, username)
  const json = (await response.json()) as { username?: string; disabled?: boolean; closed?: boolean }
  if (json.disabled || json.closed) throw new UserNotFoundError('lichess', username)
  return { username: json.username ?? username }
}

/**
 * Streams the user's finished games, oldest first. There is no pagination;
 * incremental syncs pass `since` (epoch ms). `token` is sent as a Bearer
 * header only when given.
 */
export async function* fetchLichessGames(
  username: string,
  opts: FetchDeps & { since?: number; token?: string } = {},
): AsyncGenerator<ImportedGame> {
  const query =
    'pgnInJson=true&opening=true&clocks=true&evals=true&finished=true&sort=dateAsc' +
    (opts.since !== undefined ? `&since=${opts.since}` : '')
  const url = `https://lichess.org/api/games/user/${username}?${query}`
  const response = await (opts.fetch ?? globalThis.fetch)(url, {
    headers: {
      Accept: 'application/x-ndjson',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
  })
  if (!response.ok) throwForUserEndpoint(response, url, username)
  if (!response.body) return
  for await (const raw of parseNdjson<LichessGame>(response.body)) {
    const game = normalizeLichessGame(raw, username)
    if (game) yield game
  }
}

function sideOf(raw: LichessGame, username: string): UserColor | null {
  const lower = username.toLowerCase()
  if (raw.players.white.user?.id === lower) return 'white'
  if (raw.players.black.user?.id === lower) return 'black'
  return null
}

function timeControlOf(raw: LichessGame): string | null {
  if (raw.clock) return `${raw.clock.initial}+${raw.clock.increment}`
  if (raw.daysPerTurn) return `1/${raw.daysPerTurn * 86400}`
  return null
}

function opponentNameOf(opponent: LichessPlayer): string | null {
  if (opponent.user?.name) return opponent.user.name
  if (opponent.aiLevel !== undefined) return `Stockfish level ${opponent.aiLevel}`
  return null
}

function retryAfterMs(response: Response): number {
  const retryAfter = response.headers.get('Retry-After')
  const seconds = retryAfter !== null ? Number(retryAfter) : NaN
  // The API sends Retry-After as seconds; default to 60s when absent or invalid.
  return (Number.isFinite(seconds) ? seconds : 60) * 1000
}

function throwForUserEndpoint(response: Response, url: string, username: string): never {
  if (response.status === 429) throw new RateLimitedError(retryAfterMs(response))
  if (response.status === 404) throw new UserNotFoundError('lichess', username)
  throw new ImporterHttpError(response.status, url)
}
