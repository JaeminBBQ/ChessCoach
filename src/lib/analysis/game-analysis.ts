import { Chess } from 'chess.js'

import type { AnalysisEngine } from '../engine/uci-engine'
import { toWhitePov, type Score } from '../engine/uci'

export const ANALYSIS_VERSION = 1

export interface EngineMove {
  uci: string
  san: string
  /** Evaluation after playing this move, White's point of view. */
  eval: Score
  /**
   * The engine's principal variation starting with this move (UCI, up to
   * PV_LENGTH plies). Optional: analyses made before 2026-09-30 don't have it.
   */
  pv?: string[]
}

/** Plies of each principal variation kept in stored analyses (for motif detection). */
export const PV_LENGTH = 12

export interface PlyAnalysis {
  /** 0 = start position; n = the position after the n-th half-move. */
  ply: number
  fen: string
  /** The move that led to this position (null at ply 0). */
  move: { san: string; uci: string } | null
  /** Evaluation of this position, White's point of view (null when terminal). */
  eval: Score | null
  /** Set when the game is over in this position; no engine search is done. */
  terminal: 'checkmate' | 'stalemate' | 'draw' | null
  /** Engine's best and second-best moves from this position (null when terminal or no alternative). */
  best: EngineMove | null
  second: EngineMove | null
  depth: number
}

export interface GameAnalysis {
  version: number
  engine: string
  nodes: number
  plies: PlyAnalysis[]
}

export interface AnalyzeOptions {
  engineId: string
  nodes: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface ReplayedPosition {
  fen: string
  move: { san: string; uci: string } | null
}

/** Replays a PGN into the start position plus the position after every half-move. Throws on unreadable PGN. */
export function replayPgn(pgn: string): ReplayedPosition[] {
  const chess = new Chess()
  chess.loadPgn(pgn)
  const history = chess.history({ verbose: true })
  const positions: ReplayedPosition[] = [{ fen: history[0]?.before ?? chess.fen(), move: null }]
  for (const m of history) positions.push({ fen: m.after, move: { san: m.san, uci: m.lan } })
  return positions
}

/** Runs the engine over every position of the game. Positions are searched one at a time. */
export async function analyzeGame(pgn: string, engine: AnalysisEngine, opts: AnalyzeOptions): Promise<GameAnalysis> {
  const positions = replayPgn(pgn)
  const plies: PlyAnalysis[] = []
  for (let i = 0; i < positions.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('analysis aborted', 'AbortError')
    plies.push(await analyzePosition(i, positions[i], engine, opts.nodes))
    opts.onProgress?.(i + 1, positions.length)
  }
  return { version: ANALYSIS_VERSION, engine: opts.engineId, nodes: opts.nodes, plies }
}

async function analyzePosition(
  ply: number,
  position: ReplayedPosition,
  engine: AnalysisEngine,
  nodes: number,
): Promise<PlyAnalysis> {
  const chess = new Chess(position.fen)
  const base = { ply, fen: position.fen, move: position.move }
  const terminal = chess.isCheckmate()
    ? 'checkmate'
    : chess.isStalemate()
      ? 'stalemate'
      : chess.isDraw()
        ? 'draw'
        : null
  // Checkmate/stalemate have no moves to search. Other draws (repetition,
  // 50-move, insufficient material) still get an eval for context.
  if (terminal === 'checkmate' || terminal === 'stalemate') {
    return { ...base, eval: null, terminal, best: null, second: null, depth: 0 }
  }

  const side = chess.turn()
  const lines = await engine.analyze(position.fen, { nodes, multiPv: 2 })
  const toMove = (line: (typeof lines)[number] | undefined): EngineMove | null => {
    if (!line) return null
    const uci = line.pv[0]
    return { uci, san: uciToSan(position.fen, uci), eval: toWhitePov(line.score, side), pv: line.pv.slice(0, PV_LENGTH) }
  }
  const best = toMove(lines[0])
  return {
    ...base,
    eval: best?.eval ?? null,
    terminal,
    best,
    second: toMove(lines[1]),
    depth: lines[0]?.depth ?? 0,
  }
}

function uciToSan(fen: string, uci: string): string {
  const chess = new Chess(fen)
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
}

/**
 * The ply a review deep link (`?ply=N`) should open at: the value parsed and
 * clamped to 0..lastPly, or 0 when it is absent, not an integer, or out of range.
 */
export function parsePly(value: string | string[] | undefined, lastPly: number): number {
  if (typeof value !== 'string') return 0
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > lastPly) return 0
  return n
}

/**
 * Checks that an analysis (e.g. posted by a browser) matches the game: same
 * positions in the same order, the right shape, and a known version.
 * Returns an error message, or null when valid.
 */
export function validateAnalysis(analysis: unknown, pgn: string): string | null {
  if (typeof analysis !== 'object' || analysis === null) return 'analysis must be an object'
  const a = analysis as Partial<GameAnalysis>
  if (a.version !== ANALYSIS_VERSION) return `unsupported analysis version ${String(a.version)}`
  if (typeof a.engine !== 'string' || typeof a.nodes !== 'number') return 'missing engine or nodes'
  if (!Array.isArray(a.plies)) return 'missing plies'
  const positions = replayPgn(pgn)
  if (a.plies.length !== positions.length) return `expected ${positions.length} plies, got ${a.plies.length}`
  for (let i = 0; i < positions.length; i++) {
    const p = a.plies[i] as Partial<PlyAnalysis> | undefined
    if (!p || p.ply !== i || p.fen !== positions[i].fen) return `ply ${i} does not match the game`
    if (p.terminal !== 'checkmate' && p.terminal !== 'stalemate' && !isScore(p.eval)) return `ply ${i} has no eval`
  }
  return null
}

function isScore(s: unknown): s is Score {
  if (typeof s !== 'object' || s === null) return false
  const v = s as { type?: unknown; value?: unknown }
  return (v.type === 'cp' || v.type === 'mate') && typeof v.value === 'number' && Number.isFinite(v.value)
}
