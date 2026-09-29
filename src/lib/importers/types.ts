import type { Platform, Result, Speed, UserColor } from '../db/schema'

/** One finished game from either platform, normalized to the DB's shape. */
export interface ImportedGame {
  platform: Platform
  externalId: string
  url: string
  pgn: string
  playedAt: number
  timeControl: string | null
  speed: Speed
  userColor: UserColor
  result: Result
  termination: string | null
  rated: boolean
  userRating: number | null
  opponentName: string | null
  opponentRating: number | null
  openingEco: string | null
  openingName: string | null
}

/** Thrown on HTTP 429. The caller should wait `retryAfterMs` before retrying. */
export class RateLimitedError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`rate limited; retry after ${retryAfterMs} ms`)
    this.name = 'RateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

/** Thrown on HTTP 404 for the user's games endpoint. */
export class UserNotFoundError extends Error {
  platform: Platform
  username: string
  constructor(platform: Platform, username: string) {
    super(`${platform} user not found: ${username}`)
    this.name = 'UserNotFoundError'
    this.platform = platform
    this.username = username
  }
}

/** Thrown on any other non-2xx response. */
export class ImporterHttpError extends Error {
  status: number
  url: string
  constructor(status: number, url: string) {
    super(`GET ${url} failed with status ${status}`)
    this.name = 'ImporterHttpError'
    this.status = status
    this.url = url
  }
}

/** Injectable fetch so tests never touch the network. */
export interface FetchDeps {
  fetch?: typeof fetch
}
