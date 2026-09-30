import { describe, expect, it } from 'vitest'

import type { Score } from '../engine/uci'
import type { GameAnalysis, PlyAnalysis } from './game-analysis'
import { checksBy, lichessThemeUrl, materialGain, missedMotif, mistakeMotif } from './motifs'

const cp = (value: number): Score => ({ type: 'cp', value })

type Pos = { fen: string; best?: { uci: string; eval: Score; pv?: string[] } }

/** A two-ply analysis: ply 0 = `before` (user to move), ply 1 = `after` (opponent to move). */
function analysis(
  before: Pos,
  after: Pos,
): GameAnalysis {
  const ply = (n: number, p: Pos): PlyAnalysis => ({
    ply: n,
    fen: p.fen,
    move: n === 0 ? null : { san: '?', uci: 'a1a1' },
    eval: cp(0),
    terminal: null,
    best: p.best ? { uci: p.best.uci, san: '?', eval: p.best.eval, pv: p.best.pv } : null,
    second: null,
    depth: 10,
  })
  return { version: 1, engine: 'test', nodes: 1, plies: [ply(0, before), ply(1, after)] }
}

const START = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }

describe('mistakeMotif (the opponent reply after the user move)', () => {
  it('hanging piece: undefended knight taken by the queen', () => {
    const a = analysis(START, { fen: '4k3/4q3/8/4N3/8/8/8/4K3 b - - 0 1', best: { uci: 'e7e5', eval: cp(-600) } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'hangingPiece' })
  })

  it('hanging piece: defended knight taken by a cheaper pawn', () => {
    const a = analysis(START, { fen: '4k3/8/3p4/4N3/3P4/8/8/4K3 b - - 0 1', best: { uci: 'd6e5', eval: cp(-200) } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'hangingPiece' })
  })

  it('not hanging: defended knight taken by a more valuable queen', () => {
    const a = analysis(START, { fen: '4k3/4q3/8/4N3/3P4/8/8/4K3 b - - 0 1', best: { uci: 'e7e5', eval: cp(-100) } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'other' })
  })

  it('pawn captures are not "hanging piece"', () => {
    const a = analysis(START, { fen: '4k3/4q3/8/4P3/8/8/8/4K3 b - - 0 1', best: { uci: 'e7e5', eval: cp(-100) } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'other' })
  })

  it('fork: knight check on c2 hits king and the undefended rook', () => {
    const a = analysis(START, { fen: '4k3/8/8/8/1n6/8/8/R3K3 b - - 0 1', best: { uci: 'b4c2', eval: cp(-500) } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'fork' })
  })

  it('allowed mate: the reply line mates for the opponent (Black here, so a negative White-POV mate)', () => {
    const a = analysis(START, { fen: '4k3/8/8/8/8/8/8/4K3 b - - 0 1', best: { uci: 'e8d7', eval: { type: 'mate', value: -2 } } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'allowedMate', mateIn: 2 })
  })

  it('a mate score in the user\'s favour is not "allowed mate"', () => {
    const a = analysis(START, { fen: '4k3/8/8/8/8/8/8/4K3 b - - 0 1', best: { uci: 'e8d7', eval: { type: 'mate', value: 3 } } })
    expect(mistakeMotif(a, 1).motif).toBe('other')
  })
})

describe('missedMotif (the user best move in the position before)', () => {
  it('missed free piece: the queen could take an undefended knight', () => {
    const a = analysis({ fen: '4k3/8/8/4n3/8/8/7Q/4K3 w - - 0 1', best: { uci: 'h2e5', eval: cp(700) } }, { fen: START.fen })
    expect(missedMotif(a, 1)).toEqual({ motif: 'missedFreePiece' })
  })

  it('missed mate for White', () => {
    const a = analysis({ fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', best: { uci: 'e1d2', eval: { type: 'mate', value: 1 } } }, { fen: START.fen })
    expect(missedMotif(a, 1)).toEqual({ motif: 'missedMate', mateIn: 1 })
  })

  it('missed fork: a white knight to c7 forks king and rook', () => {
    const a = analysis({ fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', best: { uci: 'b5c7', eval: cp(500) } }, { fen: START.fen })
    expect(missedMotif(a, 1)).toEqual({ motif: 'missedFork' })
  })
})

describe('lichessThemeUrl', () => {
  it('maps motifs to Lichess puzzle themes', () => {
    expect(lichessThemeUrl({ motif: 'hangingPiece' })).toBe('https://lichess.org/training/hangingPiece')
    expect(lichessThemeUrl({ motif: 'missedFork' })).toBe('https://lichess.org/training/fork')
    expect(lichessThemeUrl({ motif: 'allowedMate', mateIn: 2 })).toBe('https://lichess.org/training/mateIn2')
    expect(lichessThemeUrl({ motif: 'missedMate', mateIn: 5 })).toBe('https://lichess.org/training/mate')
    expect(lichessThemeUrl({ motif: 'other' })).toBeNull()
  })
})

describe('materialGain / combinations along the engine line', () => {
  it('counts net material at the first quiet point, not mid-exchange', () => {
    // dxe5 dxe5 Qxd8+ Kxd8 Nxe5: the queens come off, White nets the e5 pawn (+1), then ...Bd6 is quiet.
    const fen = 'rnbqkb1r/ppp2ppp/3p1n2/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4'
    expect(materialGain(fen, ['d4e5', 'd6e5', 'd1d8', 'e8d8', 'f3e5', 'f8d6'])).toBe(1)
  })

  it('returns null without a usable line', () => {
    expect(materialGain('4k3/8/8/8/8/8/8/4K3 w - - 0 1', undefined)).toBeNull()
    expect(materialGain('4k3/8/8/8/8/8/8/4K3 w - - 0 1', ['e1d2'])).toBeNull()
  })

  it('an immediate fork takes precedence over the material count', () => {
    // ...Nc2+ hits the king and the undefended rook; the line ...Kd1 Nxa1 nets +5.
    const fen = '4k3/8/8/8/3n4/8/7P/R3K3 b - - 0 1'
    const pv = ['d4c2', 'e1d1', 'c2a1', 'd1c1']
    const a = analysis(START, { fen, best: { uci: 'd4c2', eval: cp(-500), pv } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'fork' })
    expect(materialGain(fen, pv)).toBe(5)
  })

  it('tags lostMaterial when a quiet first move wins material later in the line', () => {
    // ...Qb2 attacks the a1 rook. If White saves it (Rf1) nothing is won: other.
    const fen = '6k1/8/8/8/8/8/5q2/R5K1 b - - 0 1'
    const saved = analysis(START, { fen, best: { uci: 'f2b2', eval: cp(-300), pv: ['f2b2', 'a1f1', 'b2b1'] } })
    expect(mistakeMotif(saved, 1)).toEqual({ motif: 'other' })
    // If the line is ...Qb2 Kh1 Qxa1+, the rook falls two plies later: lostMaterial.
    const lost = analysis(START, { fen, best: { uci: 'f2b2', eval: cp(-600), pv: ['f2b2', 'g1h1', 'b2a1', 'h1h2'] } })
    expect(mistakeMotif(lost, 1)).toEqual({ motif: 'lostMaterial' })
  })
})

describe('king attacks (checks along the engine line)', () => {
  // Real position from the owner's game 2571 after 21.d5?: Black to move, the line is a queen+rook king hunt.
  const fen = 'r3k2r/3pp3/n1p5/p2P4/4R3/1P4q1/PBPQ2P1/R5K1 b kq - 0 21'
  const pv = ['g3h2', 'g1f2', 'h8f8', 'f2e3', 'h2h6', 'e3e2']

  it('counts only the attacking side\'s checks', () => {
    expect(checksBy(fen, pv)).toBe(3)
    expect(checksBy(fen, undefined)).toBe(0)
  })

  it('tags the mistake as kingAttack when nothing more specific applies', () => {
    const a = analysis(START, { fen, best: { uci: 'g3h2', eval: cp(-400), pv } })
    expect(mistakeMotif(a, 1)).toEqual({ motif: 'kingAttack' })
    expect(lichessThemeUrl({ motif: 'kingAttack' })).toBe('https://lichess.org/training/exposedKing')
  })
})
