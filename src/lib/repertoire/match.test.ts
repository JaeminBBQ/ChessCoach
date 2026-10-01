import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'

import type { Result } from '../db/schema'
import {
  bookStats,
  buildBookIndex,
  fenKey,
  formatLine,
  matchGame,
  moveNo,
  nodeWin,
  topDeviations,
  type BookNode,
  type GameMatch,
  type MatchRow,
} from './match'

/** A book node at `path` with a real fenKey, in a numbered global id space. */
function node(id: number, repertoireId: number, path: string, by: 'user' | 'opponent'): BookNode {
  const chess = new Chess()
  let san = ''
  for (const token of path.split(' ')) san = chess.move(token).san
  return { id, repertoireId, path, san, by, fenKey: fenKey(chess.fen()) }
}

function match(
  nodes: BookNode[],
  repertoires: { id: number; color: 'white' | 'black'; root: string[] }[],
  sans: string[],
  userColor: 'white' | 'black',
): GameMatch {
  return matchGame(buildBookIndex(nodes, repertoires), sans, userColor)
}

function game(result: Result, userColor: 'white' | 'black' = 'white', sans: string[] = []): MatchRow['game'] {
  return { userColor, result, sans }
}

describe('matchGame', () => {
  it('book-end: the game follows the book to its end', () => {
    // Black user; the book ends after 2...Nf3.
    const nodes = [node(1, 1, 'e4', 'opponent'), node(2, 1, 'e4 e5', 'user'), node(3, 1, 'e4 e5 Nf3', 'opponent')]
    const m = match(nodes, [{ id: 1, color: 'black', root: ['e4'] }], ['e4', 'e5', 'Nf3', 'Nc6'], 'black')
    expect(m).toEqual({ status: 'book-end', repertoireId: 1, leftPly: 3, leftSan: null, bookSans: null, positions: [1, 2, 3] })
  })

  it('user-left: the user varies and the book moves are listed', () => {
    // Two white trees share e4 e5; the book moves after it are Nf3 and f4.
    const nodes = [
      node(1, 1, 'e4', 'user'),
      node(2, 1, 'e4 e5', 'opponent'),
      node(3, 1, 'e4 e5 Nf3', 'user'),
      node(4, 2, 'e4', 'user'),
      node(5, 2, 'e4 e5', 'opponent'),
      node(6, 2, 'e4 e5 f4', 'user'),
    ]
    const m = match(
      nodes,
      [
        { id: 1, color: 'white', root: ['e4'] },
        { id: 2, color: 'white', root: ['e4'] },
      ],
      ['e4', 'e5', 'd4'],
      'white',
    )
    expect(m).toEqual({
      status: 'user-left',
      repertoireId: 1, // canonical of e4 e5 is tree 1's node (lowest id)
      leftPly: 3,
      leftSan: 'd4',
      bookSans: ['Nf3', 'f4'],
      positions: [1, 2],
    })
  })

  it('opponent-left at ply 1: 1.c4 against a Black user is not in the book', () => {
    const nodes = [node(1, 1, 'd4', 'opponent'), node(2, 1, 'd4 e5', 'user')]
    const m = match(nodes, [{ id: 1, color: 'black', root: ['d4'] }], ['c4', 'e5'], 'black')
    expect(m).toEqual({ status: 'opponent-left', repertoireId: null, leftPly: 1, leftSan: 'c4', bookSans: ['d4'], positions: [] })
  })

  it('game-ended: the moves run out while still in the book', () => {
    const nodes = [node(1, 1, 'e4', 'opponent'), node(2, 1, 'e4 e5', 'user')]
    const m = match(nodes, [{ id: 1, color: 'black', root: ['e4'] }], ['e4', 'e5'], 'black')
    expect(m).toEqual({ status: 'game-ended', repertoireId: 1, leftPly: 2, leftSan: null, bookSans: null, positions: [1, 2] })
  })

  it('a transposition reaches the same canonical node', () => {
    const nodes = [
      node(1, 1, 'd4', 'opponent'),
      node(2, 1, 'd4 d5', 'user'),
      node(3, 1, 'd4 d5 c4', 'opponent'),
      node(4, 1, 'd4 d5 c4 e6', 'user'),
      node(5, 2, 'c4', 'opponent'),
      node(6, 2, 'c4 e6', 'user'),
      node(7, 2, 'c4 e6 d4', 'opponent'),
      node(8, 2, 'c4 e6 d4 d5', 'user'),
    ]
    const viaD4 = match(
      nodes,
      [
        { id: 1, color: 'black', root: ['d4'] },
        { id: 2, color: 'black', root: ['c4'] },
      ],
      ['d4', 'd5', 'c4', 'e6'],
      'black',
    )
    const viaC4 = match(
      nodes,
      [
        { id: 1, color: 'black', root: ['d4'] },
        { id: 2, color: 'black', root: ['c4'] },
      ],
      ['c4', 'e6', 'd4', 'd5'],
      'black',
    )
    expect(viaD4.status).toBe('game-ended')
    expect(viaC4.status).toBe('game-ended')
    expect(viaD4.positions[3]).toBe(4) // the shared position's canonical node is the lowest id
    expect(viaC4.positions[3]).toBe(4)
  })

  it('check marks in SAN do not matter', () => {
    const nodes = [node(1, 1, 'e4', 'opponent'), node(2, 1, 'e4 e5', 'user'), node(3, 1, 'e4 e5 Nf3', 'opponent')]
    const clean = match(nodes, [{ id: 1, color: 'black', root: ['e4'] }], ['e4', 'e5', 'Nf3'], 'black')
    const marked = match(nodes, [{ id: 1, color: 'black', root: ['e4'] }], ['e4', 'e5+', 'Nf3!'], 'black')
    expect(marked).toEqual(clean)
  })

  it('two trees of one color share root-path positions; repertoireId picks the deeper tree', () => {
    const nodes = [
      // Tree 1 (Ponziani-style): root e4 e5 Nf3 Nc6.
      node(1, 1, 'e4', 'user'),
      node(2, 1, 'e4 e5', 'opponent'),
      node(3, 1, 'e4 e5 Nf3', 'user'),
      node(4, 1, 'e4 e5 Nf3 Nc6', 'opponent'),
      node(5, 1, 'e4 e5 Nf3 Nc6 c3', 'user'),
      // Tree 2 (Petrov-style): root e4 e5 Nf3 Nf6.
      node(6, 2, 'e4', 'user'),
      node(7, 2, 'e4 e5', 'opponent'),
      node(8, 2, 'e4 e5 Nf3', 'user'),
      node(9, 2, 'e4 e5 Nf3 Nf6', 'opponent'),
      node(10, 2, 'e4 e5 Nf3 Nf6 Nxe5', 'user'),
    ]
    const index = buildBookIndex(nodes, [
      { id: 1, color: 'white', root: ['e4', 'e5', 'Nf3', 'Nc6'] },
      { id: 2, color: 'white', root: ['e4', 'e5', 'Nf3', 'Nf6'] },
    ])
    // Only shared root-path moves were played: no repertoire yet.
    const short = matchGame(index, ['e4', 'e5', 'Nf3', 'Nf6'], 'white')
    expect(short.status).toBe('game-ended')
    expect(short.repertoireId).toBeNull()
    // The move past each root picks its tree.
    expect(matchGame(index, ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5'], 'white').repertoireId).toBe(2)
    expect(matchGame(index, ['e4', 'e5', 'Nf3', 'Nc6', 'c3'], 'white').repertoireId).toBe(1)
  })
})

describe('bookStats', () => {
  it('counts the games through each position and the off-book moves, by whom', () => {
    const rows: MatchRow[] = [
      { match: { status: 'game-ended', repertoireId: 1, leftPly: 2, leftSan: null, bookSans: null, positions: [10, 11] }, game: game('win') },
      { match: { status: 'game-ended', repertoireId: 1, leftPly: 3, leftSan: null, bookSans: null, positions: [10, 11, 12] }, game: game('draw') },
      { match: { status: 'opponent-left', repertoireId: 1, leftPly: 3, leftSan: 'h6', bookSans: ['Nc3'], positions: [10, 11] }, game: game('loss') },
    ]
    const stats = bookStats(rows)
    expect(stats.get(10)!.n).toBe(3)
    expect(stats.get(11)!.score).toBe(1.5)
    expect(stats.get(11)!.offBook.get('h6')).toEqual({ by: 'opponent', n: 1, score: 0 })
    expect(stats.get(12)!.n).toBe(1)
    expect(stats.get(12)!.offBook.size).toBe(0)
  })

  it('records the follow-up move of book-end games as off-book', () => {
    const rows: MatchRow[] = [
      { match: { status: 'book-end', repertoireId: 1, leftPly: 2, leftSan: null, bookSans: null, positions: [10, 11] }, game: game('win', 'white', ['e4', 'e5', 'd4']) },
    ]
    const stats = bookStats(rows)
    expect(stats.get(11)!.offBook.get('d4')).toEqual({ by: 'user', n: 1, score: 1 })
  })
})

describe('topDeviations', () => {
  const nodes = [node(1, 1, 'e4 e5 Nf3 Nc6', 'opponent'), node(2, 1, 'e4 e5 Nf3 Nf6', 'opponent')]

  function dev(positionId: number | null, leftPly: number, status: 'user-left' | 'opponent-left', san: string, bookSans: string[], result: Result): MatchRow {
    const positions = Array.from({ length: leftPly - 1 }, (_, i) => i + 10)
    if (leftPly >= 2 && positionId !== null) positions[leftPly - 2] = positionId
    return { match: { status, repertoireId: 1, leftPly, leftSan: san, bookSans, positions }, game: game(result) }
  }

  it('groups by position and move, splits by side, and orders by count', () => {
    const rows: MatchRow[] = [
      dev(1, 5, 'opponent-left', 'a6', ['Bb5'], 'win'),
      dev(1, 5, 'opponent-left', 'a6', ['Bb5'], 'draw'),
      dev(1, 5, 'opponent-left', 'h6', ['Bb5'], 'win'),
      dev(1, 5, 'user-left', 'd4', ['c3'], 'loss'),
      dev(2, 5, 'user-left', 'd4', ['Nxe5'], 'win'),
    ]
    const { opponent, user } = topDeviations(rows, nodes, 8)
    expect(opponent.map((d) => d.san)).toEqual(['a6', 'h6'])
    expect(opponent[0]).toMatchObject({ n: 2, score: 0.75, line: ['e4', 'e5', 'Nf3', 'Nc6'], bookSans: ['Bb5'] })
    expect(user.map((d) => `${d.line.join(' ')} ${d.san}`)).toEqual(['e4 e5 Nf3 Nc6 d4', 'e4 e5 Nf3 Nf6 d4'])
  })

  it('caps each list at top N', () => {
    const rows: MatchRow[] = [dev(1, 5, 'opponent-left', 'a6', [], 'win'), dev(1, 5, 'opponent-left', 'h6', [], 'win')]
    const { opponent } = topDeviations(rows, nodes, 1)
    expect(opponent).toHaveLength(1)
    expect(opponent[0].san).toBe('a6')
  })

  it('counts root-path and start-position deviations', () => {
    // White book whose trees start after 1.e4: 1...c5 deviates on the root move,
    // and a Black book meeting 1.c4 deviates on the start position itself.
    const rootNodes = [node(1, 1, 'e4', 'user'), node(2, 1, 'e4 e5', 'opponent')]
    const rows: MatchRow[] = [
      dev(1, 2, 'opponent-left', 'c5', ['e5'], 'loss'),
      dev(null, 1, 'opponent-left', 'c4', ['e4', 'd4'], 'win'),
    ]
    const { opponent } = topDeviations(rows, rootNodes, 10)
    expect(opponent).toHaveLength(2)
    expect(opponent.find((d) => d.san === 'c5')).toMatchObject({ canonicalId: 1, repertoireId: 1, line: ['e4'] })
    expect(opponent.find((d) => d.san === 'c4')).toMatchObject({ canonicalId: null, repertoireId: null, line: [] })
  })
})

describe('formatLine / moveNo / nodeWin', () => {
  it('formats SANs with move numbers', () => {
    expect(formatLine(['e4', 'e5', 'Nf3', 'Nc6'])).toBe('1. e4 e5 2. Nf3 Nc6')
  })

  it('numbers plies', () => {
    expect(moveNo(1)).toBe('1.')
    expect(moveNo(8)).toBe('4...')
  })

  it('computes the user win % from the eval or the terminal FEN', () => {
    const mid = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    expect(nodeWin({ type: 'cp', value: 100 }, mid, 'white')).toBe(59)
    expect(nodeWin({ type: 'cp', value: 100 }, mid, 'black')).toBe(41)
    expect(nodeWin(null, mid, 'white')).toBeNull()
    // White is checkmated (Fool's mate): the white user loses 0%.
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    expect(new Chess(mated).isCheckmate()).toBe(true)
    expect(nodeWin(null, mated, 'white')).toBe(0)
    expect(nodeWin(null, mated, 'black')).toBe(100)
  })
})
