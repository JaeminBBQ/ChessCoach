import { and, eq, gte } from 'drizzle-orm'

import type { InsightGame } from '../analysis/insights'
import type { getDb } from '../db/client'
import { games, type Speed } from '../db/schema'

type Db = ReturnType<typeof getDb>

export const ranges = ['90d', '1y', 'all'] as const
export type Range = (typeof ranges)[number]

export interface InsightFilters {
  accountId?: number
  speed?: Speed
  /** Defaults to true: casual games are noise for coaching stats. */
  rated?: boolean
  /** Defaults to '1y'. */
  range?: Range
}

/** All games matching the filters, with only the columns the insights need. */
export function loadInsightGames(db: Db, userId: number, filters: InsightFilters): InsightGame[] {
  const conditions = [eq(games.userId, userId), eq(games.rated, filters.rated ?? true)]
  if (filters.accountId !== undefined) conditions.push(eq(games.accountId, filters.accountId))
  if (filters.speed !== undefined) conditions.push(eq(games.speed, filters.speed))
  const from = rangeStart(filters.range ?? '1y')
  if (from !== null) conditions.push(gte(games.playedAt, from))
  return db
    .select({
      playedAt: games.playedAt,
      userColor: games.userColor,
      result: games.result,
      termination: games.termination,
      speed: games.speed,
      rated: games.rated,
      userRating: games.userRating,
      opponentRating: games.opponentRating,
      accountId: games.accountId,
      pgn: games.pgn,
    })
    .from(games)
    .where(and(...conditions))
    .all()
}

function rangeStart(range: Range): number | null {
  if (range === 'all') return null
  const days = range === '90d' ? 90 : 365
  return Date.now() - days * 24 * 60 * 60 * 1000
}
