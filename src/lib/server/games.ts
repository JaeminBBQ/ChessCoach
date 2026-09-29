import { and, count, desc, eq, max, sql } from 'drizzle-orm'

import type { getDb } from '../db/client'
import { games, linkedAccounts, type Platform, type Result, type Speed, type UserColor } from '../db/schema'
import { checkChesscomUser } from '../importers/chesscom'
import { checkLichessUser } from '../importers/lichess'
import type { FetchDeps } from '../importers/types'

type Db = ReturnType<typeof getDb>

export const GAMES_PAGE_SIZE = 50

export interface GameFilters {
  accountId?: number
  speed?: Speed
  userColor?: UserColor
  result?: Result
  rated?: boolean
}

export type GameRow = typeof games.$inferSelect

/** Newest first; one page of `GAMES_PAGE_SIZE`, plus the total matching the filters. */
export function listGames(
  db: Db,
  userId: number,
  filters: GameFilters,
  page: number,
): { games: GameRow[]; total: number } {
  const where = gameWhere(userId, filters)
  const total = db.select({ n: count() }).from(games).where(where).get()?.n ?? 0
  const rows = db
    .select()
    .from(games)
    .where(where)
    .orderBy(desc(games.playedAt), desc(games.id))
    .limit(GAMES_PAGE_SIZE)
    .offset((page - 1) * GAMES_PAGE_SIZE)
    .all()
  return { games: rows, total }
}

export interface GameStats {
  total: number
  wins: number
  losses: number
  draws: number
}

export function gameStats(db: Db, userId: number, filters: GameFilters): GameStats {
  const rows = db
    .select({ result: games.result, n: count() })
    .from(games)
    .where(gameWhere(userId, filters))
    .groupBy(games.result)
    .all()
  const stats: GameStats = { total: 0, wins: 0, losses: 0, draws: 0 }
  for (const row of rows) {
    stats.total += row.n
    if (row.result === 'win') stats.wins += row.n
    else if (row.result === 'loss') stats.losses += row.n
    else stats.draws += row.n
  }
  return stats
}

export interface AccountWithGames {
  id: number
  platform: Platform
  username: string
  createdAt: number
  lastSyncedAt: number | null
  gameCount: number
  lastPlayedAt: number | null
}

export function listAccounts(db: Db, userId: number): AccountWithGames[] {
  return db
    .select({
      id: linkedAccounts.id,
      platform: linkedAccounts.platform,
      username: linkedAccounts.username,
      createdAt: linkedAccounts.createdAt,
      lastSyncedAt: linkedAccounts.lastSyncedAt,
      gameCount: count(games.id),
      lastPlayedAt: max(games.playedAt),
    })
    .from(linkedAccounts)
    .leftJoin(games, eq(games.accountId, linkedAccounts.id))
    .where(eq(linkedAccounts.userId, userId))
    .groupBy(linkedAccounts.id)
    .orderBy(linkedAccounts.id)
    .all()
}

/** Thrown when the user has already linked the account (case-insensitive). */
export class DuplicateAccountError extends Error {
  constructor(platform: Platform, username: string) {
    super(`${username} is already linked on ${platform === 'lichess' ? 'Lichess' : 'Chess.com'}`)
    this.name = 'DuplicateAccountError'
  }
}

/**
 * Verifies the username on the platform and links it with the platform's
 * canonical casing. Throws `UserNotFoundError` from the check and
 * `DuplicateAccountError` for a repeat link.
 */
export async function linkAccount(
  db: Db,
  userId: number,
  platform: Platform,
  username: string,
  deps: FetchDeps = {},
): Promise<number> {
  const exists = (name: string) =>
    db
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.platform, platform),
          sql`lower(${linkedAccounts.username}) = lower(${name})`,
        ),
      )
      .get()
  if (exists(username)) throw new DuplicateAccountError(platform, username)

  const canonical =
    platform === 'lichess' ? await checkLichessUser(username, deps) : await checkChesscomUser(username, deps)
  // The platform's canonical casing may collide with an existing link.
  if (exists(canonical.username)) throw new DuplicateAccountError(platform, canonical.username)

  return db
    .insert(linkedAccounts)
    .values({ userId, platform, username: canonical.username, createdAt: Date.now() })
    .returning({ id: linkedAccounts.id })
    .get().id
}

/** Deletes the account; its games go with it via the FK cascade. */
export function unlinkAccount(db: Db, userId: number, accountId: number): void {
  db.delete(linkedAccounts)
    .where(and(eq(linkedAccounts.id, accountId), eq(linkedAccounts.userId, userId)))
    .run()
}

function gameWhere(userId: number, filters: GameFilters) {
  const conditions = [eq(games.userId, userId)]
  if (filters.accountId !== undefined) conditions.push(eq(games.accountId, filters.accountId))
  if (filters.speed !== undefined) conditions.push(eq(games.speed, filters.speed))
  if (filters.userColor !== undefined) conditions.push(eq(games.userColor, filters.userColor))
  if (filters.result !== undefined) conditions.push(eq(games.result, filters.result))
  if (filters.rated !== undefined) conditions.push(eq(games.rated, filters.rated))
  return and(...conditions)
}
