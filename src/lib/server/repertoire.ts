import { and, eq, gte, inArray } from 'drizzle-orm'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

import { firstMoves } from '../analysis/insights'
import type { Score } from '../engine/uci'
import type { getDb } from '../db/client'
import { gameRepertoire, games, repertoireNodes, repertoires, type UserColor } from '../db/schema'
import { buildBookIndex, fenKey, matchGame, type BookNode, type GameMatch } from '../repertoire/match'
import { rangeStart, type InsightFilters } from './insights'

type Db = ReturnType<typeof getDb>

export interface RepertoireRow {
  id: number
  slug: string
  name: string
  color: UserColor
  root: string[]
  engine: string
  generatedAt: number
  importedAt: number
}

function toRow(row: typeof repertoires.$inferSelect): RepertoireRow {
  return { ...row, root: JSON.parse(row.root) as string[] }
}

export function listRepertoires(db: Db, userId: number): RepertoireRow[] {
  return db
    .select()
    .from(repertoires)
    .where(eq(repertoires.userId, userId))
    .orderBy(repertoires.id)
    .all()
    .map(toRow)
}

export function getRepertoire(db: Db, userId: number, slug: string): RepertoireRow | undefined {
  const row = db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.userId, userId), eq(repertoires.slug, slug)))
    .get()
  return row ? toRow(row) : undefined
}

export function getRepertoireById(db: Db, userId: number, id: number): RepertoireRow | undefined {
  const row = db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.userId, userId), eq(repertoires.id, id)))
    .get()
  return row ? toRow(row) : undefined
}

/** A repertoire node with everything the explorer shows. */
export interface NodeRow extends BookNode {
  fen: string
  eval: Score | null
  punish: boolean
  note: string | null
}

/** The user's nodes, optionally of one color only. */
export function loadRepertoireNodes(db: Db, userId: number, color?: UserColor): NodeRow[] {
  let rows = db
    .select()
    .from(repertoireNodes)
    .where(eq(repertoireNodes.userId, userId))
    .orderBy(repertoireNodes.id)
    .all()
  if (color !== undefined) {
    const ids = new Set(listRepertoires(db, userId).filter((r) => r.color === color).map((r) => r.id))
    rows = rows.filter((row) => ids.has(row.repertoireId))
  }
  return rows.map((row) => ({
    id: row.id,
    repertoireId: row.repertoireId,
    path: row.path,
    san: row.san,
    by: row.by,
    fenKey: row.fenKey,
    fen: row.fen,
    eval: row.eval ? (JSON.parse(row.eval) as Score) : null,
    punish: row.punish,
    note: row.note,
  }))
}

export interface RepertoireGame {
  id: number
  playedAt: number
  userColor: UserColor
  result: 'win' | 'loss' | 'draw'
  pgn: string
}

export interface RepertoireFilters extends InsightFilters {
  /** Restrict to games where the user played this color. */
  color?: UserColor
}

/** The games matching the filters, with just the columns repertoire stats need. */
export function loadRepertoireGames(db: Db, userId: number, filters: RepertoireFilters): RepertoireGame[] {
  const conditions = [eq(games.userId, userId), eq(games.rated, filters.rated ?? true)]
  if (filters.accountId !== undefined) conditions.push(eq(games.accountId, filters.accountId))
  if (filters.speed !== undefined) conditions.push(eq(games.speed, filters.speed))
  if (filters.color !== undefined) conditions.push(eq(games.userColor, filters.color))
  const from = rangeStart(filters.range ?? 'all')
  if (from !== null) conditions.push(gte(games.playedAt, from))
  return db
    .select({ id: games.id, playedAt: games.playedAt, userColor: games.userColor, result: games.result, pgn: games.pgn })
    .from(games)
    .where(and(...conditions))
    .all()
}

/** The cached book matches of the given games (default: all the user's), by game id. */
export function loadGameMatches(db: Db, userId: number, gameIds?: number[]): Map<number, GameMatch> {
  const conditions = [eq(gameRepertoire.userId, userId)]
  if (gameIds !== undefined) conditions.push(inArray(gameRepertoire.gameId, gameIds))
  const rows = db.select().from(gameRepertoire).where(and(...conditions)).all()
  const map = new Map<number, GameMatch>()
  for (const row of rows) {
    map.set(row.gameId, {
      status: row.status,
      repertoireId: row.repertoireId,
      leftPly: row.leftPly,
      leftSan: row.leftSan,
      bookSans: row.bookSans ? (JSON.parse(row.bookSans) as string[]) : null,
      positions: JSON.parse(row.positions) as number[],
    })
  }
  return map
}

/** The cached match of one game, computed (and stored) first if it is missing. */
export function ensureGameMatch(db: Db, userId: number, gameId: number): GameMatch | undefined {
  ensureGameRepertoire(db, userId, [gameId])
  return loadGameMatches(db, userId, [gameId]).get(gameId)
}

/** The book path and repertoire slug of a canonical node (for the banner's Explore link). */
export function getNodeLine(db: Db, userId: number, nodeId: number): { slug: string; path: string } | undefined {
  return db
    .select({ slug: repertoires.slug, path: repertoireNodes.path })
    .from(repertoireNodes)
    .innerJoin(repertoires, eq(repertoires.id, repertoireNodes.repertoireId))
    .where(and(eq(repertoireNodes.id, nodeId), eq(repertoireNodes.userId, userId)))
    .get()
}

/**
 * Computes and stores the book match of every listed game that has no cached
 * row yet (the lazy fill the repertoire pages run on the games they show).
 */
export function ensureGameRepertoire(db: Db, userId: number, gameIds: number[]): void {
  const ids = [...new Set(gameIds)]
  if (ids.length === 0) return
  const existing = db
    .select({ gameId: gameRepertoire.gameId })
    .from(gameRepertoire)
    .where(and(eq(gameRepertoire.userId, userId), inArray(gameRepertoire.gameId, ids)))
    .all()
  const missing = ids.filter((id) => !existing.some((row) => row.gameId === id))
  if (missing.length === 0) return

  const reps = listRepertoires(db, userId)
  const index = buildBookIndex(loadRepertoireNodes(db, userId), reps)
  const rows = db
    .select({ id: games.id, pgn: games.pgn, userColor: games.userColor })
    .from(games)
    .where(and(eq(games.userId, userId), inArray(games.id, missing)))
    .all()
  const now = Date.now()
  for (const game of rows) {
    const match = matchGame(index, firstMoves(game.pgn, 40), game.userColor)
    db.insert(gameRepertoire)
      .values({
        gameId: game.id,
        userId,
        status: match.status,
        repertoireId: match.repertoireId,
        leftPly: match.leftPly,
        leftSan: match.leftSan,
        bookSans: match.bookSans !== null ? JSON.stringify(match.bookSans) : null,
        positions: JSON.stringify(match.positions),
        computedAt: now,
      })
      .run()
  }
}

interface TreeFile {
  id: string
  name: string
  color: UserColor
  root: string[]
  engine: string
  generatedAt: string
  nodes: {
    path: string
    san: string
    by: 'user' | 'opponent'
    fen: string
    eval: Score | null
    punish?: boolean
    note?: string
  }[]
}

type NodeInsert = typeof repertoireNodes.$inferInsert

/**
 * Imports every tree JSON in `setDir` for the user: one transaction per tree
 * that upserts the repertoire row and replaces its nodes, then clears the
 * user's match cache (node ids, and so canonical ids, change on re-import).
 * Idempotent: running it twice leaves the same row counts and paths.
 */
export function importRepertoireSet(db: Db, userId: number, setDir: string): void {
  const files = readdirSync(setDir)
    .filter((file) => file.endsWith('.json') && file !== 'specs.json')
    .sort()
  for (const file of files) {
    const tree = JSON.parse(readFileSync(path.join(setDir, file), 'utf8')) as TreeFile
    db.transaction((tx) => {
      const existing = tx
        .select({ id: repertoires.id })
        .from(repertoires)
        .where(and(eq(repertoires.userId, userId), eq(repertoires.slug, tree.id)))
        .get()
      const values = {
        userId,
        slug: tree.id,
        name: tree.name,
        color: tree.color,
        root: JSON.stringify(tree.root),
        engine: tree.engine,
        generatedAt: Date.parse(tree.generatedAt) || 0,
        importedAt: Date.now(),
      }
      let repertoireId: number
      if (existing) {
        repertoireId = existing.id
        tx.update(repertoires).set(values).where(eq(repertoires.id, repertoireId)).run()
      } else {
        repertoireId = tx.insert(repertoires).values(values).returning({ id: repertoires.id }).get().id
      }
      tx.delete(repertoireNodes).where(eq(repertoireNodes.repertoireId, repertoireId)).run()
      tx.insert(repertoireNodes)
        .values([...prefixNodes(userId, repertoireId, tree), ...bodyNodes(userId, repertoireId, tree)])
        .run()
    })
  }
  db.delete(gameRepertoire).where(eq(gameRepertoire.userId, userId)).run()
}

/** The root-path prefix positions (eval null), so games can be followed from move 1. */
function prefixNodes(userId: number, repertoireId: number, tree: TreeFile): NodeInsert[] {
  const nodes: NodeInsert[] = []
  const chess = new Chess()
  for (let i = 0; i < tree.root.length; i++) {
    const move = chess.move(tree.root[i])
    const white = i % 2 === 0
    const by = white === (tree.color === 'white') ? 'user' : 'opponent'
    nodes.push({
      repertoireId,
      userId,
      path: tree.root.slice(0, i + 1).join(' '),
      san: move.san,
      by,
      fen: chess.fen(),
      fenKey: fenKey(chess.fen()),
      eval: null,
      punish: false,
      note: null,
    })
  }
  return nodes
}

function bodyNodes(userId: number, repertoireId: number, tree: TreeFile): NodeInsert[] {
  return tree.nodes.map((node) => ({
    repertoireId,
    userId,
    path: node.path,
    san: node.san,
    by: node.by,
    fen: node.fen,
    fenKey: fenKey(node.fen),
    eval: node.eval ? JSON.stringify(node.eval) : null,
    punish: node.punish ?? false,
    note: node.note ?? null,
  }))
}
