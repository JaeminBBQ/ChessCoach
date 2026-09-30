import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'

import type { AnalysisEngine, EngineLine } from '../engine/uci-engine'
import { buildRepertoire, pathKey, type Frequency, type RepertoireSpec } from './build'

/**
 * Fake engine: for each position, scores legal moves from a table keyed by
 * SAN (side-to-move POV, cp); unlisted moves score −50. Returns the top N as
 * MultiPV lines, so tests control the engine's preferences exactly.
 */
function fakeEngine(scores: Record<string, number>): AnalysisEngine & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async analyze(fen, limits) {
      calls.push(fen)
      const chess = new Chess(fen)
      const ranked = chess
        .moves({ verbose: true })
        .map((m) => ({ uci: m.lan, cp: scores[m.san] ?? -50 }))
        .sort((a, b) => b.cp - a.cp)
      return ranked.slice(0, limits.multiPv ?? 1).map(
        (m, i): EngineLine => ({ multipv: i + 1, depth: 10, score: { type: 'cp', value: m.cp }, pv: [m.uci] }),
      )
    },
    close() {},
  }
}

const freqTable = (table: Record<string, number>) => (path: string): Frequency | null => {
  const n = table[pathKey(path)]
  return n ? { n, score: 0.5 } : null
}

const spec = (over: Partial<RepertoireSpec> = {}): RepertoireSpec => ({
  id: 't',
  name: 'Test',
  color: 'white',
  root: [],
  maxPly: 3,
  ...over,
})

describe('buildRepertoire', () => {
  it("plays the engine's best move for the user and expands opponent replies (engine top 2)", async () => {
    const engine = fakeEngine({ e4: 60, d4: 40, e5: 30, c5: 20 })
    const nodes = await buildRepertoire(spec(), { engine, nodes: 1, frequency: () => null, minFreq: 10, habitTolerance: 0 })
    const byPath = new Map(nodes.map((n) => [n.path, n]))
    expect(byPath.get('e4')?.by).toBe('user')
    expect([...byPath.keys()].filter((p) => p.split(' ').length === 2).sort()).toEqual(['e4 c5', 'e4 e5'])
    // The user's third-ply move exists under each reply and nothing deeper (maxPly 3).
    expect(nodes.filter((n) => n.path.split(' ').length === 3)).toHaveLength(2)
    expect(nodes.every((n) => n.path.split(' ').length <= 3)).toBe(true)
  })

  it('keeps the habitual move when it is within tolerance, and forced prefers win', async () => {
    const engine = fakeEngine({ e4: 60, d4: 55 })
    const habit = await buildRepertoire(spec({ maxPly: 1 }), {
      engine,
      nodes: 1,
      frequency: freqTable({ d4: 40 }),
      minFreq: 10,
      habitTolerance: 3,
    })
    expect(habit.map((n) => n.san)).toEqual(['d4'])
    const forced = await buildRepertoire(spec({ maxPly: 1, prefer: { '': 'c4' } }), {
      engine,
      nodes: 1,
      frequency: freqTable({ d4: 40 }),
      minFreq: 10,
      habitTolerance: 3,
    })
    expect(forced.map((n) => n.san)).toEqual(['c4'])
  })

  it('adds frequently played opponent replies beyond the engine top 2 and respects `deeper`', async () => {
    const engine = fakeEngine({ e4: 60, e5: 30, c5: 20 })
    const nodes = await buildRepertoire(spec({ maxPly: 2, deeper: { 'e4 d5': 3 } }), {
      engine,
      nodes: 1,
      frequency: freqTable({ 'e4 d5': 25 }),
      minFreq: 10,
      habitTolerance: 0,
    })
    const paths = nodes.map((n) => n.path)
    expect(paths).toContain('e4 d5')
    expect(paths.some((p) => p.startsWith('e4 d5 '))).toBe(true)
    expect(paths.some((p) => p.startsWith('e4 e5 '))).toBe(false)
  })

  it('fills evals from the analysis of the resulting position, White POV', async () => {
    // After 1.e4 the engine (Black to move) reports e5 at +30 for Black => White POV −30.
    const engine = fakeEngine({ e4: 60, e5: 30, c5: 20 })
    const nodes = await buildRepertoire(spec({ maxPly: 2 }), { engine, nodes: 1, frequency: () => null, minFreq: 10, habitTolerance: 0 })
    expect(nodes.find((n) => n.path === 'e4')?.eval).toEqual({ type: 'cp', value: -30 })
    expect(nodes.every((n) => n.eval !== null)).toBe(true)
  })

  it('flags opponent replies that leave the user clearly winning', async () => {
    const engine = fakeEngine({ e4: 60, e5: 30, f6: 5, 'Qh5+': 900 })
    const nodes = await buildRepertoire(spec({ maxPly: 2 }), {
      engine,
      nodes: 1,
      frequency: freqTable({ 'e4 f6': 12 }),
      minFreq: 10,
      habitTolerance: 0,
    })
    expect(nodes.find((n) => n.path === 'e4 f6')?.punish).toBe(true)
    expect(nodes.find((n) => n.path === 'e4 e5')?.punish).toBeUndefined()
  })

  it('always includes opponent moves on `include` lines (traps), checks normalized', async () => {
    const engine = fakeEngine({ e4: 60, e5: 30, c5: 20 })
    const nodes = await buildRepertoire(spec({ maxPly: 3, include: ['e4 f5'] }), {
      engine,
      nodes: 1,
      frequency: () => null,
      minFreq: 10,
      habitTolerance: 0,
    })
    expect(nodes.map((n) => n.path)).toContain('e4 f5')
  })

  it('follows `include` lines past the depth limit without branching', async () => {
    const engine = fakeEngine({ e4: 60, e5: 30, c5: 20, Nf3: 40, Nc6: 10, Bc4: 30 })
    const nodes = await buildRepertoire(spec({ maxPly: 2, include: ['e4 e5 Nf3 Nc6 Bc4'] }), {
      engine,
      nodes: 1,
      frequency: () => null,
      minFreq: 10,
      habitTolerance: 0,
    })
    const paths = nodes.map((n) => n.path)
    expect(paths).toContain('e4 e5 Nf3 Nc6 Bc4')
    expect(paths.filter((p) => p.split(' ').length > 2)).toEqual(['e4 e5 Nf3', 'e4 e5 Nf3 Nc6', 'e4 e5 Nf3 Nc6 Bc4'])
    expect(nodes.find((n) => n.path === 'e4 e5 Nf3 Nc6 Bc4')?.eval).not.toBeNull()
  })

  it('normalizes check marks for lookups', () => {
    expect(pathKey('e4 e5 Bc4 Nc6 Bxf7+ Ke7')).toBe('e4 e5 Bc4 Nc6 Bxf7 Ke7')
  })
})
