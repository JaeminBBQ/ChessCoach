import { describe, expect, it } from 'vitest'

import type { CoachGame } from './coach'
import type { GameAnalysis, PlyAnalysis } from './game-analysis'
import type { Score } from '../engine/uci'
import { mistakePatterns, patternCounts, patternTakeaway, topPattern } from './patterns'

const cp = (value: number): Score => ({ type: 'cp', value })

// After White plays Ne5 (hanging the knight): Black's d6 pawn captures it.
const HANGING_FEN = 'rnbqkb1r/ppp2ppp/3p1n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 2 4'
// White to move: the bishop on b3 can take the undefended queen on d5.
const FREE_PIECE_FEN = 'rn2kbnr/ppp2ppp/8/3q4/8/1B6/PPPP1PPP/RNBQK1NR w KQkq - 0 1'

let nextId = 1

function coachGame(fields: Partial<CoachGame> = {}): CoachGame {
  return {
    id: nextId++,
    platform: 'lichess',
    playedAt: 1,
    userColor: 'white',
    result: 'loss',
    termination: null,
    speed: 'rapid',
    rated: true,
    userRating: null,
    opponentRating: null,
    opponentName: null,
    accountId: 1,
    pgn: '1. e4 e5 0-1',
    analysis: null,
    ...fields,
  }
}

function ply(ply: number, fen: string, move: { san: string; uci: string } | null, evalCp: number, best: { san: string; uci: string; eval: Score } | null): PlyAnalysis {
  return { ply, fen, move, eval: cp(evalCp), terminal: null, best, second: null, depth: 10 }
}

/**
 * White's move at ply 1 is judged a mistake (50 → 24.9 win %) and Black's
 * best reply captures the hanging knight: motif `hangingPiece`.
 */
function hangingPieceAnalysis(): GameAnalysis {
  return {
    version: 1,
    engine: 'test',
    nodes: 1,
    plies: [
      ply(0, HANGING_FEN, null, 0, { san: 'd4', uci: 'd2d4', eval: cp(0) }),
      ply(1, HANGING_FEN, { san: 'Ne5', uci: 'f3e5' }, -300, { san: 'dxe5', uci: 'd6e5', eval: cp(-300) }),
    ],
  }
}

/** White's move at ply 1 is a mistake, but Black's best reply is a quiet developing move: motif `other`. */
function otherMistakeAnalysis(): GameAnalysis {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  return {
    version: 1,
    engine: 'test',
    nodes: 1,
    plies: [
      ply(0, start, null, 0, { san: 'd4', uci: 'd2d4', eval: cp(0) }),
      ply(1, afterE4, { san: 'e4', uci: 'e2e4' }, -300, { san: 'Nf6', uci: 'g8f6', eval: cp(-300) }),
    ],
  }
}

/**
 * Black's move at ply 4 blunders (their win % drops ~50), and White's reply
 * at ply 5 neither plays nor matches the winning Bxd5: a missed free piece.
 */
function missedFreePieceAnalysis(): GameAnalysis {
  const fen = FREE_PIECE_FEN
  return {
    version: 1,
    engine: 'test',
    nodes: 1,
    plies: [
      ply(0, fen, null, 0, { san: 'Nf3', uci: 'g1f3', eval: cp(0) }),
      ply(1, fen, { san: 'Nf3', uci: 'g1f3' }, 0, { san: 'Nf6', uci: 'g8f6', eval: cp(0) }),
      ply(2, fen, { san: 'Nf6', uci: 'g8f6' }, -300, { san: 'Nc3', uci: 'b1c3', eval: cp(-300) }),
      ply(3, fen, { san: 'Nc3', uci: 'b1c3' }, -300, { san: 'Nc6', uci: 'b8c6', eval: cp(-300) }),
      ply(4, fen, { san: 'b6', uci: 'b7b6' }, 300, { san: 'Bxd5', uci: 'b3d5', eval: cp(400) }),
      ply(5, fen, { san: 'a3', uci: 'a2a3' }, -400, null),
    ],
  }
}

describe('mistakePatterns', () => {
  it('counts mistakes by motif with shares and points per 100 games', () => {
    const g1 = coachGame()
    g1.analysis = hangingPieceAnalysis()
    const g2 = coachGame()
    g2.analysis = hangingPieceAnalysis()
    const breakdown = mistakePatterns([g1, g2, coachGame()])
    expect(breakdown.analyzedGames).toBe(2)
    expect(breakdown.mistakes).toHaveLength(1)
    expect(breakdown.mistakes[0]).toMatchObject({
      motif: 'hangingPiece',
      label: 'Left a piece hanging',
      count: 2,
      share: 1,
    })
    expect(breakdown.mistakes[0].pointsPer100).toBeCloseTo(25.1, 1)
    expect(breakdown.missed).toEqual([])
  })

  it('counts missed chances separately, and a blunder that is a missed chance is not double-counted as a mistake', () => {
    const g = coachGame()
    g.analysis = missedFreePieceAnalysis()
    const breakdown = mistakePatterns([g])
    expect(breakdown.mistakes).toEqual([])
    expect(breakdown.missed).toHaveLength(1)
    expect(breakdown.missed[0]).toMatchObject({ motif: 'missedFreePiece', count: 1, share: 1 })
    // White's reply at ply 5 dropped 75.1 → 18.7 ≈ 56.5 win %.
    expect(breakdown.missed[0].pointsPer100).toBeCloseTo(56.5, 1)
  })

  it('shares split across patterns', () => {
    const hanging = coachGame()
    hanging.analysis = hangingPieceAnalysis()
    const missed = coachGame()
    missed.analysis = missedFreePieceAnalysis()
    const breakdown = mistakePatterns([hanging, hanging, missed])
    expect(breakdown.mistakes[0].share).toBe(1)
    expect(breakdown.mistakes[0].pointsPer100).toBeCloseTo(16.7, 1) // 2 mistakes over 3 analyzed games
    expect(breakdown.missed[0].share).toBe(1)
    expect(breakdown.missed[0].pointsPer100).toBeCloseTo(18.8, 1) // 1 missed over 3 analyzed
  })
})

describe('patternTakeaway', () => {
  it('names the most expensive pattern across both tables', () => {
    const hanging = coachGame()
    hanging.analysis = hangingPieceAnalysis()
    const missed = coachGame()
    missed.analysis = missedFreePieceAnalysis()
    expect(patternTakeaway(mistakePatterns([hanging, missed]))).toBe(
      'Your most expensive pattern is Missed a free piece: 1 missed chances, 28.2 points per 100 games.',
    )
  })

  it('is null when there are no patterns', () => {
    expect(patternTakeaway(mistakePatterns([]))).toBeNull()
  })
})

describe('patternCounts and topPattern', () => {
  it('counts patterns inside a mistakes-* finding by phase', () => {
    const game = coachGame()
    game.analysis = hangingPieceAnalysis() // ply 1 → opening
    expect(patternCounts('mistakes-opening', [game]).get('hangingPiece')).toBe(1)
    expect(patternCounts('mistakes-middlegame', [game]).get('hangingPiece')).toBeUndefined()
  })

  it('counts patterns inside missed-chances', () => {
    const game = coachGame()
    game.analysis = missedFreePieceAnalysis()
    expect(patternCounts('missed-chances', [game]).get('missedFreePiece')).toBe(1)
    expect(patternCounts('mistakes-opening', [game]).size).toBe(0)
  })

  it('returns the top pattern with its Lichess theme, and null without one', () => {
    const game = coachGame()
    game.analysis = hangingPieceAnalysis()
    expect(topPattern('mistakes-opening', [game])).toEqual({
      motif: 'hangingPiece',
      label: 'Left a piece hanging',
      count: 1,
      theme: 'hangingPiece',
      themeUrl: 'https://lichess.org/training/hangingPiece',
    })
    expect(topPattern('mistakes-opening', [])).toBeNull()
  })

  it("never picks 'other', even when it is the most common", () => {
    const quiet = (): CoachGame => coachGame({ analysis: otherMistakeAnalysis() })
    const games = [quiet(), quiet(), coachGame({ analysis: hangingPieceAnalysis() })]
    expect(patternCounts('mistakes-opening', games).get('other')).toBe(2)
    expect(topPattern('mistakes-opening', games)?.motif).toBe('hangingPiece')
    expect(topPattern('mistakes-opening', [quiet()])).toBeNull()
  })
})
