import { describe, expect, it } from 'vitest'

import type { Score } from '../engine/uci'
import { winPercent } from '../analysis/classify'
import { analyzeGame } from '../analysis/game-analysis'
import type { GameAnalysis, PlyAnalysis } from '../analysis/game-analysis'
import { createNodeEngine } from '../engine/node'
import { buildCards, buildCardsDetailed } from './cards'

const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })
const win = (score: Score): number => winPercent(score)

interface PlySpec {
  eval?: Score | null
  san?: string
  uci?: string
  bestSan?: string
  bestUci?: string
  bestEval?: Score
  secondSan?: string
  secondUci?: string
  secondEval?: Score
  /** Set to false to remove the second engine move from this position. */
  hasSecond?: boolean
  fen?: string
  terminal?: PlyAnalysis['terminal']
}

/**
 * A tiny analysis. By default every position is equal (cp 0) and the played
 * move is also the engine's best (with a presentable second), so nothing is a
 * mistake. Overriding a ply's eval (the position after that ply) or the
 * best/second stored in the position before it produces specific judgements.
 */
function analysisFor(specs: PlySpec[]): GameAnalysis {
  const plies: PlyAnalysis[] = specs.map((spec, ply) => ({
    ply,
    fen: spec.fen ?? QUIET_FEN,
    move: ply === 0 ? null : { san: spec.san ?? 'e4', uci: spec.uci ?? 'e2e4' },
    eval: spec.eval ?? cp(0),
    terminal: spec.terminal ?? null,
    best: ply === 0
      ? null
      : { uci: spec.bestUci ?? 'e2e4', san: spec.bestSan ?? 'e4', eval: spec.bestEval ?? cp(0) },
    second: ply === 0 || spec.hasSecond === false
      ? null
      : { uci: spec.secondUci ?? 'b1c3', san: spec.secondSan ?? 'Nc3', eval: spec.secondEval ?? cp(0) },
    depth: 10,
  }))
  return { version: 1, engine: 'test', nodes: 1, plies }
}

/**
 * A White-user blunder at `ply` (odd): White is +2 before the move (reached
 * without an opponent drop), then collapses to −2. The best/second pair is
 * stored in the position before the user's move.
 */
function whiteBlunderAnalysis(
  ply: number,
  opts: { bestEval?: Score; secondEval?: Score; hasSecond?: boolean; terminal?: PlyAnalysis['terminal'] } = {},
): GameAnalysis {
  const specs = Array<PlySpec>(ply + 1).fill({})
  specs[ply - 2] = { eval: cp(200) }
  specs[ply - 1] = {
    eval: cp(200),
    bestUci: 'd1h5',
    bestSan: 'Qh5',
    bestEval: opts.bestEval ?? mate(5),
    secondUci: 'b1c3',
    secondSan: 'Nc3',
    secondEval: opts.secondEval ?? cp(0),
    hasSecond: opts.hasSecond,
    terminal: opts.terminal,
  }
  specs[ply] = { eval: cp(-200), san: 'Qd7', uci: 'd8d7' }
  return analysisFor(specs)
}

/**
 * A missed chance for the White user at `ply` (odd): the opponent just
 * dropped White's eval 0 → +4 (a ≥ 20 drop from their view), and the user
 * gives it all back (a ≥ 10 drop). The ply is also a blunder — `missed` wins.
 */
function missedAnalysis(ply: number, opts: { bestEval?: Score; secondEval?: Score } = {}): GameAnalysis {
  const specs = Array<PlySpec>(ply + 1).fill({})
  specs[ply - 2] = { eval: cp(0) }
  specs[ply - 1] = {
    eval: cp(400),
    bestUci: 'd1h5',
    bestSan: 'Qh5',
    bestEval: opts.bestEval ?? mate(5),
    secondUci: 'b1c3',
    secondSan: 'Nc3',
    secondEval: opts.secondEval ?? cp(-60),
  }
  specs[ply] = { eval: cp(0), san: 'Qd7', uci: 'd8d7' }
  return analysisFor(specs)
}

/**
 * A Black-user blunder at `ply` (even): Black is fine before the move (White
 * at −0.6), then collapses (White to +2). The solution keeps White at −0.6
 * and the second move allows +2, so the gap holds from Black's point of view.
 */
function blackBlunderAnalysis(ply: number): GameAnalysis {
  const specs = Array<PlySpec>(ply + 1).fill({})
  specs[ply - 2] = { eval: cp(-60) }
  specs[ply - 1] = {
    eval: cp(-60),
    bestUci: 'b8c6',
    bestSan: 'Nc6',
    bestEval: cp(-60),
    secondUci: 'd8e7',
    secondSan: 'Qe7',
    secondEval: cp(200),
  }
  specs[ply] = { eval: cp(200), san: 'Qd7', uci: 'd8d7' }
  return analysisFor(specs)
}

const game = { id: 42, userColor: 'white' as const }
const blackGame = { id: 43, userColor: 'black' as const }

describe('buildCards gates', () => {
  it('needs both engine moves (MultiPV 2)', () => {
    const { cards, gates } = buildCardsDetailed(game, whiteBlunderAnalysis(7, { hasSecond: false }))
    expect(cards).toEqual([])
    expect(gates.skippedMissingEngine).toBe(1)
  })

  it('needs the best move to beat the second by at least 15 win % (14.9 vs 15)', () => {
    // White POV: solution 100%; the second move leaves 85.1% (gap 14.9) vs 84.7% (gap 15.3).
    expect(100 - win(cp(473))).toBeLessThan(15)
    expect(100 - win(cp(465))).toBeGreaterThanOrEqual(15)
    expect(buildCards(game, whiteBlunderAnalysis(7, { secondEval: cp(473) }))).toEqual([])
    expect(buildCardsDetailed(game, whiteBlunderAnalysis(7, { secondEval: cp(473) })).gates.skippedGap).toBe(1)
    expect(buildCards(game, whiteBlunderAnalysis(7, { secondEval: cp(465) }))).toHaveLength(1)
  })

  it('blunder cards need a solution win % of at least 40 (39.9 vs 40)', () => {
    expect(win(cp(-111))).toBeLessThan(40)
    expect(win(cp(-110))).toBeGreaterThanOrEqual(40)
    expect(buildCards(game, whiteBlunderAnalysis(7, { bestEval: cp(-111), secondEval: cp(-400) }))).toEqual([])
    expect(buildCards(game, whiteBlunderAnalysis(7, { bestEval: cp(-110), secondEval: cp(-400) }))).toHaveLength(1)
  })

  it('missed cards need a solution win % of at least 60 (59.9 vs 60)', () => {
    expect(win(cp(110))).toBeLessThan(60)
    expect(win(cp(111))).toBeGreaterThanOrEqual(60)
    expect(buildCards(game, missedAnalysis(7, { bestEval: cp(110) }))).toEqual([])
    expect(buildCards(game, missedAnalysis(7, { bestEval: cp(111) }))).toHaveLength(1)
  })

  it('skips the first three moves (ply ≤ 6) but takes ply 7', () => {
    // Black's ply 6 is exactly at the boundary and must be skipped.
    expect(buildCards(blackGame, blackBlunderAnalysis(6))).toEqual([])
    expect(buildCards(game, whiteBlunderAnalysis(7))).toHaveLength(1)
  })

  it('skips terminal positions', () => {
    const { cards, gates } = buildCardsDetailed(game, whiteBlunderAnalysis(7, { terminal: 'draw' }))
    expect(cards).toEqual([])
    expect(gates.skippedTerminal).toBe(1)
  })

  it('a ply that is both a blunder and a missed chance becomes a missed card', () => {
    const cards = buildCards(game, missedAnalysis(7))
    expect(cards).toHaveLength(1)
    expect(cards[0].kind).toBe('missed')
  })

  it('converts win % to the user’s point of view and fills every field', () => {
    const [card] = buildCards(blackGame, blackBlunderAnalysis(8))
    expect(card).toEqual({
      gameId: 43,
      ply: 8,
      kind: 'blunder',
      fen: QUIET_FEN,
      solutionUci: 'b8c6',
      solutionSan: 'Nc6',
      solutionWin: 100 - win(cp(-60)),
      playedSan: 'Qd7',
      playedWin: 100 - win(cp(200)),
      lastMoveUci: 'e2e4',
    })
  })
})

describe('buildCards (real engine)', () => {
  it('makes no card for the Scholar’s mate: Black’s 3...Nf6?? is ply 6, below the i > 6 gate', async () => {
    // 3...Nf6?? is Black's 3rd move (ply 6). The i > 6 gate skips the first
    // three moves before any engine-based gate runs, and Black's other plies
    // (2 and 4) are opening noise too — so this game yields no cards at all,
    // no matter how bad 3...Nf6 is.
    const engine = await createNodeEngine()
    try {
      const analysis = await analyzeGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', engine, {
        engineId: 'test',
        nodes: 20_000,
      })
      expect(buildCards({ id: 1, userColor: 'black' }, analysis)).toEqual([])
    } finally {
      engine.close()
    }
  })
})
