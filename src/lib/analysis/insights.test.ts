import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { Speed, UserColor } from '../db/schema'
import {
  byColor,
  byOpening,
  byOpeningTree,
  byRatingDiff,
  byTermination,
  firstMoves,
  ratingSeries,
  scoreOf,
  sessions,
  type InsightGame,
} from './insights'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url)), 'utf8')

const lichessGames = fixture('lichess/games-poip0i333.ndjson')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as { pgn: string })
const chesscomArchive = JSON.parse(fixture('chesscom/archive-2026-09.json')) as {
  games: { pgn: string }[]
}

function game(overrides: Partial<InsightGame>): InsightGame {
  return {
    playedAt: 1_000_000,
    userColor: 'white',
    result: 'win',
    termination: 'mate',
    speed: 'blitz',
    rated: true,
    userRating: 1200,
    opponentRating: 1200,
    accountId: 1,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
    ...overrides,
  }
}

describe('firstMoves', () => {
  it('strips headers, comments, variations, NAGs, move numbers, and the result token', () => {
    const pgn = [
      '[Event "Casual game"]',
      '[White "a"]',
      '[Black "b"]',
      '',
      '1. e4 {[%clk 0:05:00]} e5 (1... c5 2. Nf3) 2. Nf3 $14 Nc6 3. Bb5 $1 a6',
      '4. Bxc6 dxc6 5. O-O $2 Bg4 6. h3 $5 Bh5 1/2-1/2',
    ].join('\n')
    expect(firstMoves(pgn, 12)).toEqual([
      'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'Bg4', 'h3', 'Bh5',
    ])
  })

  it('drops trailing check, mate, and annotation marks so the same move groups together', () => {
    expect(firstMoves('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0', 7)).toEqual([
      'e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7',
    ])
    expect(firstMoves('1. Nf3!? d5 2. g3 $1 1-0', 3)).toEqual(['Nf3', 'd5', 'g3'])
  })

  it('reads the first 6 plies of a real Lichess PGN with clock comments', () => {
    expect(firstMoves(lichessGames[0].pgn, 6)).toEqual(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'])
  })

  it('reads the first 6 plies of a real Lichess PGN where the user is Black', () => {
    expect(firstMoves(lichessGames[1].pgn, 6)).toEqual(['e4', 'e5', 'Bc4', 'Nf6', 'd3', 'Nc6'])
  })

  it('reads the first 6 plies of a real Chess.com PGN with fractional clock comments', () => {
    expect(firstMoves(chesscomArchive.games[0].pgn, 6)).toEqual(['e4', 'c5', 'Nf3', 'Nc6', 'c3', 'e6'])
  })

  it('handles movetext with no headers and no result token', () => {
    expect(firstMoves('1. d4 Nf6 2. c4 g6', 4)).toEqual(['d4', 'Nf6', 'c4', 'g6'])
  })
})

describe('scoreOf', () => {
  it('computes score = (wins + draws/2) / n', () => {
    const games = [
      game({ result: 'win' }),
      game({ result: 'win' }),
      game({ result: 'draw' }),
      game({ result: 'loss' }),
    ]
    expect(scoreOf(games)).toEqual({ n: 4, wins: 2, losses: 1, draws: 1, score: 2.5 / 4 })
  })

  it('returns 0 when there are no games', () => {
    expect(scoreOf([])).toEqual({ n: 0, wins: 0, losses: 0, draws: 0, score: 0 })
  })
})

describe('byOpening', () => {
  const games = [
    game({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0', result: 'win' }),
    game({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1', result: 'loss' }),
    game({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0', userColor: 'black', result: 'win' }),
    game({ pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 1/2-1/2', result: 'draw' }),
    game({ pgn: '1. e4 e5 1-0', result: 'win' }), // ended before ply 6
  ]

  it('groups by color + first N plies, most played first, and skips shorter games', () => {
    const rows = byOpening(games, 6)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      color: 'white',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
      n: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      score: 0.5,
    })
    expect(rows[1]).toMatchObject({
      color: 'white',
      moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
      n: 1,
      draws: 1,
      score: 0.5,
    })
    expect(rows[2]).toMatchObject({
      color: 'black',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
      n: 1,
      wins: 1,
      score: 1,
    })
  })

  it('handles unsorted input', () => {
    expect(byOpening([...games].reverse(), 6)).toHaveLength(3)
  })
})

describe('byOpeningTree', () => {
  const games = [
    game({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0', result: 'win' }),
    game({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1', result: 'loss' }),
    game({ pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0', result: 'win' }),
  ]

  it('returns the children one ply deeper for the given color and prefix', () => {
    const rows = byOpeningTree(games, 'white', ['e4'])
    expect(rows).toEqual([
      {
        color: 'white',
        moves: ['e4', 'e5'],
        n: 2,
        wins: 1,
        losses: 1,
        draws: 0,
        score: 0.5,
      },
      {
        color: 'white',
        moves: ['e4', 'c5'],
        n: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        score: 1,
      },
    ])
    expect(byOpeningTree(games, 'white', ['e4', 'e5']).map((row) => row.moves)).toEqual([
      ['e4', 'e5', 'Nf3'],
    ])
  })

  it('returns nothing for lines no game reaches', () => {
    expect(byOpeningTree(games, 'white', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])).toEqual([])
    expect(byOpeningTree(games, 'black', ['e4'])).toEqual([])
  })
})

describe('byTermination', () => {
  it('counts and shares termination codes separately for wins and losses', () => {
    const games = [
      game({ result: 'win', termination: 'mate' }),
      game({ result: 'win', termination: 'mate' }),
      game({ result: 'win', termination: 'timeout' }),
      game({ result: 'loss', termination: 'resign' }),
      game({ result: 'loss', termination: 'timeout' }),
      game({ result: 'draw', termination: 'agreed' }), // draws are excluded
    ]
    expect(byTermination(games)).toEqual({
      wins: [
        { termination: 'mate', n: 2, share: 2 / 3 },
        { termination: 'timeout', n: 1, share: 1 / 3 },
      ],
      losses: [
        { termination: 'resign', n: 1, share: 0.5 },
        { termination: 'timeout', n: 1, share: 0.5 },
      ],
    })
  })

  it('labels a missing termination code as unknown', () => {
    const rows = byTermination([game({ result: 'win', termination: null })]).wins
    expect(rows).toEqual([{ termination: 'unknown', n: 1, share: 1 }])
  })

  it('returns empty buckets when there are no games', () => {
    expect(byTermination([])).toEqual({ wins: [], losses: [] })
  })
})

describe('byRatingDiff', () => {
  it('places every band edge in the band above it', () => {
    const edges: Array<[number, string]> = [
      [-201, '< -200'],
      [-200, '-200..-101'],
      [-101, '-200..-101'],
      [-100, '-100..-26'],
      [-26, '-100..-26'],
      [-25, '-25..25'],
      [0, '-25..25'],
      [25, '-25..25'],
      [26, '26..100'],
      [100, '26..100'],
      [101, '101..200'],
      [200, '101..200'],
      [201, '> 200'],
    ]
    const games = edges.map(([diff], i) =>
      game({ playedAt: i, userRating: 1200, opponentRating: 1200 + diff, result: 'win' }),
    )
    const rows = byRatingDiff(games)
    expect(rows.map((row) => row.label)).toEqual([
      '< -200', '-200..-101', '-100..-26', '-25..25', '26..100', '101..200', '> 200',
    ])
    const byLabel = new Map(rows.map((row) => [row.label, row]))
    expect(byLabel.get('< -200')).toMatchObject({ n: 1, wins: 1, score: 1 })
    expect(byLabel.get('-200..-101')).toMatchObject({ n: 2 })
    expect(byLabel.get('-100..-26')).toMatchObject({ n: 2 })
    expect(byLabel.get('-25..25')).toMatchObject({ n: 3 })
    expect(byLabel.get('26..100')).toMatchObject({ n: 2 })
    expect(byLabel.get('101..200')).toMatchObject({ n: 2 })
    expect(byLabel.get('> 200')).toMatchObject({ n: 1 })
  })

  it('skips games missing either rating and still returns every band', () => {
    const rows = byRatingDiff([
      game({ userRating: null, result: 'win' }),
      game({ opponentRating: null, result: 'loss' }),
    ])
    expect(rows).toHaveLength(7)
    expect(rows.every((row) => row.n === 0)).toBe(true)
  })
})

describe('sessions', () => {
  const MIN = 60_000
  const games = [
    game({ playedAt: 0, result: 'win' }),
    game({ playedAt: 10 * MIN, result: 'loss' }),
    game({ playedAt: 20 * MIN, result: 'draw' }), // 10-min gaps stay in one session
    game({ playedAt: 41 * MIN, result: 'win' }), // 21-min gap starts a new session
    game({ playedAt: 51 * MIN, result: 'loss' }),
  ]

  it('splits on gaps larger than gapMinutes and buckets by game index', () => {
    const stats = sessions(games)
    expect(stats.sessionCount).toBe(2)
    expect(stats.avgGamesPerSession).toBe(2.5)
    const buckets = new Map(stats.byGameIndex.map((bucket) => [bucket.label, bucket]))
    expect(buckets.get('1')).toMatchObject({ n: 2, wins: 2, score: 1 })
    expect(buckets.get('2')).toMatchObject({ n: 2, losses: 2, score: 0 })
    expect(buckets.get('3')).toMatchObject({ n: 1, draws: 1, score: 0.5 })
    expect(buckets.get('4–6')).toMatchObject({ n: 0 })
    expect(buckets.get('7+')).toMatchObject({ n: 0 })
  })

  it('scores the game after each result within the same session only', () => {
    const { afterResult } = sessions(games)
    // After game 1 (win) comes a loss, and after game 4 (win, new session) comes a loss.
    expect(afterResult.afterWin).toMatchObject({ n: 2, losses: 2, score: 0 })
    // After game 2 (loss) comes a draw; after game 5 (loss) nothing follows.
    expect(afterResult.afterLoss).toMatchObject({ n: 1, draws: 1, score: 0.5 })
    // The only draw is followed by a new session's first game, which is excluded.
    expect(afterResult.afterDraw).toMatchObject({ n: 0 })
  })

  it('treats a gap of exactly gapMinutes as the same session', () => {
    const stats = sessions([game({ playedAt: 0 }), game({ playedAt: 20 * MIN })])
    expect(stats.sessionCount).toBe(1)
  })

  it('handles unsorted input', () => {
    expect(sessions([...games].reverse()).sessionCount).toBe(2)
  })

  it('returns zeros for an empty list', () => {
    expect(sessions([])).toEqual({
      sessionCount: 0,
      avgGamesPerSession: 0,
      byGameIndex: [
        { label: '1', n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        { label: '2', n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        { label: '3', n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        { label: '4–6', n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        { label: '7+', n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
      ],
      afterResult: {
        afterWin: { n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        afterLoss: { n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
        afterDraw: { n: 0, wins: 0, losses: 0, draws: 0, score: 0 },
      },
    })
  })
})

describe('ratingSeries', () => {
  it('groups rated games with ratings by account + speed and sorts points by time', () => {
    const games = [
      game({ accountId: 1, speed: 'blitz', playedAt: 300, userRating: 1050 }),
      game({ accountId: 1, speed: 'blitz', playedAt: 100, userRating: 1000 }),
      game({ accountId: 1, speed: 'rapid', playedAt: 200, userRating: 900 }),
      game({ accountId: 2, speed: 'blitz', playedAt: 200, userRating: 1100 }),
      game({ accountId: 1, speed: 'blitz', playedAt: 500, rated: false, userRating: 1060 }), // casual
      game({ accountId: 1, speed: 'blitz', playedAt: 600, userRating: null }), // no rating
    ]
    const series = ratingSeries(games)
    expect(series).toEqual([
      { accountId: 1, speed: 'blitz', points: [{ t: 100, rating: 1000 }, { t: 300, rating: 1050 }] },
      { accountId: 1, speed: 'rapid', points: [{ t: 200, rating: 900 }] },
      { accountId: 2, speed: 'blitz', points: [{ t: 200, rating: 1100 }] },
    ])
  })

  it('downsamples long series to 200 points, keeping the last game of each bucket', () => {
    const games = Array.from({ length: 210 }, (_, i) =>
      game({ playedAt: i, userRating: i + 1, accountId: 1, speed: 'blitz' }),
    )
    const [series] = ratingSeries(games)
    expect(series.points).toHaveLength(200)
    expect(series.points[0]).toEqual({ t: 0, rating: 1 })
    expect(series.points[199]).toEqual({ t: 209, rating: 210 })
  })
})

describe('byColor', () => {
  it('scores white and black separately', () => {
    const games = [
      game({ userColor: 'white', result: 'win' }),
      game({ userColor: 'white', result: 'loss' }),
      game({ userColor: 'black', result: 'draw' }),
    ]
    expect(byColor(games)).toEqual({
      white: { n: 2, wins: 1, losses: 1, draws: 0, score: 0.5 },
      black: { n: 1, wins: 0, losses: 0, draws: 1, score: 0.5 },
    })
  })
})

describe('performance', () => {
  it('aggregates 6,000 games in under 500 ms', () => {
    const pgns = [
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0',
      '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 0-1',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 1/2-1/2',
      '1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 4. Nxc6 dxc6 0-1',
    ]
    const results = ['win', 'loss', 'draw'] as const
    const speeds = ['blitz', 'rapid'] as Speed[]
    const colors = ['white', 'black'] as UserColor[]
    const codes = ['mate', 'resign', 'timeout', 'agreed']
    const games = Array.from({ length: 6000 }, (_, i) =>
      game({
        playedAt: i * 60_000,
        userColor: colors[i % 2],
        result: results[i % 3],
        termination: codes[i % 4],
        speed: speeds[i % 2],
        userRating: 1200 + (i % 400),
        opponentRating: 1200 + (i % 500),
        accountId: (i % 3) + 1,
        pgn: pgns[i % pgns.length],
      }),
    )
    const start = performance.now()
    byOpening(games, 6)
    sessions(games)
    byTermination(games)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})
