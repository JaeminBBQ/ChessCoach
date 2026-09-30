import type { GameAnalysis, PlyAnalysis } from './game-analysis'
import type { Score } from '../engine/uci'

export type Judgement = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

/** One entry per ply i = 1..n: the move that led to the position after i half-moves. */
export interface MoveJudgement {
  ply: number
  /** Who made move i (odd ply = White). */
  color: 'white' | 'black'
  san: string
  uci: string
  /** Mover's win % before the move (0–100). */
  winBefore: number
  /** Mover's win % after the move (0–100). */
  winAfter: number
  /** max(0, winBefore - winAfter). */
  drop: number
  judgement: Judgement
  /** Engine's best move in the position before the move (null when none was stored). */
  bestSan: string | null
  /** Mover's win % after the engine's best move (null when none). */
  bestWinAfter: number | null
  /** Lichess move accuracy formula, 0–100. */
  accuracy: number
}

/**
 * Lichess win% for White. The fixed formula the whole module uses — evals are
 * converted to winning chances before anything is judged, so a swing from
 * -9 to -25 pawns is not a mistake.
 */
export function winPercent(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** White's win % for the position, or null when it cannot be computed. */
export function positionWin(p: PlyAnalysis): number | null {
  if (p.terminal === 'checkmate') {
    // The side to move is mated: White wins 0% when White is to move, 100% otherwise.
    return p.fen.split(' ')[1] === 'w' ? 0 : 100
  }
  if (p.terminal === 'stalemate') return 50
  return p.eval ? winPercent(p.eval) : null
}

/** One judgement per half-move; plies where either win % is null are skipped. */
export function classifyMoves(a: GameAnalysis): MoveJudgement[] {
  const out: MoveJudgement[] = []
  for (let ply = 1; ply < a.plies.length; ply++) {
    const before = positionWin(a.plies[ply - 1])
    const after = positionWin(a.plies[ply])
    if (before === null || after === null) continue
    const move = a.plies[ply].move
    if (!move) continue
    const color: 'white' | 'black' = ply % 2 === 1 ? 'white' : 'black'
    const toMover = (whiteWin: number) => (color === 'white' ? whiteWin : 100 - whiteWin)
    const winBefore = toMover(before)
    const winAfter = toMover(after)
    const drop = Math.max(0, winBefore - winAfter)
    const best = a.plies[ply - 1].best
    out.push({
      ply,
      color,
      san: move.san,
      uci: move.uci,
      winBefore,
      winAfter,
      drop,
      judgement: judgeDrop(drop, winBefore, winAfter, best !== null && move.uci === best.uci),
      bestSan: best?.san ?? null,
      bestWinAfter: best ? toMover(winPercent(best.eval)) : null,
      accuracy: moveAccuracy(drop),
    })
  }
  return out
}

/**
 * The fixed judgement bands: `best` when the engine's move was played, then
 * by drop: ≥30 blunder, ≥20 mistake, ≥10 inaccuracy, else good. A move is
 * never labelled worse than good when the mover was already lost
 * (winBefore < 10) or is still totally winning (winAfter > 90). Exported so
 * the thresholds and exceptions can be tested with exact numbers — real evals
 * cannot produce every combination (drop ≥ 10 already implies winBefore ≥ 10
 * and winAfter ≤ 90).
 */
export function judgeDrop(drop: number, winBefore: number, winAfter: number, playedBest: boolean): Judgement {
  if (playedBest) return 'best'
  if (winBefore < 10 || winAfter > 90) return 'good'
  if (drop >= 30) return 'blunder'
  if (drop >= 20) return 'mistake'
  if (drop >= 10) return 'inaccuracy'
  return 'good'
}

/** Lichess move accuracy formula, clamped to 0–100. */
export function moveAccuracy(drop: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669))
}

export interface GameSummary {
  /** Mean of that side's move accuracies, rounded to 1 decimal. */
  accuracy: number
  best: number
  good: number
  inaccuracies: number
  mistakes: number
  blunders: number
}

/** Judgement → summary counter key (the keys pluralize inaccuracy and blunder). */
const COUNTER_KEYS = {
  best: 'best',
  good: 'good',
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  blunder: 'blunders',
} as const

export function gameSummary(judgements: readonly MoveJudgement[], color: 'white' | 'black'): GameSummary {
  const side = judgements.filter((j) => j.color === color)
  const total = side.reduce((sum, j) => sum + j.accuracy, 0)
  const summary: GameSummary = { accuracy: 0, best: 0, good: 0, inaccuracies: 0, mistakes: 0, blunders: 0 }
  if (side.length > 0) summary.accuracy = Math.round((total / side.length) * 10) / 10
  for (const j of side) summary[COUNTER_KEYS[j.judgement]]++
  return summary
}

export interface KeyMoment {
  ply: number
  kind: 'blunder' | 'mistake' | 'missed'
  drop: number
  san: string
  bestSan: string | null
  winBefore: number
  winAfter: number
}

/**
 * The moments that decided the game for `userColor`: the n biggest user
 * mistakes/blunders, plus missed chances — plies where the opponent's previous
 * move dropped ≥ 20 win % and the user neither played the best move nor
 * punished it (their own drop ≥ 10). Sorted by ply.
 */
export function keyMoments(judgements: readonly MoveJudgement[], userColor: 'white' | 'black', n = 3): KeyMoment[] {
  const byPly = new Map(judgements.map((j) => [j.ply, j]))
  const toMoment = (j: MoveJudgement, kind: KeyMoment['kind']): KeyMoment => ({
    ply: j.ply,
    kind,
    drop: j.drop,
    san: j.san,
    bestSan: j.bestSan,
    winBefore: j.winBefore,
    winAfter: j.winAfter,
  })

  const userMistakes = judgements
    .filter((j) => j.color === userColor && (j.judgement === 'mistake' || j.judgement === 'blunder'))
    .sort((a, b) => b.drop - a.drop)
    .slice(0, n)
    .map((j) => toMoment(j, j.judgement === 'blunder' ? 'blunder' : 'mistake'))

  const missed = judgements
    .filter((j) => {
      if (j.color !== userColor) return false
      const previous = byPly.get(j.ply - 1)
      return previous !== undefined && previous.drop >= 20 && j.judgement !== 'best' && j.drop >= 10
    })
    .map((j) => toMoment(j, 'missed'))

  // A ply can qualify as both; keep the mistake/blunder entry for those.
  const moments = new Map<number, KeyMoment>()
  for (const m of userMistakes) moments.set(m.ply, m)
  for (const m of missed) if (!moments.has(m.ply)) moments.set(m.ply, m)
  return [...moments.values()].sort((a, b) => a.ply - b.ply)
}

/** White win % per ply for the graph; null wins are carried forward from the previous point. */
export function evalSeries(a: GameAnalysis): { ply: number; whiteWin: number | null }[] {
  let last: number | null = null
  return a.plies.map((p) => {
    const w = positionWin(p)
    if (w !== null) last = w
    return { ply: p.ply, whiteWin: w ?? last }
  })
}
