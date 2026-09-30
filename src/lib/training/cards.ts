import type { UserColor } from '../db/schema'
import { classifyMoves, winPercent } from '../analysis/classify'
import type { GameAnalysis } from '../analysis/game-analysis'

export type CardKind = 'missed' | 'blunder'

/** A training puzzle cut from an analyzed game; the user is to move. */
export interface CardDraft {
  gameId: number
  /** The user's move index `i`; the position to solve is `plies[i-1].fen`. */
  ply: number
  kind: CardKind
  fen: string
  solutionUci: string
  solutionSan: string
  /** Win % after the solution, from the user's point of view. */
  solutionWin: number
  /** The user's actual move and the win % after it (user POV). */
  playedSan: string
  playedWin: number
  /** The opponent's move that led to the position, for highlighting. */
  lastMoveUci: string | null
}

export interface CardGateCounts {
  /** User plies that were a missed chance or a mistake/blunder. */
  candidates: number
  skippedEarlyPly: number
  skippedTerminal: number
  skippedMissingEngine: number
  skippedGap: number
  skippedSolutionFloor: number
  accepted: number
}

export function emptyGateCounts(): CardGateCounts {
  return {
    candidates: 0,
    skippedEarlyPly: 0,
    skippedTerminal: 0,
    skippedMissingEngine: 0,
    skippedGap: 0,
    skippedSolutionFloor: 0,
    accepted: 0,
  }
}

/**
 * Builds training cards for one analyzed game. Every candidate ply must pass
 * the fair-puzzle gates: ply > 6 (no opening noise), a non-terminal position,
 * both engine moves present (MultiPV 2), the best move clearly better than
 * the second (≥ 15 win %), and a win % floor after the best move that depends
 * on the kind (blunder ≥ 40, missed ≥ 60). A ply matching the missed-chance
 * rule takes the `missed` kind over `blunder`.
 */
export function buildCards(game: { id: number; userColor: UserColor }, analysis: GameAnalysis): CardDraft[] {
  return buildCardsDetailed(game, analysis).cards
}

/** `buildCards` plus a tally of which gates rejected how many candidates (for reporting). */
export function buildCardsDetailed(
  game: { id: number; userColor: UserColor },
  analysis: GameAnalysis,
): { cards: CardDraft[]; gates: CardGateCounts } {
  const gates = emptyGateCounts()
  const judgements = classifyMoves(analysis)
  const byPly = new Map(judgements.map((j) => [j.ply, j]))
  const toUser = (whiteWin: number) => (game.userColor === 'white' ? whiteWin : 100 - whiteWin)
  const cards: CardDraft[] = []

  for (let i = 1; i < analysis.plies.length; i++) {
    const j = byPly.get(i)
    if (!j || j.color !== game.userColor) continue
    // Same missed-chance rule as the Coach page: the opponent just dropped
    // ≥ 20 win % and the reply neither plays the best move nor punishes it.
    const previous = byPly.get(i - 1)
    const missed = previous !== undefined && previous.drop >= 20 && j.judgement !== 'best' && j.drop >= 10
    const blunder = j.judgement === 'mistake' || j.judgement === 'blunder'
    if (!missed && !blunder) continue
    gates.candidates++

    if (i <= 6) {
      gates.skippedEarlyPly++
      continue
    }
    const before = analysis.plies[i - 1]
    if (before.terminal !== null) {
      gates.skippedTerminal++
      continue
    }
    const best = before.best
    const second = before.second
    if (!best || !second) {
      gates.skippedMissingEngine++
      continue
    }
    const solutionWin = toUser(winPercent(best.eval))
    const secondWin = toUser(winPercent(second.eval))
    if (solutionWin - secondWin < 15) {
      gates.skippedGap++
      continue
    }
    const floor = missed ? 60 : 40
    if (solutionWin < floor) {
      gates.skippedSolutionFloor++
      continue
    }
    gates.accepted++
    cards.push({
      gameId: game.id,
      ply: i,
      kind: missed ? 'missed' : 'blunder',
      fen: before.fen,
      solutionUci: best.uci,
      solutionSan: best.san,
      solutionWin,
      playedSan: j.san,
      playedWin: j.winAfter,
      lastMoveUci: before.move?.uci ?? null,
    })
  }
  return { cards, gates }
}
