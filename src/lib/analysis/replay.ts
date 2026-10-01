import { Chess } from 'chess.js'

import { positionWin, winPercent } from './classify'
import { replayPgn, type GameAnalysis } from './game-analysis'

export interface ReplayStep {
  ply: number
  fen: string
  /** The move that led to this position; null at ply 0. */
  san: string | null
  uci: string | null
  /** The user's win % in this position, rounded; null without an analysis or eval. */
  win: number | null
}

export interface ReplayData {
  gameId: number
  /** The example's ply p (the position after the move the example is about). */
  ply: number
  userColor: 'white' | 'black'
  label: string
  /** The game window, in order: 4 plies of lead-up, the decision position, the played move, 6 more. */
  game: ReplayStep[]
  /** Index in `game` of the decision position (ply p − 1, or ply 0 for p = 0). */
  decisionIndex: number
  /** The engine's line from the decision position, or null when there is nothing to contrast. */
  engine: { steps: ReplayStep[]; bestSan: string; bestWin: number | null } | null
}

/** How many plies of lead-up the window shows before the decision position. */
const LEAD_UP = 4
/** How many plies after the played move the window shows. */
const FOLLOW = 6
/** How many plies of the engine's principal variation to replay. */
const PV_CAP = 12

/**
 * The inline-replay data for one Coach example at ply `p`: the decision
 * position is `p − 1` (or ply 0 when `p = 0`), the played move is
 * `positions[p].move`, and the best move is `analysis.plies[p − 1].best`.
 * Returns null when the PGN can't be read; never throws.
 */
export function replayWindow(
  game: { id: number; pgn: string; userColor: 'white' | 'black'; analysis: GameAnalysis | null },
  example: { ply: number; label: string },
): ReplayData | null {
  let positions
  try {
    positions = replayPgn(game.pgn)
  } catch {
    return null
  }
  if (positions.length === 0) return null

  const last = positions.length - 1
  const p = Math.max(0, Math.min(example.ply, last))
  const from = Math.max(0, p - 1 - LEAD_UP)
  const to = Math.min(last, p + FOLLOW)

  const window: ReplayStep[] = []
  for (let ply = from; ply <= to; ply++) {
    window.push({
      ply,
      fen: positions[ply].fen,
      san: positions[ply].move?.san ?? null,
      uci: positions[ply].move?.uci ?? null,
      win: winAt(game.analysis, ply, game.userColor),
    })
  }

  const engine = engineLine(game.analysis, positions, p, game.userColor)
  // For p = 0 the decision position is ply 0 itself.
  const decisionPly = Math.max(0, p - 1)
  return { gameId: game.id, ply: p, userColor: game.userColor, label: example.label, game: window, decisionIndex: decisionPly - from, engine }
}

/** The user's win % (0–100, rounded) at a ply of the stored analysis; null without one. */
function winAt(
  analysis: GameAnalysis | null,
  ply: number,
  userColor: 'white' | 'black',
): number | null {
  if (analysis === null || analysis.plies[ply] === undefined) return null
  const white = positionWin(analysis.plies[ply])
  if (white === null) return null
  return Math.round(userColor === 'white' ? white : 100 - white)
}

/**
 * The engine's line from the decision position: the position itself, then
 * `best.pv` (up to 12 plies; `[best.uci]` when the pv is missing). Null when
 * there's no analysis, no best move, or the best move equals the played one.
 */
function engineLine(
  analysis: GameAnalysis | null,
  positions: { fen: string; move: { san: string; uci: string } | null }[],
  p: number,
  userColor: 'white' | 'black',
): ReplayData['engine'] {
  if (analysis === null || p === 0) return null
  const best = analysis.plies[p - 1]?.best
  if (!best) return null
  const played = positions[p].move?.uci ?? null
  if (played === best.uci) return null

  const decisionPly = p - 1
  const steps: ReplayStep[] = [{ ply: decisionPly, fen: positions[decisionPly].fen, san: null, uci: null, win: null }]
  const pv = best.pv ?? [best.uci]
  const chess = new Chess(positions[decisionPly].fen)
  for (let i = 0; i < Math.min(pv.length, PV_CAP); i++) {
    let move
    try {
      move = chess.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] })
    } catch {
      break // defensive: the pv should always be legal from the stored position
    }
    steps.push({ ply: decisionPly + i + 1, fen: chess.fen(), san: move.san, uci: pv[i], win: null })
  }
  const bestWin = Math.round(userColor === 'white' ? winPercent(best.eval) : 100 - winPercent(best.eval))
  return { steps, bestSan: best.san, bestWin }
}
