import { Chess } from 'chess.js'

import { winPercent } from '../analysis/classify'
import type { Score } from '../engine/uci'
import type { Result, UserColor } from '../db/schema'

/**
 * Matching games against the imported repertoire trees (T008). Pure functions:
 * no DB, no engine. Positions are compared by `fenKey` — the first four FEN
 * fields — so transpositions count, and check marks never matter (both are
 * stripped before the chess.js replay).
 */

export type MatchStatus = 'book-end' | 'user-left' | 'opponent-left' | 'game-ended'

export interface GameMatch {
  status: MatchStatus
  repertoireId: number | null
  /** The ply where the book was left (deviations), the last in-book ply (book-end), or the game length (game-ended). */
  leftPly: number | null
  leftSan: string | null
  /** The book moves' SANs at the deviation position; null for non-deviations. */
  bookSans: string[] | null
  /** Canonical node ids visited in order: index i is the position after ply i+1. */
  positions: number[]
}

export interface BookNode {
  id: number
  repertoireId: number
  path: string
  san: string
  by: 'user' | 'opponent'
  fenKey: string
}

export interface BookRepertoire {
  id: number
  color: UserColor
  /** SAN moves from the start position to where the tree begins. */
  root: string[]
}

export interface BookMove {
  /** fenKey of the position after the move. */
  fenKey: string
  san: string
  by: 'user' | 'opponent'
  /** The canonical node id of the resulting position. */
  canonicalId: number
}

export interface ColorIndex {
  /** fenKey → canonical node (the lowest-id node with that fenKey, this color only). */
  canonical: Map<string, BookNode>
  /** Book moves at a position (fenKey), in deterministic order. */
  movesAt: Map<string, BookMove[]>
  /** repertoireId → the tree's root path length. */
  rootLengths: Map<number, number>
}

export interface BookIndex {
  white: ColorIndex
  black: ColorIndex
}

export const START_FEN_KEY = fenKey(new Chess().fen())

/** The first four FEN fields: placement, side to move, castling, en passant. */
export function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

/**
 * Per-color index over a user's repertoire nodes. The start position is the
 * root of each color: its book moves are the first moves of that color's
 * trees. Book moves at a position P are the distinct children of every node
 * whose fenKey is P's.
 */
export function buildBookIndex(nodes: readonly BookNode[], repertoires: readonly BookRepertoire[]): BookIndex {
  const byColor = (color: UserColor): ColorIndex => {
    const roots = repertoires.filter((r) => r.color === color)
    const rootLengths = new Map(roots.map((r) => [r.id, r.root.length]))
    const repertoireIds = new Set(rootLengths.keys())
    const sorted = nodes.filter((n) => repertoireIds.has(n.repertoireId)).sort((a, b) => a.id - b.id)

    const canonical = new Map<string, BookNode>()
    const byFen = new Map<string, BookNode[]>()
    const childrenByPath = new Map<string, BookMove[]>()
    for (const node of sorted) {
      if (!canonical.has(node.fenKey)) canonical.set(node.fenKey, node)
      const list = byFen.get(node.fenKey) ?? []
      list.push(node)
      byFen.set(node.fenKey, list)
      const parent = parentPath(node.path)
      const child: BookMove = { fenKey: node.fenKey, san: node.san, by: node.by, canonicalId: canonical.get(node.fenKey)!.id }
      const siblings = childrenByPath.get(parent) ?? []
      if (!siblings.some((m) => m.fenKey === child.fenKey)) siblings.push(child)
      childrenByPath.set(parent, siblings)
    }

    const movesAt = new Map<string, BookMove[]>()
    movesAt.set(START_FEN_KEY, childrenByPath.get('') ?? [])
    for (const node of sorted) {
      if (movesAt.has(node.fenKey)) continue
      const moves = new Map<string, BookMove>()
      for (const same of byFen.get(node.fenKey) ?? []) {
        for (const child of childrenByPath.get(same.path) ?? []) {
          if (!moves.has(child.fenKey)) moves.set(child.fenKey, child)
        }
      }
      movesAt.set(node.fenKey, [...moves.values()])
    }
    return { canonical, movesAt, rootLengths }
  }
  return { white: byColor('white'), black: byColor('black') }
}

/** The parent path of a node ('' for the first moves), used to find children. */
function parentPath(path: string): string {
  const tokens = path.split(' ')
  return tokens.slice(0, -1).join(' ')
}

/**
 * Plays the game's first `sans` against the book of `userColor` (see the T008
 * spec for the exact rules). Never throws: unplayable moves end the match like
 * a game that ran out.
 */
export function matchGame(index: BookIndex, sans: readonly string[], userColor: UserColor): GameMatch {
  const color = index[userColor]
  const chess = new Chess()
  let currentKey = START_FEN_KEY
  let repertoireId: number | null = null
  const positions: number[] = []
  for (let ply = 1; ply <= sans.length; ply++) {
    const bookMoves = color.movesAt.get(currentKey) ?? []
    if (bookMoves.length === 0) {
      return { status: 'book-end', repertoireId, leftPly: ply - 1, leftSan: null, bookSans: null, positions }
    }
    const san = stripMarks(sans[ply - 1])
    let moved
    try {
      moved = chess.move(san)
    } catch {
      return { status: 'game-ended', repertoireId, leftPly: ply - 1, leftSan: null, bookSans: null, positions }
    }
    const childKey = fenKey(chess.fen())
    const bookMove = bookMoves.find((m) => m.fenKey === childKey)
    if (!bookMove) {
      const moverIsUser = (ply % 2 === 1) === (userColor === 'white')
      return {
        status: moverIsUser ? 'user-left' : 'opponent-left',
        repertoireId,
        leftPly: ply,
        leftSan: moved.san.replace(/[+#]+$/, ''),
        bookSans: bookMoves.map((m) => m.san),
        positions,
      }
    }
    const canonical = color.canonical.get(childKey)!
    positions.push(canonical.id)
    if (pastRoot(canonical, color)) repertoireId = canonical.repertoireId
    currentKey = childKey
  }
  return { status: 'game-ended', repertoireId, leftPly: sans.length, leftSan: null, bookSans: null, positions }
}

/** A node is "past the root path" when its path is deeper than its tree's root. */
function pastRoot(node: BookNode, color: ColorIndex): boolean {
  return node.path.split(' ').length > (color.rootLengths.get(node.repertoireId) ?? 0)
}

function stripMarks(san: string): string {
  return san.replace(/[+#!?]+$/, '')
}

/** One position's live stats: the games through it, and the off-book moves played there. */
export interface PositionStats {
  n: number
  score: number
  offBook: Map<string, { by: 'user' | 'opponent'; n: number; score: number }>
}

export interface MatchRow {
  match: GameMatch
  game: {
    userColor: UserColor
    result: Result
    /** The game's first SAN moves (up to 40 plies), as passed to matchGame. */
    sans: string[]
  }
}

/**
 * Per canonical node id: the games through it (n, score) and the off-book
 * moves played at each position, by whom, with counts and scores. Off-book
 * moves are the deviations and the follow-up move of book-end games.
 */
export function bookStats(rows: readonly MatchRow[]): Map<number, PositionStats> {
  const stats = new Map<number, PositionStats>()
  for (const { match, game } of rows) {
    const points = resultPoints(game.result)
    for (const nodeId of match.positions) {
      const entry = at(stats, nodeId)
      entry.n++
      entry.score += points
    }
    if ((match.status === 'user-left' || match.status === 'opponent-left') && match.leftPly !== null && match.leftSan !== null) {
      if (match.leftPly >= 2) {
        const positionId = match.positions[match.leftPly - 2]
        if (positionId !== undefined) addOffBook(at(stats, positionId), match.leftSan, match.status === 'user-left' ? 'user' : 'opponent', points)
      }
    } else if (match.status === 'book-end' && match.leftPly !== null) {
      // The game's next move is off-book at the book's end position.
      const san = stripMarks(game.sans[match.leftPly] ?? '')
      if (san) {
        const positionId = match.positions[match.leftPly - 1]
        if (positionId !== undefined) {
          const mover: 'user' | 'opponent' = moverOf(match.leftPly + 1, game.userColor)
          addOffBook(at(stats, positionId), san, mover, points)
        }
      }
    }
  }
  return stats
}

function at(stats: Map<number, PositionStats>, id: number): PositionStats {
  const existing = stats.get(id)
  if (existing) return existing
  const created: PositionStats = { n: 0, score: 0, offBook: new Map() }
  stats.set(id, created)
  return created
}

function addOffBook(stats: PositionStats, san: string, by: 'user' | 'opponent', points: number): void {
  const entry = stats.offBook.get(san) ?? { by, n: 0, score: 0 }
  entry.n++
  entry.score += points
  stats.offBook.set(san, entry)
}

function moverOf(ply: number, userColor: UserColor): 'user' | 'opponent' {
  const white = ply % 2 === 1
  return white === (userColor === 'white') ? 'user' : 'opponent'
}

export function resultPoints(result: Result): number {
  return result === 'win' ? 1 : result === 'draw' ? 0.5 : 0
}

/** The three card buckets: stayed in the book, the user strayed, or the opponent left. */
export function matchBucket(status: MatchStatus): 'followed' | 'strayed' | 'opponent-left' {
  if (status === 'user-left') return 'strayed'
  if (status === 'opponent-left') return 'opponent-left'
  return 'followed' // book-end and game-ended: the game never left the book
}

/** Card split labels — the book is the owner's plan, so a user deviation is a "stray". */
export const BUCKET_LABELS = {
  followed: 'followed to the end',
  strayed: 'strayed',
  'opponent-left': 'opponent left',
} as const

/** The user's score (0–1) from win/draw/loss counts. */
export function scoreOf(points: number, n: number): number {
  return n === 0 ? 0 : points / n
}

export interface Deviation {
  /** Canonical node id of the position the deviation was played from; null for the start position. */
  canonicalId: number | null
  /** The canonical node's repertoire; null for the start position. */
  repertoireId: number | null
  /** The book line (SANs) to that position, for display and the Explore link; [] for the start position. */
  line: string[]
  san: string
  by: 'user' | 'opponent'
  bookSans: string[]
  n: number
  score: number
}

/**
 * The most common deviations, grouped by position + move, in two lists (what
 * opponents play off-book, and where the user left the book), each top-N by
 * count. Deviations on the shared root moves count too: their position is a
 * root-path node (or the start position for ply 1), so `repertoireId` can be
 * null even though the game itself never entered a tree.
 */
export function topDeviations(
  rows: readonly MatchRow[],
  nodes: readonly BookNode[],
  top: number,
): { opponent: Deviation[]; user: Deviation[] } {
  const lineByNode = new Map(nodes.map((n) => [n.id, n]))
  const groups = new Map<string, Deviation>()
  for (const { match, game } of rows) {
    if (match.status !== 'user-left' && match.status !== 'opponent-left') continue
    if (match.leftPly === null || match.leftSan === null) continue
    const node = match.leftPly >= 2 ? lineByNode.get(match.positions[match.leftPly - 2]) : undefined
    const by: Deviation['by'] = match.status === 'user-left' ? 'user' : 'opponent'
    const key = `${node?.id ?? 'start'} ${match.leftSan}`
    let row = groups.get(key)
    if (!row) {
      row = {
        canonicalId: node?.id ?? null,
        repertoireId: node?.repertoireId ?? null,
        line: node ? node.path.split(' ') : [],
        san: match.leftSan,
        by,
        bookSans: match.bookSans ?? [],
        n: 0,
        score: 0,
      }
      groups.set(key, row)
    }
    row.n++
    row.score += resultPoints(game.result)
  }
  const ranked = [...groups.values()].sort(compareDeviations).map((d) => ({ ...d, score: scoreOf(d.score, d.n) }))
  return {
    opponent: ranked.filter((d) => d.by === 'opponent').slice(0, top),
    user: ranked.filter((d) => d.by === 'user').slice(0, top),
  }
}

function compareDeviations(a: Deviation, b: Deviation): number {
  return b.n - a.n || a.line.join(' ').localeCompare(b.line.join(' ')) || a.san.localeCompare(b.san)
}

/** SANs with move numbers, standard style: `1. e4 e5 2. Nf3 Nc6`. */
export function formatLine(sans: readonly string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ')
}

/** `3.` / `3...` for a ply. */
export function moveNo(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`
}

/** The user's win % (0–100, rounded) at a book node; terminal positions are judged from the FEN. */
export function nodeWin(evalScore: Score | null, fen: string, userColor: UserColor): number | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return chess.turn() === (userColor === 'white' ? 'w' : 'b') ? 0 : 100
  if (chess.isStalemate()) return 50
  if (!evalScore) return null
  const white = winPercent(evalScore)
  return Math.round(userColor === 'white' ? white : 100 - white)
}
