import { describe, expect, it } from 'vitest'

import { formatScore, parseBestMove, parseInfo, toWhitePov } from './uci'

describe('parseInfo', () => {
  it('parses a full multipv info line', () => {
    const line =
      'info depth 14 seldepth 23 multipv 2 score cp 80 nodes 128991 nps 806193 hashfull 49 time 160 pv d2d4 d8e7 b1c3'
    expect(parseInfo(line)).toEqual({
      depth: 14,
      multipv: 2,
      score: { type: 'cp', value: 80 },
      bound: false,
      nodes: 128991,
      pv: ['d2d4', 'd8e7', 'b1c3'],
    })
  })

  it('parses mate scores and bounds, defaulting multipv to 1', () => {
    const info = parseInfo('info depth 5 score mate -3 lowerbound nodes 10 pv e7e5')
    expect(info).toMatchObject({ multipv: 1, score: { type: 'mate', value: -3 }, bound: true })
  })

  it('ignores lines without a score or pv', () => {
    expect(parseInfo('info string NNUE evaluation using nn-xyz.nnue')).toBeNull()
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('info depth 1 score cp 20')).toBeNull()
    expect(parseInfo('readyok')).toBeNull()
  })
})

describe('parseBestMove', () => {
  it('reads the move and handles (none)', () => {
    expect(parseBestMove('bestmove e5c6 ponder d7c6')).toEqual({ move: 'e5c6' })
    expect(parseBestMove('bestmove (none)')).toEqual({ move: null })
    expect(parseBestMove('info depth 1')).toBeNull()
  })
})

describe('toWhitePov / formatScore', () => {
  it('flips scores when Black is to move', () => {
    expect(toWhitePov({ type: 'cp', value: 35 }, 'w')).toEqual({ type: 'cp', value: 35 })
    expect(toWhitePov({ type: 'cp', value: 35 }, 'b')).toEqual({ type: 'cp', value: -35 })
    expect(toWhitePov({ type: 'mate', value: 2 }, 'b')).toEqual({ type: 'mate', value: -2 })
  })

  it('formats pawns and mates', () => {
    expect(formatScore({ type: 'cp', value: 159 })).toBe('+1.59')
    expect(formatScore({ type: 'cp', value: -30 })).toBe('-0.30')
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00')
    expect(formatScore({ type: 'mate', value: 3 })).toBe('#3')
    expect(formatScore({ type: 'mate', value: -2 })).toBe('#-2')
  })
})
