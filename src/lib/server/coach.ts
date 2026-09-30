import { and, eq, gte } from 'drizzle-orm'

import type { CoachGame } from '../analysis/coach'
import type { GameAnalysis } from '../analysis/game-analysis'
import type { getDb } from '../db/client'
import { analyses, games } from '../db/schema'
import { rangeStart, type InsightFilters } from './insights'

type Db = ReturnType<typeof getDb>

/**
 * All games matching the filters with their analyses joined in (left join, so
 * unanalyzed games come back with `analysis: null`), scoped by `userId`.
 */
export function loadCoachGames(db: Db, userId: number, filters: InsightFilters): CoachGame[] {
  const conditions = [eq(games.userId, userId), eq(games.rated, filters.rated ?? true)]
  if (filters.accountId !== undefined) conditions.push(eq(games.accountId, filters.accountId))
  if (filters.speed !== undefined) conditions.push(eq(games.speed, filters.speed))
  const from = rangeStart(filters.range ?? '1y')
  if (from !== null) conditions.push(gte(games.playedAt, from))

  const rows = db
    .select({
      id: games.id,
      platform: games.platform,
      playedAt: games.playedAt,
      userColor: games.userColor,
      result: games.result,
      termination: games.termination,
      speed: games.speed,
      rated: games.rated,
      userRating: games.userRating,
      opponentRating: games.opponentRating,
      opponentName: games.opponentName,
      accountId: games.accountId,
      pgn: games.pgn,
      data: analyses.data,
    })
    .from(games)
    .leftJoin(analyses, and(eq(analyses.gameId, games.id), eq(analyses.userId, games.userId)))
    .where(and(...conditions))
    .all()

  return rows.map((row) => {
    const { data, ...game } = row
    return { ...game, analysis: data ? (JSON.parse(data) as GameAnalysis) : null }
  })
}
