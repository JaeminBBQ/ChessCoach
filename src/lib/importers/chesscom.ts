import { START_FEN } from '../chess/position'
import type { Result, Speed, UserColor } from '../db/schema'
import {
  ImporterHttpError,
  RateLimitedError,
  UserNotFoundError,
  type FetchDeps,
  type ImportedGame,
} from './types'

const API_BASE = 'https://api.chess.com/pub'

/** User-Agent for Chess.com PubAPI requests; `CHESSCOM_CONTACT` is an email or URL. */
export const CHESSCOM_USER_AGENT = process.env.CHESSCOM_CONTACT
  ? `ChessCoach/0.1 (+${process.env.CHESSCOM_CONTACT})`
  : 'ChessCoach/0.1'

/** Result codes Chess.com reports on both sides of a drawn game. */
const DRAW_CODES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

export interface ChesscomGame {
  uuid: string
  url: string
  pgn: string
  end_time: number
  time_control: string
  time_class: string
  rated: boolean
  rules: string
  initial_setup?: string
  eco?: string
  white: ChesscomPlayer
  black: ChesscomPlayer
}

export interface ChesscomPlayer {
  username: string
  rating: number
  result: string
}

/**
 * Maps a Chess.com archive entry to the normalized shape, or null when the
 * game must be skipped (variant or custom start position).
 */
export function normalizeChesscomGame(raw: ChesscomGame, username: string): ImportedGame | null {
  if (raw.rules !== 'chess') return null
  if (raw.initial_setup !== undefined && raw.initial_setup !== START_FEN) return null

  const userColor = sideOf(raw, username)
  if (!userColor) return null
  const opponentColor: UserColor = userColor === 'white' ? 'black' : 'white'

  const userSide = raw[userColor]
  const opponentSide = raw[opponentColor]
  const result = mapResult(userSide.result)

  return {
    platform: 'chesscom',
    externalId: raw.uuid,
    url: raw.url,
    pgn: raw.pgn,
    playedAt: raw.end_time * 1000,
    timeControl: raw.time_control,
    // time_class values (bullet/blitz/rapid/daily) are a subset of Speed.
    speed: raw.time_class as Speed,
    userColor,
    result,
    // When the user won, the game ended by the opponent's result code.
    termination: result === 'win' ? opponentSide.result : userSide.result,
    rated: raw.rated,
    userRating: userSide.rating,
    opponentName: opponentSide.username,
    opponentRating: opponentSide.rating,
    openingEco: pgnEco(raw.pgn),
    openingName: raw.eco ? openingNameFromUrl(raw.eco) : null,
  }
}

/** Lists the player's monthly archive URLs. */
export async function listChesscomArchives(username: string, deps: FetchDeps = {}): Promise<string[]> {
  const url = `${API_BASE}/player/${username.toLowerCase()}/games/archives`
  const response = await (deps.fetch ?? globalThis.fetch)(url, {
    headers: { 'User-Agent': CHESSCOM_USER_AGENT },
  })
  if (!response.ok) throwForUserEndpoint(response, url, username)
  const json = (await response.json()) as { archives?: string[] }
  return json.archives ?? []
}

/**
 * Yields the user's finished games by walking their monthly archives oldest →
 * newest, one request at a time. Months before `sinceMonth` ('YYYY/MM') are
 * skipped.
 */
export async function* fetchChesscomGames(
  username: string,
  opts: FetchDeps & { sinceMonth?: string } = {},
): AsyncGenerator<ImportedGame> {
  const archives = await listChesscomArchives(username, opts)
  const months = archives
    .map((url) => ({ url, month: monthOf(url) }))
    .filter(({ month }) => opts.sinceMonth === undefined || month >= opts.sinceMonth)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  for (const { url } of months) {
    const response = await (opts.fetch ?? globalThis.fetch)(url, {
      headers: { 'User-Agent': CHESSCOM_USER_AGENT },
    })
    if (!response.ok) throwForArchiveEndpoint(response, url)
    const json = (await response.json()) as { games: ChesscomGame[] }
    for (const raw of json.games) {
      const game = normalizeChesscomGame(raw, username)
      if (game) yield game
    }
  }
}

function sideOf(raw: ChesscomGame, username: string): UserColor | null {
  const lower = username.toLowerCase()
  if (raw.white.username.toLowerCase() === lower) return 'white'
  if (raw.black.username.toLowerCase() === lower) return 'black'
  return null
}

function mapResult(code: string): Result {
  if (code === 'win') return 'win'
  return DRAW_CODES.has(code) ? 'draw' : 'loss'
}

function pgnEco(pgn: string): string | null {
  return /\[ECO "([^"]+)"\]/.exec(pgn)?.[1] ?? null
}

function openingNameFromUrl(ecoUrl: string): string | null {
  const segment = ecoUrl.split('/').pop()
  return segment ? segment.replace(/-/g, ' ') : null
}

function retryAfterMs(response: Response): number {
  const retryAfter = response.headers.get('Retry-After')
  const seconds = retryAfter !== null ? Number(retryAfter) : NaN
  // The API sends Retry-After as seconds; default to 60s when absent or invalid.
  return (Number.isFinite(seconds) ? seconds : 60) * 1000
}

function throwForUserEndpoint(response: Response, url: string, username: string): never {
  if (response.status === 429) throw new RateLimitedError(retryAfterMs(response))
  if (response.status === 404) throw new UserNotFoundError('chesscom', username)
  throw new ImporterHttpError(response.status, url)
}

function throwForArchiveEndpoint(response: Response, url: string): never {
  if (response.status === 429) throw new RateLimitedError(retryAfterMs(response))
  throw new ImporterHttpError(response.status, url)
}

/** The 'YYYY/MM' suffix of an archive URL, '' when it doesn't match. */
function monthOf(archiveUrl: string): string {
  return /(\d{4}\/\d{2})$/.exec(archiveUrl)?.[1] ?? ''
}
