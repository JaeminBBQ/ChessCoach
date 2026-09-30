/**
 * Pure helpers for the UCI text protocol. Scores in UCI are from the side to
 * move's point of view; `toWhitePov` converts them.
 */

export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number }

export interface InfoLine {
  depth: number
  multipv: number
  score: Score
  /** True when the score is only a bound (lowerbound/upperbound), not exact. */
  bound: boolean
  nodes: number | null
  pv: string[]
}

/** Parses an `info ... score ... pv ...` line; null for lines without a score or pv (e.g. `info string`, `info currmove`). */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ')) return null
  const tokens = line.trim().split(/\s+/)
  let depth: number | null = null
  let multipv = 1
  let score: Score | null = null
  let bound = false
  let nodes: number | null = null
  let pv: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[++i])
        break
      case 'multipv':
        multipv = Number(tokens[++i])
        break
      case 'nodes':
        nodes = Number(tokens[++i])
        break
      case 'score': {
        const kind = tokens[++i]
        const value = Number(tokens[++i])
        if (kind === 'cp' || kind === 'mate') score = { type: kind, value }
        if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
          bound = true
          i++
        }
        break
      }
      case 'pv':
        pv = tokens.slice(i + 1)
        i = tokens.length
        break
      case 'string':
        return null
    }
  }
  if (depth === null || score === null || pv.length === 0) return null
  return { depth, multipv, score, bound, nodes, pv }
}

/** The move from `bestmove e2e4 ponder e7e5`; null for other lines. `(none)` means no legal move. */
export function parseBestMove(line: string): { move: string | null } | null {
  const m = /^bestmove\s+(\S+)/.exec(line)
  if (!m) return null
  return { move: m[1] === '(none)' ? null : m[1] }
}

/** Converts a side-to-move score to White's point of view. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  return sideToMove === 'w' ? score : { type: score.type, value: -score.value }
}

/** Human-readable score: `+1.59`, `-0.30`, `0.00`, `#3` (White mates in 3), `#-2` (Black mates in 2). */
export function formatScore(score: Score): string {
  if (score.type === 'mate') return `#${score.value}`
  const pawns = score.value / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}
