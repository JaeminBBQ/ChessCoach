import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNodeEngine } from '../engine/node'
import type { UciEngine } from '../engine/uci-engine'
import type { Score } from '../engine/uci'
import { analyzeGame, type EngineMove, type GameAnalysis, type PlyAnalysis } from './game-analysis'
import {
  classifyMoves,
  evalSeries,
  gameSummary,
  judgeDrop,
  keyMoments,
  positionWin,
  winPercent,
  type MoveJudgement,
} from './classify'

const SCHOLARS_MATE = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'

// Real Stockfish (the vendored WASM build) through the Node transport.
let engine: UciEngine
beforeAll(async () => {
  engine = await createNodeEngine()
})
afterAll(() => engine.close())

const cp = (value: number): Score => ({ type: 'cp', value })
const K = 0.00368208

/** cp value whose winPercent is exactly `w` (White POV), up to float rounding. */
function cpForWin(w: number): number {
  return -Math.log(100 / w - 1) / K
}

/** An eval with the given White win %: 0 and 100 use mate scores (exact). */
function scoreForWin(w: number): Score {
  if (w === 0) return { type: 'mate', value: -1 }
  if (w === 100) return { type: 'mate', value: 1 }
  return cp(cpForWin(w))
}

function plyAnalysis(
  ply: number,
  opts: {
    fen?: string
    move?: { san: string; uci: string } | null
    evalWin?: number | null
    terminal?: PlyAnalysis['terminal']
    best?: EngineMove | null
  } = {},
): PlyAnalysis {
  return {
    ply,
    fen: opts.fen ?? `fen-${ply} w - - 0 1`,
    move: opts.move === undefined ? (ply === 0 ? null : { san: 'x', uci: `a1a${ply}` }) : opts.move,
    eval: opts.evalWin === undefined ? cp(0) : opts.evalWin === null ? null : scoreForWin(opts.evalWin),
    terminal: opts.terminal ?? null,
    best: opts.best === undefined ? null : opts.best,
    second: null,
    depth: 10,
  }
}

/** Analysis of a single White move from `winBefore` to `winAfter` (White POV). */
function whiteMoveAnalysis(winBefore: number, winAfter: number, moveUci = 'a1a1', bestUci = 'z9z9'): GameAnalysis {
  return {
    version: 1,
    engine: 'test',
    nodes: 1,
    plies: [
      plyAnalysis(0, { evalWin: winBefore, best: { uci: bestUci, san: 'B', eval: cp(0) } }),
      plyAnalysis(1, { move: { san: 'M', uci: moveUci }, evalWin: winAfter }),
    ],
  }
}

/** Analysis of White's first move plus one Black move from `winBefore` to `winAfter` (White POV). */
function blackMoveAnalysis(whiteWinBefore: number, whiteWinAfter: number): GameAnalysis {
  return {
    version: 1,
    engine: 'test',
    nodes: 1,
    plies: [
      plyAnalysis(0, { evalWin: 50 }),
      plyAnalysis(1, { move: { san: 'W', uci: 'a1a1' }, evalWin: whiteWinBefore, best: { uci: 'z9z9', san: 'B', eval: cp(0) } }),
      plyAnalysis(2, { move: { san: 'M', uci: 'a1a2' }, evalWin: whiteWinAfter }),
    ],
  }
}

function judgement(overrides: Partial<MoveJudgement>): MoveJudgement {
  return {
    ply: 1,
    color: 'white',
    san: 'e4',
    uci: 'e2e4',
    winBefore: 60,
    winAfter: 40,
    drop: 20,
    judgement: 'mistake',
    bestSan: 'd4',
    bestWinAfter: 59,
    accuracy: 40,
    ...overrides,
  }
}

describe('winPercent', () => {
  it('maps the reference centipawn values', () => {
    expect(winPercent(cp(0))).toBe(50)
    expect(winPercent(cp(100))).toBeCloseTo(59.1, 1)
    expect(winPercent(cp(-300))).toBeCloseTo(24.9, 1)
  })

  it('clamps centipawns to ±1000', () => {
    expect(winPercent(cp(5000))).toBe(winPercent(cp(1000)))
    expect(winPercent(cp(-5000))).toBe(winPercent(cp(-1000)))
  })

  it('maps mate scores to 100 or 0', () => {
    expect(winPercent({ type: 'mate', value: 3 })).toBe(100)
    expect(winPercent({ type: 'mate', value: -2 })).toBe(0)
  })
})

describe('positionWin', () => {
  it('reads the mated side from the FEN', () => {
    const matedWhite = plyAnalysis(9, { fen: '8/8/8/8/8/5k2/5q2/7K w - - 0 1', terminal: 'checkmate' })
    const matedBlack = plyAnalysis(9, { fen: '8/8/8/8/8/5k2/5q2/7K b - - 0 1', terminal: 'checkmate' })
    expect(positionWin(matedWhite)).toBe(0)
    expect(positionWin(matedBlack)).toBe(100)
  })

  it('gives 50 for stalemate and null when the eval is missing', () => {
    expect(positionWin(plyAnalysis(9, { terminal: 'stalemate', evalWin: null }))).toBe(50)
    expect(positionWin(plyAnalysis(9, { evalWin: null, terminal: null }))).toBeNull()
  })
})

describe('judgeDrop', () => {
  it('labels the band thresholds exactly: 9.99 good, 10 inaccuracy, 20 mistake, 30 blunder', () => {
    expect(judgeDrop(9.99, 60, 50.01, false)).toBe('good')
    expect(judgeDrop(10, 60, 50, false)).toBe('inaccuracy')
    expect(judgeDrop(20, 60, 40, false)).toBe('mistake')
    expect(judgeDrop(30, 60, 30, false)).toBe('blunder')
  })

  it('marks the engine move as best regardless of drop', () => {
    expect(judgeDrop(40, 90, 50, true)).toBe('best')
  })

  it('never labels a move worse than good when already lost or still totally winning', () => {
    expect(judgeDrop(30, 9, 0, false)).toBe('good') // winBefore < 10
    expect(judgeDrop(30, 100, 95, false)).toBe('good') // winAfter > 90
  })
})

describe('classifyMoves', () => {
  it('places drops on either side of each band (float-safe margins)', () => {
    // Win after is 50 (exact); win before is chosen so the drop lands near each threshold.
    const cases: Array<[number, MoveJudgement['judgement']]> = [
      [59.99, 'good'], // drop 9.99
      [60.001, 'inaccuracy'], // drop 10.001
      [69.999, 'inaccuracy'], // drop 19.999
      [70.001, 'mistake'], // drop 20.001
      [79.999, 'mistake'], // drop 29.999
      [80.001, 'blunder'], // drop 30.001
    ]
    for (const [winBefore, expected] of cases) {
      const [move] = classifyMoves(whiteMoveAnalysis(winBefore, 50))
      expect(move.judgement).toBe(expected)
      expect(move.drop).toBeCloseTo(winBefore - 50, 5)
    }
  })

  it('overrides the bands when the played move is the engine best', () => {
    const [move] = classifyMoves(whiteMoveAnalysis(90, 50, 'a1a1', 'a1a1'))
    expect(move.judgement).toBe('best')
    expect(move.bestSan).toBe('B')
  })

  it('reports bestSan and the mover-POV win after the engine move', () => {
    const [move] = classifyMoves(whiteMoveAnalysis(60, 40))
    expect(move.bestSan).toBe('B')
    expect(move.bestWinAfter).toBe(50)
  })

  it('converts Black\'s numbers to the mover\'s point of view', () => {
    const [white, black] = classifyMoves(blackMoveAnalysis(50, 70.5))
    expect(white.color).toBe('white')
    expect(black).toMatchObject({
      ply: 2,
      color: 'black',
      winBefore: 50,
      winAfter: 29.5,
      drop: 20.5,
      judgement: 'mistake',
    })
  })

  it('does not punish moves in already-lost or totally-won positions', () => {
    const [lost] = classifyMoves(whiteMoveAnalysis(8, 0)) // drop 8, but also winBefore < 10
    expect(lost.judgement).toBe('good')
    const [won] = classifyMoves(whiteMoveAnalysis(100, 95)) // winAfter > 90
    expect(won.judgement).toBe('good')
  })

  it('scores terminal positions via the FEN side to move', () => {
    const analysis: GameAnalysis = {
      version: 1,
      engine: 'test',
      nodes: 1,
      plies: [
        plyAnalysis(0, { evalWin: 50 }),
        plyAnalysis(1, { move: { san: 'W', uci: 'a1a2' }, evalWin: 50 }),
        plyAnalysis(2, {
          move: { san: 'Qf2#', uci: 'a2a3' },
          evalWin: null,
          terminal: 'checkmate',
          fen: '8/8/8/8/8/5k2/5q2/7K b - - 0 1',
        }),
      ],
    }
    const [whiteMove, blackMove] = classifyMoves(analysis)
    expect(whiteMove.judgement).toBe('good') // 50 → 50
    expect(blackMove).toMatchObject({ winAfter: 0, drop: 50, judgement: 'blunder' })
  })

  it('gives 50 for stalemate', () => {
    const analysis: GameAnalysis = {
      version: 1,
      engine: 'test',
      nodes: 1,
      plies: [
        plyAnalysis(0, { evalWin: 60 }),
        plyAnalysis(1, { move: { san: 'x', uci: 'a1a2' }, evalWin: null, terminal: 'stalemate' }),
      ],
    }
    const [move] = classifyMoves(analysis)
    expect(move.winAfter).toBe(50)
    expect(move.judgement).toBe('inaccuracy')
  })

  it('skips plies where either win % is null', () => {
    const analysis: GameAnalysis = {
      version: 1,
      engine: 'test',
      nodes: 1,
      plies: [
        plyAnalysis(0, { evalWin: 50 }),
        plyAnalysis(1, { move: { san: 'x', uci: 'a1a2' }, evalWin: null, terminal: null }),
      ],
    }
    expect(classifyMoves(analysis)).toEqual([])
  })

  it('computes the Lichess accuracy formula', () => {
    const [perfect] = classifyMoves(whiteMoveAnalysis(50, 50, 'a1a1', 'a1a1'))
    expect(perfect.accuracy).toBeCloseTo(100, 3)
    const [mistake] = classifyMoves(whiteMoveAnalysis(70.5, 50))
    expect(mistake.accuracy).toBeCloseTo(103.1668 * Math.exp(-0.04354 * mistake.drop) - 3.1669, 5)
  })
})

describe('gameSummary', () => {
  const summary = gameSummary(
    [
      judgement({ ply: 1, accuracy: 100, judgement: 'best' }),
      judgement({ ply: 3, accuracy: 40, judgement: 'mistake' }),
      judgement({ ply: 5, accuracy: 85, judgement: 'good' }),
      judgement({ ply: 7, accuracy: 60, judgement: 'inaccuracy' }),
      judgement({ ply: 9, accuracy: 30, judgement: 'blunder' }),
      judgement({ ply: 2, color: 'black', accuracy: 1, judgement: 'blunder' }),
    ],
    'white',
  )
  it('averages that side\'s accuracies rounded to 1 decimal', () => {
    expect(summary.accuracy).toBe(63)
    expect(gameSummary([judgement({ accuracy: 98.94 }), judgement({ ply: 2, accuracy: 98.94 })], 'white').accuracy).toBe(98.9)
  })
  it('counts each judgement for that side only', () => {
    expect(summary).toMatchObject({ best: 1, good: 1, inaccuracies: 1, mistakes: 1, blunders: 1 })
    expect(gameSummary([], 'black')).toMatchObject({ accuracy: 0, best: 0, good: 0, inaccuracies: 0, mistakes: 0, blunders: 0 })
  })
})

describe('keyMoments', () => {
  it('returns the user\'s n biggest mistakes/blunders sorted by ply', () => {
    const moments = keyMoments(
      [
        judgement({ ply: 1, drop: 5, judgement: 'inaccuracy' }), // too small
        judgement({ ply: 3, drop: 15, judgement: 'mistake' }),
        judgement({ ply: 5, drop: 35, judgement: 'blunder' }),
        judgement({ ply: 7, drop: 22, judgement: 'mistake' }),
        judgement({ ply: 6, color: 'black', drop: 50, judgement: 'blunder' }), // opponent's
      ],
      'white',
      2,
    )
    expect(moments).toHaveLength(2)
    expect(moments[0]).toMatchObject({ ply: 5, kind: 'blunder', drop: 35 })
    expect(moments[1]).toMatchObject({ ply: 7, kind: 'mistake', drop: 22 })
  })

  it('finds missed chances: the opponent blundered and the user did not punish', () => {
    const all = [
      judgement({ ply: 4, color: 'black', drop: 25, judgement: 'blunder' }),
      judgement({ ply: 5, drop: 12, judgement: 'inaccuracy', bestSan: 'Qd3' }),
      judgement({ ply: 8, color: 'black', drop: 25, judgement: 'mistake' }),
      judgement({ ply: 9, drop: 12, judgement: 'best', bestSan: null }), // punished: played best
      judgement({ ply: 12, color: 'black', drop: 25, judgement: 'mistake' }),
      judgement({ ply: 13, drop: 5, judgement: 'good' }), // user's drop < 10
    ]
    const moments = keyMoments(all, 'white')
    expect(moments).toHaveLength(1)
    expect(moments[0]).toMatchObject({ ply: 5, kind: 'missed', drop: 12, bestSan: 'Qd3' })
  })

  it('keeps one entry when a ply is both a blunder and a missed chance', () => {
    const all = [
      judgement({ ply: 4, color: 'black', drop: 25, judgement: 'blunder' }),
      judgement({ ply: 5, drop: 30, judgement: 'blunder' }),
    ]
    expect(keyMoments(all, 'white')).toEqual([
      expect.objectContaining({ ply: 5, kind: 'blunder' }),
    ])
  })
})

describe('evalSeries', () => {
  it('carries null wins forward from the previous point', () => {
    const analysis: GameAnalysis = {
      version: 1,
      engine: 'test',
      nodes: 1,
      plies: [
        plyAnalysis(0, { evalWin: 20 }),
        plyAnalysis(1, { move: { san: 'x', uci: 'a1a2' }, terminal: 'checkmate', fen: '8/8/8/8/8/5k2/5q2/7K w - - 0 1' }),
        plyAnalysis(2, { move: { san: 'y', uci: 'a1a3' }, evalWin: null, terminal: null }),
        plyAnalysis(3, { move: { san: 'z', uci: 'a1a4' }, evalWin: 50 }),
      ],
    }
    const series = evalSeries(analysis)
    expect(series.map((p) => p.ply)).toEqual([0, 1, 2, 3])
    expect(series[0].whiteWin).toBeCloseTo(20, 6) // evalWin is a win %, not cp
    expect(series[1].whiteWin).toBe(0) // White to move is mated
    expect(series[2].whiteWin).toBe(0) // carried forward
    expect(series[3].whiteWin).toBe(50)
  })
})

describe('classifyMoves on a real engine analysis (Scholar\'s mate)', () => {
  let judgements: MoveJudgement[]
  beforeAll(async () => {
    const analysis = await analyzeGame(SCHOLARS_MATE, engine, { engineId: 'test', nodes: 20_000 })
    judgements = classifyMoves(analysis)
  })

  it('marks 3...Nf6?? as a blunder leaving Black below 5%', () => {
    const blunder = judgements.find((j) => j.ply === 6)
    expect(blunder).toMatchObject({ ply: 6, color: 'black', san: 'Nf6', judgement: 'blunder' })
    expect(blunder!.winAfter).toBeLessThan(5)
  })

  it('marks 4.Qxf7# as the best move', () => {
    const mate = judgements.find((j) => j.ply === 7)
    expect(mate).toMatchObject({ ply: 7, color: 'white', san: 'Qxf7#', judgement: 'best', winAfter: 100 })
  })
})
