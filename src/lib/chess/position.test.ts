import { describe, expect, it } from 'vitest'

import { isValidFen, START_FEN, tryMove } from './position'

describe('tryMove', () => {
  it('returns the new FEN and SAN for a legal move', () => {
    const result = tryMove(START_FEN, { from: 'e2', to: 'e4' })
    expect(result?.san).toBe('e4')
    expect(result?.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
  })

  it('returns null for illegal moves', () => {
    // Pawn can't move three squares.
    expect(tryMove(START_FEN, { from: 'e2', to: 'e5' })).toBeNull()
    // Not black's turn to move a black piece.
    expect(tryMove(START_FEN, { from: 'e7', to: 'e5' })).toBeNull()
  })

  it('defaults promotion to queen', () => {
    const fen = '8/P7/8/8/8/8/8/4k2K w - - 0 1'
    const result = tryMove(fen, { from: 'a7', to: 'a8' })
    expect(result?.san).toBe('a8=Q')
  })

  it('honours an explicit promotion piece', () => {
    const fen = '8/P7/8/8/8/8/8/4k2K w - - 0 1'
    const result = tryMove(fen, { from: 'a7', to: 'a8', promotion: 'n' })
    expect(result?.san).toBe('a8=N')
  })

  it('castles', () => {
    let fen = START_FEN
    for (const move of [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'f1', to: 'c4' },
      { from: 'g8', to: 'f6' },
    ]) {
      fen = tryMove(fen, move)!.fen
    }
    const result = tryMove(fen, { from: 'e1', to: 'g1' })
    expect(result?.san).toBe('O-O')
  })

  it('returns null for an invalid FEN', () => {
    expect(tryMove('not a fen', { from: 'e2', to: 'e4' })).toBeNull()
  })
})

describe('isValidFen', () => {
  it('accepts valid positions and rejects garbage', () => {
    expect(isValidFen(START_FEN)).toBe(true)
    expect(isValidFen('8/P7/8/8/8/8/8/4k2K w - - 0 1')).toBe(true)
    expect(isValidFen('not a fen')).toBe(false)
    expect(isValidFen('')).toBe(false)
  })
})
