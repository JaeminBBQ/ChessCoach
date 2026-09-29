import { Chess } from 'chess.js'

/** The standard starting position in FEN notation. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface MoveInput {
  from: string
  to: string
  /** Promotion piece (n/b/r/q). Defaults to queen. */
  promotion?: string
}

export interface MoveResult {
  fen: string
  san: string
}

/**
 * Tries `move` in the position given by `fen`.
 * Returns the resulting FEN and the SAN of the move, or null if the move is
 * illegal or the FEN is invalid.
 */
export function tryMove(fen: string, move: MoveInput): MoveResult | null {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return null
  }
  try {
    // chess.js 1.x requires promotion on promotion moves and throws on
    // illegal ones, so both are handled by the catch below.
    const result = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
    return { fen: chess.fen(), san: result.san }
  } catch {
    return null
  }
}

/** True when `fen` describes a valid chess position. */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen)
    return true
  } catch {
    return false
  }
}
