import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNodeEngine } from '../engine/node'
import type { UciEngine } from '../engine/uci-engine'
import { analyzeGame, parsePly, replayPgn, validateAnalysis, type GameAnalysis } from './game-analysis'

const SCHOLARS_MATE = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'
const STAFFORD = '1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 *'

// Real Stockfish (the vendored WASM build) through the Node transport.
// A fixed node budget makes single-threaded search deterministic.
let engine: UciEngine
beforeAll(async () => {
  engine = await createNodeEngine()
})
afterAll(() => engine.close())

describe('createNodeEngine', () => {
  it('leaves the host process globals intact (the Emscripten loader nulls fetch under Node)', () => {
    expect(typeof globalThis.fetch).toBe('function')
    expect('XMLHttpRequest' in globalThis).toBe(false)
  })
})

describe('replayPgn', () => {
  it('replays real Chess.com and Lichess PGNs (with clock comments)', () => {
    const cc = JSON.parse(readFileSync('test/fixtures/chesscom/archive-2026-09.json', 'utf8')).games[0].pgn as string
    const li = JSON.parse(readFileSync('test/fixtures/lichess/games-poip0i333.ndjson', 'utf8').split('\n')[0]).pgn as string
    for (const pgn of [cc, li]) {
      const positions = replayPgn(pgn)
      expect(positions.length).toBeGreaterThan(10)
      expect(positions[0].move).toBeNull()
      expect(positions[1].move?.uci).toMatch(/^[a-h][1-8][a-h][1-8]/)
    }
  })
})

describe('parsePly', () => {
  it('parses and clamps a valid ply', () => {
    expect(parsePly('0', 30)).toBe(0)
    expect(parsePly('5', 30)).toBe(5)
    expect(parsePly('30', 30)).toBe(30)
  })

  it('returns 0 for out-of-range, non-integer, and absent values', () => {
    expect(parsePly('31', 30)).toBe(0)
    expect(parsePly('-1', 30)).toBe(0)
    expect(parsePly('12.5', 30)).toBe(0)
    expect(parsePly('abc', 30)).toBe(0)
    expect(parsePly(['5'], 30)).toBe(0)
    expect(parsePly(undefined, 30)).toBe(0)
    expect(parsePly('5', -1)).toBe(0)
  })
})

describe('analyzeGame (real engine)', () => {
  let scholars: GameAnalysis
  beforeAll(async () => {
    scholars = await analyzeGame(SCHOLARS_MATE, engine, { engineId: 'test', nodes: 20_000 })
  })

  it('covers every position and marks the final checkmate', () => {
    expect(scholars.plies).toHaveLength(8)
    expect(scholars.plies.map((p) => p.ply)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    const last = scholars.plies[7]
    expect(last.move?.san).toBe('Qxf7#')
    expect(last.terminal).toBe('checkmate')
    expect(last.eval).toBeNull()
  })

  it('reports evals from White\'s point of view', () => {
    // After 3...Nf6?? White to move mates in one.
    const beforeMate = scholars.plies[6]
    expect(beforeMate.best?.san).toBe('Qxf7#')
    expect(beforeMate.eval).toEqual({ type: 'mate', value: 1 })
    // After 3.Qh5 Black is to move and must defend f7; White's POV stays near equal, not a Black mate.
    expect(scholars.plies[5].eval?.type).toBe('cp')
  })

  it('finds the refutation of the Stafford: 4.Nxc6, clearly better for White', async () => {
    const stafford = await analyzeGame(STAFFORD, engine, { engineId: 'test', nodes: 100_000 })
    const position = stafford.plies[6]
    expect(position.best?.san).toBe('Nxc6')
    expect(position.eval?.type).toBe('cp')
    expect(position.eval!.value).toBeGreaterThan(80)
    expect(position.second).not.toBeNull()
  })

  it('reports progress and honours abort', async () => {
    const seen: number[] = []
    await analyzeGame(STAFFORD, engine, { engineId: 't', nodes: 2_000, onProgress: (d) => seen.push(d) })
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7])
    const controller = new AbortController()
    controller.abort()
    await expect(analyzeGame(STAFFORD, engine, { engineId: 't', nodes: 2_000, signal: controller.signal })).rejects.toThrow(
      'aborted',
    )
  })

  it('validates analyses against the game', () => {
    expect(validateAnalysis(scholars, SCHOLARS_MATE)).toBeNull()
    expect(validateAnalysis({ ...scholars, plies: scholars.plies.slice(0, 7) }, SCHOLARS_MATE)).toMatch(/expected 8 plies/)
    const tampered = { ...scholars, plies: scholars.plies.map((p, i) => (i === 3 ? { ...p, fen: '8/8/8/8/8/8/8/8 w - - 0 1' } : p)) }
    expect(validateAnalysis(tampered, SCHOLARS_MATE)).toMatch(/ply 3/)
    expect(validateAnalysis({ ...scholars, version: 99 }, SCHOLARS_MATE)).toMatch(/version/)
    expect(validateAnalysis(null, SCHOLARS_MATE)).toMatch(/object/)
  })
})
