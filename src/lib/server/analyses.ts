import { and, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm'

import { classifyMoves, gameSummary } from '../analysis/classify'
import { validateAnalysis, type GameAnalysis } from '../analysis/game-analysis'
import type { getDb } from '../db/client'
import { analyses, games, type Speed } from '../db/schema'
import { syncDrillCards } from './training'

type Db = ReturnType<typeof getDb>

export type GameRow = typeof games.$inferSelect

/** The game if it belongs to `userId`, else undefined. */
export function getGameForUser(db: Db, userId: number, gameId: number): GameRow | undefined {
  return db
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.userId, userId)))
    .get()
}

export function getAnalysis(db: Db, userId: number, gameId: number): GameAnalysis | null {
  const row = db
    .select({ data: analyses.data })
    .from(analyses)
    .where(and(eq(analyses.gameId, gameId), eq(analyses.userId, userId)))
    .get()
  return row ? (JSON.parse(row.data) as GameAnalysis) : null
}

export type SaveResult = { ok: true } | { ok: false; status: 404 | 400; error: string }

/**
 * Validates an analysis against the game's PGN and stores it, replacing any
 * earlier analysis of the same game (e.g. a re-run with a bigger budget).
 */
export function saveAnalysis(db: Db, userId: number, gameId: number, analysis: unknown, now = Date.now()): SaveResult {
  const game = getGameForUser(db, userId, gameId)
  if (!game) return { ok: false, status: 404, error: 'Game not found' }
  const error = validateAnalysis(analysis, game.pgn)
  if (error) return { ok: false, status: 400, error }
  const a = analysis as GameAnalysis
  const row = { engine: a.engine, nodes: a.nodes, version: a.version, data: JSON.stringify(a), createdAt: now }
  db.insert(analyses)
    .values({ userId, gameId, ...row })
    .onConflictDoUpdate({ target: analyses.gameId, set: row })
    .run()
  // A fresh analysis feeds the training deck.
  syncDrillCards(db, userId, now)
  return { ok: true }
}

export interface QueueFilters {
  speed?: Speed
  accountId?: number
  /** Only games played at or after this epoch ms (e.g. Sync & analyze's window). */
  since?: number
}

/** Unanalyzed games, newest first: what a batch run should work through next. */
export function analysisQueue(
  db: Db,
  userId: number,
  filters: QueueFilters,
  limit: number,
): { gameIds: number[]; remaining: number } {
  const where = and(
    eq(games.userId, userId),
    isNull(analyses.id),
    filters.speed ? eq(games.speed, filters.speed) : undefined,
    filters.accountId ? eq(games.accountId, filters.accountId) : undefined,
    filters.since !== undefined ? gte(games.playedAt, filters.since) : undefined,
  )
  const remaining =
    db.select({ n: count() }).from(games).leftJoin(analyses, eq(analyses.gameId, games.id)).where(where).get()?.n ?? 0
  const gameIds = db
    .select({ id: games.id })
    .from(games)
    .leftJoin(analyses, eq(analyses.gameId, games.id))
    .where(where)
    .orderBy(desc(games.playedAt), desc(games.id))
    .limit(limit)
    .all()
    .map((r) => r.id)
  return { gameIds, remaining }
}

/** How many of the user's games have an analysis. */
export function analysisCounts(db: Db, userId: number): { analyzed: number; total: number } {
  const total = db.select({ n: count() }).from(games).where(eq(games.userId, userId)).get()?.n ?? 0
  const analyzed = db.select({ n: count() }).from(analyses).where(eq(analyses.userId, userId)).get()?.n ?? 0
  return { analyzed, total }
}

export interface GameAnalysisSummary {
  /** User accuracy, rounded to a whole number for list display. */
  accuracy: number
  blunders: number
  mistakes: number
}

/**
 * The user's accuracy and blunder/mistake counts for the given games, one row
 * per analyzed game. Classification runs here, once per visible row.
 */
export function summariesForGames(
  db: Db,
  userId: number,
  gameIds: number[],
): Map<number, GameAnalysisSummary> {
  const map = new Map<number, GameAnalysisSummary>()
  if (gameIds.length === 0) return map
  const rows = db
    .select({ gameId: games.id, userColor: games.userColor, data: analyses.data })
    .from(games)
    .innerJoin(analyses, eq(analyses.gameId, games.id))
    .where(and(eq(games.userId, userId), inArray(games.id, gameIds)))
    .all()
  for (const row of rows) {
    const analysis = JSON.parse(row.data) as GameAnalysis
    const summary = gameSummary(classifyMoves(analysis), row.userColor)
    map.set(row.gameId, { accuracy: Math.round(summary.accuracy), blunders: summary.blunders, mistakes: summary.mistakes })
  }
  return map
}
