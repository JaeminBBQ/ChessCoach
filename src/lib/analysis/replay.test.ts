import { describe, expect, it } from 'vitest'

import type { GameAnalysis, PlyAnalysis } from './game-analysis'
import type { Score } from '../engine/uci'
import { replayWindow } from './replay'

const PGN = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#'
const cp = (value: number): Score => ({ type: 'cp', value })

function analysis(
  pliesCount: number,
  overrides: Partial<Record<number, { best?: PlyAnalysis['best']; eval?: Score }>> = {},
): GameAnalysis {
  const plies: PlyAnalysis[] = []
  for (let ply = 0; ply < pliesCount; ply++) {
    plies.push({
      ply,
      fen: 'start', // replayWindow never reads the stored FENs; positions come from the PGN
      move: null,
      eval: overrides[ply]?.eval ?? cp(0),
      terminal: null,
      best: overrides[ply]?.best ?? null,
      second: null,
      depth: 10,
    })
  }
  return { version: 1, engine: 'test', nodes: 1, plies }
}

/** The position after 3.Qh5 (ply 5) — Black to move; g6 is the standard defense. */
const DECISION_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3'

const whiteGame = { id: 7, pgn: PGN, userColor: 'white' as const, analysis: null as GameAnalysis | null }
const blackGame = { id: 8, pgn: PGN, userColor: 'black' as const, analysis: null as GameAnalysis | null }

// The PGN has 7 half-moves, so plies run 0..7.
const LAST_PLY = 7

describe('replayWindow', () => {
  it('clamps the window at both ends and points decisionIndex at ply p − 1', () => {
    const data = replayWindow(blackGame, { ply: 1, label: '1...e5' })!
    expect(data.game.map((s) => s.ply)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(data.decisionIndex).toBe(0) // p = 1 → decision position is ply 0

    const last = replayWindow(blackGame, { ply: LAST_PLY, label: 'last' })!
    expect(last.game.map((s) => s.ply)).toEqual([2, 3, 4, 5, 6, 7])
    expect(last.decisionIndex).toBe(4) // ply 6 within the window
  })

  it('p = 0: the decision position is ply 0 and there is no played/best move', () => {
    const data = replayWindow(blackGame, { ply: 0, label: 'start' })!
    expect(data.game[0]).toMatchObject({ ply: 0, san: null, uci: null })
    expect(data.decisionIndex).toBe(0)
    expect(data.engine).toBeNull()
    expect(data.game.map((s) => s.ply)).toEqual([0, 1, 2, 3, 4, 5, 6]) // min(7, 0 + 6)
  })

  it('without an analysis every win is null and the engine line is null', () => {
    const data = replayWindow(blackGame, { ply: 6, label: '3...Nf6??' })!
    expect(data.game.every((s) => s.win === null)).toBe(true)
    expect(data.engine).toBeNull()
  })

  it('builds the engine line from the pv: legal FENs, correct SANs, win % from the user’s POV', () => {
    const a = analysis(9, {
      5: { best: { uci: 'g7g6', san: 'g6', eval: cp(-100), pv: ['g7g6', 'h5f3'] }, eval: cp(-100) },
    })
    const data = replayWindow({ ...blackGame, analysis: a }, { ply: 6, label: '3...Nf6??' })!

    // Black user: the decision position is White +1 → 41% White, 59% Black.
    expect(data.game[data.decisionIndex].win).toBe(59)
    expect(data.engine).not.toBeNull()
    expect(data.engine!.bestSan).toBe('g6')
    expect(data.engine!.bestWin).toBe(59)
    expect(data.engine!.steps).toHaveLength(3)
    expect(data.engine!.steps[0]).toMatchObject({ ply: 5, fen: DECISION_FEN, san: null, win: null })
    expect(data.engine!.steps[1]).toMatchObject({ ply: 6, san: 'g6', win: null })
    expect(data.engine!.steps[2]).toMatchObject({ ply: 7, san: 'Qf3', win: null })
    // Every engine step is a legal FEN.
    for (const step of data.engine!.steps) {
      expect(step.fen.split(' ')).toHaveLength(6)
    }
  })

  it('stops at the first illegal PV move instead of throwing', () => {
    const a = analysis(9, { 5: { best: { uci: 'g7g6', san: 'g6', eval: cp(-100), pv: ['g7g6', 'b8b9'] }, eval: cp(-100) } })
    const data = replayWindow({ ...blackGame, analysis: a }, { ply: 6, label: 'x' })!
    expect(data.engine!.steps).toHaveLength(2) // decision + g6, then the illegal move breaks
  })

  it('a missing pv falls back to the single best move', () => {
    const a = analysis(9, { 5: { best: { uci: 'g7g6', san: 'g6', eval: cp(-100) }, eval: cp(-100) } })
    const data = replayWindow({ ...blackGame, analysis: a }, { ply: 6, label: 'x' })!
    expect(data.engine!.steps).toHaveLength(2)
    expect(data.engine!.steps[1]).toMatchObject({ san: 'g6', uci: 'g7g6' })
  })

  it('the engine line is null when the best move equals the played move', () => {
    const a = analysis(9, { 3: { best: { uci: 'b8c6', san: 'Nc6', eval: cp(0) } } })
    const data = replayWindow({ ...blackGame, analysis: a }, { ply: 4, label: '2...Nc6' })!
    expect(data.engine).toBeNull()
  })

  it('converts win % to the user’s POV for a White user too', () => {
    const a = analysis(9, { 5: { best: { uci: 'g7g6', san: 'g6', eval: cp(-100) }, eval: cp(-100) } })
    const data = replayWindow({ ...whiteGame, analysis: a }, { ply: 6, label: 'x' })!
    expect(data.game[data.decisionIndex].win).toBe(41)
    expect(data.engine!.bestWin).toBe(41)
  })

  it('an unreadable PGN returns null', () => {
    expect(replayWindow({ ...blackGame, pgn: 'not a pgn' }, { ply: 1, label: 'x' })).toBeNull()
  })

  it('clamps p into the game’s range', () => {
    const data = replayWindow(blackGame, { ply: 999, label: 'far' })!
    expect(data.ply).toBe(LAST_PLY)
    expect(data.game[data.game.length - 1].ply).toBe(LAST_PLY)
  })
})
