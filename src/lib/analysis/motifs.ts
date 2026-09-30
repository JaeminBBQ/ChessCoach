import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

import type { EngineMove, GameAnalysis } from './game-analysis'

/**
 * Tactical pattern behind a user's mistake or missed chance, read from the
 * engine's best move and board geometry (no extra search):
 * - for a mistake at ply i: what the opponent's best reply (plies[i].best) does
 * - for a missed chance at ply i: what the user's best move (plies[i-1].best) would have done
 */
export type Motif =
  | 'allowedMate' // the reply mates by force
  | 'hangingPiece' // the reply wins a piece that was undefended or attacked by a cheaper piece
  | 'fork' // the reply attacks two or more valuable targets at once
  | 'missedMate' // the user had a forced mate
  | 'missedFreePiece' // the user could win an undefended/underdefended piece
  | 'missedFork' // the user had a fork
  | 'lostMaterial' // the reply starts a sequence (engine line) that wins material
  | 'missedMaterial' // the user's best move started a sequence that wins material
  | 'kingAttack' // the reply starts an attack on the user's king (2+ checks in the engine line)
  | 'missedKingAttack' // the user had an attack on the enemy king (2+ checks in the engine line)
  | 'other' // positional or deeper tactics (not recognized by these simple rules)

export interface MotifTag {
  motif: Motif
  /** Forced mate length for the mate motifs. */
  mateIn?: number
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

/** Net material (pawns) the engine line must win to count as a combination. */
const MATERIAL_THRESHOLD = 2

/** How many plies of the engine line to follow when counting material or checks. */
const PV_WINDOW = 8

/** Checks by the attacking side within PV_WINDOW plies that make a line a king attack. */
const KING_ATTACK_CHECKS = 2

/** Motif of the user's mistake at ply `i` (the user's move led to `plies[i]`). */
export function mistakeMotif(a: GameAnalysis, i: number): MotifTag {
  const after = a.plies[i]
  const reply = after?.best
  if (!after || !reply) return { motif: 'other' }
  const opponent = sideToMove(after.fen)
  const mate = mateFor(reply, opponent)
  if (mate) return { motif: 'allowedMate', mateIn: mate }
  if (winsPiece(after.fen, reply.uci)) return { motif: 'hangingPiece' }
  if (isFork(after.fen, reply.uci)) return { motif: 'fork' }
  if ((materialGain(after.fen, reply.pv) ?? 0) >= MATERIAL_THRESHOLD) return { motif: 'lostMaterial' }
  if (checksBy(after.fen, reply.pv) >= KING_ATTACK_CHECKS) return { motif: 'kingAttack' }
  return { motif: 'other' }
}

/** Motif of the chance the user missed at ply `i` (the user was to move in `plies[i-1]`). */
export function missedMotif(a: GameAnalysis, i: number): MotifTag {
  const before = a.plies[i - 1]
  const best = before?.best
  if (!before || !best) return { motif: 'other' }
  const user = sideToMove(before.fen)
  const mate = mateFor(best, user)
  if (mate) return { motif: 'missedMate', mateIn: mate }
  if (winsPiece(before.fen, best.uci)) return { motif: 'missedFreePiece' }
  if (isFork(before.fen, best.uci)) return { motif: 'missedFork' }
  if ((materialGain(before.fen, best.pv) ?? 0) >= MATERIAL_THRESHOLD) return { motif: 'missedMaterial' }
  if (checksBy(before.fen, best.pv) >= KING_ATTACK_CHECKS) return { motif: 'missedKingAttack' }
  return { motif: 'other' }
}

/** Lichess puzzle theme to practice a motif (https://lichess.org/training/themes), or null. */
export function lichessTheme(tag: MotifTag): string | null {
  switch (tag.motif) {
    case 'allowedMate':
    case 'missedMate':
      return tag.mateIn && tag.mateIn <= 3 ? `mateIn${tag.mateIn}` : 'mate'
    case 'hangingPiece':
    case 'missedFreePiece':
      return 'hangingPiece'
    case 'fork':
    case 'missedFork':
      return 'fork'
    case 'lostMaterial':
    case 'missedMaterial':
      return 'advantage'
    case 'kingAttack':
    case 'missedKingAttack':
      return 'exposedKing'
    default:
      return null
  }
}

export function lichessThemeUrl(tag: MotifTag): string | null {
  const theme = lichessTheme(tag)
  return theme ? `https://lichess.org/training/${theme}` : null
}

export const MOTIF_LABEL: Record<Motif, string> = {
  allowedMate: 'Allowed a mate',
  hangingPiece: 'Left a piece hanging',
  fork: 'Walked into a fork',
  missedMate: 'Missed a mate',
  missedFreePiece: 'Missed a free piece',
  missedFork: 'Missed a fork',
  lostMaterial: 'Lost material to a combination',
  missedMaterial: 'Missed a combination that wins material',
  kingAttack: 'Let their pieces attack your king',
  missedKingAttack: 'Missed an attack on their king',
  other: 'Other (positional or deeper tactic)',
}

function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** Mate length if `move`'s line mates in favour of `side` (EngineMove evals are White POV). */
function mateFor(move: EngineMove, side: Color): number | null {
  if (move.eval.type !== 'mate') return null
  const v = move.eval.value
  const favoursSide = side === 'w' ? v > 0 : v < 0
  return favoursSide && v !== 0 ? Math.abs(v) : null
}

/**
 * True when `uci` captures a knight, bishop, rook or queen that is either
 * undefended or worth more than the capturing piece.
 */
function winsPiece(fen: string, uci: string): boolean {
  const chess = new Chess(fen)
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const mover = chess.get(from)
  const target = chess.get(to)
  if (!mover || !target || target.color === mover.color || VALUE[target.type] < 3) return false
  const defended = chess.isAttacked(to, target.color)
  return !defended || VALUE[target.type] > VALUE[mover.type]
}

/**
 * True when, after `uci`, the moved piece attacks at least two enemy targets
 * worth caring about: the king, or a piece (N+) that is undefended or worth
 * more than the attacker.
 */
function isFork(fen: string, uci: string): boolean {
  const chess = new Chess(fen)
  const moved = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  const attacker = chess.get(moved.to as Square)
  if (!attacker) return false
  const enemy: Color = attacker.color === 'w' ? 'b' : 'w'
  let targets = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy || VALUE[cell.type] < 3) continue
      if (!chess.attackers(cell.square, attacker.color).includes(moved.to as Square)) continue
      const valuable = cell.type === 'k' || !chess.isAttacked(cell.square, enemy) || VALUE[cell.type] > VALUE[attacker.type]
      if (valuable) targets++
    }
  }
  return targets >= 2
}

/** Material of `side` minus the opponent's, in pawns (kings excluded). */
function balance(chess: Chess, side: Color): number {
  let total = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue
      total += cell.color === side ? VALUE[cell.type] : -VALUE[cell.type]
    }
  }
  return total
}

/**
 * Net material won by the side to move along the engine line, measured at the
 * first quiet point (at least two plies in, not in check, and the next line
 * move is not a capture) within PV_WINDOW plies, else at the window's end.
 * Null when there is no usable line (analyses made before lines were stored).
 */
export function materialGain(fen: string, pv: string[] | undefined): number | null {
  if (!pv || pv.length < 2) return null
  const chess = new Chess(fen)
  const side = chess.turn()
  const start = balance(chess, side)
  let current = start
  const steps = Math.min(pv.length, PV_WINDOW)
  for (let k = 0; k < steps; k++) {
    const uci = pv[k]
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    current = balance(chess, side)
    const next = pv[k + 1]
    const nextCaptures = next !== undefined && chess.get(next.slice(2, 4) as Square) !== undefined
    if (k >= 1 && !chess.inCheck() && !nextCaptures) break
  }
  return current - start
}

/** Checks given by the side to move (the line's owner) within PV_WINDOW plies of the engine line. */
export function checksBy(fen: string, pv: string[] | undefined): number {
  if (!pv) return 0
  const chess = new Chess(fen)
  let checks = 0
  for (let k = 0; k < Math.min(pv.length, PV_WINDOW); k++) {
    const uci = pv[k]
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    if (k % 2 === 0 && chess.inCheck()) checks++
  }
  return checks
}
