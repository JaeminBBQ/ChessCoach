import { describe, expect, it } from 'vitest'

import type { GameAnalysis, PlyAnalysis } from '../analysis/game-analysis'
import type { Score } from '../engine/uci'
import { weeklyMetrics, type MetricGame } from './metrics'
import type { PlanSettings } from './types'

const DAY = 24 * 60 * 60 * 1000
// Wednesday 2026-10-28 12:00 UTC; the 8 scorecard weeks start Monday Sep 7
// and end with the week of Monday Oct 26.
const NOW = 1_793_188_800_000
const TZ = 'UTC'

const cp = (value: number): Score => ({ type: 'cp', value })
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

let nextId = 1

function game(fields: Partial<MetricGame> = {}): MetricGame {
  return {
    id: nextId++,
    playedAt: NOW,
    speed: 'rapid',
    result: 'win',
    userColor: 'white',
    userRating: null,
    opponentName: null,
    ...fields,
  }
}

function quietAnalysis(pliesCount: number, finalEval = 0): GameAnalysis {
  const plies: PlyAnalysis[] = []
  for (let ply = 0; ply < pliesCount; ply++) {
    plies.push({
      ply,
      fen: START_FEN,
      move: ply === 0 ? null : { san: 'e4', uci: 'e2e4' },
      eval: ply === pliesCount - 1 ? cp(finalEval) : cp(0),
      terminal: null,
      best: ply === 0 ? null : { uci: 'e2e4', san: 'e4', eval: cp(0) },
      second: null,
      depth: 10,
    })
  }
  return { version: 1, engine: 'test', nodes: 1, plies }
}

/** A White mistake at `ply` (win % drops ~25) and a winning position at ply 11. */
function analysisWithMistake(mistakePly: number, winning = false): GameAnalysis {
  const a = quietAnalysis(12, winning ? 1000 : 0)
  a.plies[mistakePly].move = { san: 'a3', uci: 'a2a3' }
  a.plies[mistakePly].eval = cp(-300)
  a.plies[mistakePly - 1].best = { uci: 'd2d4', san: 'd4', eval: cp(0) }
  return a
}

/** Black blunders at ply 4, White neither punishes it nor plays the best move at ply 5. */
function analysisWithMissedChance(): GameAnalysis {
  const a = quietAnalysis(12, 1000)
  a.plies[3].eval = cp(-300)
  a.plies[3].best = { uci: 'b8c6', san: 'Nc6', eval: cp(-300) }
  a.plies[4].move = { san: 'b6', uci: 'b7b6' }
  a.plies[4].eval = cp(300)
  a.plies[4].best = { uci: 'd2d4', san: 'd4', eval: cp(300) }
  a.plies[5].move = { san: 'a3', uci: 'a2a3' }
  a.plies[5].eval = cp(-400)
  return a
}

const settings: PlanSettings = { timezone: TZ, weeklyGames: 5, planSpeed: 'rapid', puzzlesPerWeek: 50 }

// The week anchors (Monday 00:00 UTC): Oct 26 is the newest row.
const W_OCT26 = 1_792_972_800_000
const W_OCT19 = W_OCT26 - 7 * DAY
const W_OCT12 = W_OCT19 - 7 * DAY

const FIXTURE_GAMES: MetricGame[] = [
  // Week of Oct 26.
  game({ playedAt: W_OCT26 + DAY + 10 * 3600_000, result: 'draw', userRating: 1500 }), // rapid draw
  game({ playedAt: W_OCT26 + 2 * DAY + 8 * 3600_000, result: 'win', userRating: 1510 }), // rapid win
  game({ playedAt: W_OCT26 + 3 * DAY + 6 * 3600_000, speed: 'blitz', result: 'loss', userRating: 1400 }), // blitz loss
  // Week of Oct 19.
  game({ playedAt: W_OCT19 + DAY + 12 * 3600_000, result: 'loss', userRating: 1490 }), // rapid loss
  // Week of Oct 12.
  game({ playedAt: W_OCT12 + DAY + 10 * 3600_000, result: 'win', userRating: 1480 }), // rapid win
  game({ playedAt: W_OCT12 + 2 * DAY, speed: 'blitz', result: 'win', userRating: 1350 }), // blitz win
]

const FIXTURE_ANALYSES = [
  { gameId: 1, analysis: analysisWithMistake(3, true) }, // draw, reached winning, not won
  { gameId: 2, analysis: analysisWithMissedChance() }, // win, reached winning, won
]

const FIXTURE_REVIEWS = [
  { gameId: 3, reviewedAt: W_OCT26 + 2 * DAY + 20 * 3600_000 },
  { gameId: 4, reviewedAt: W_OCT19 + 2 * DAY + 12 * 3600_000 },
]

const FIXTURE_DRILL_REVIEWS = [
  { reviewedAt: W_OCT26 + DAY + 10 * 3600_000 },
  { reviewedAt: W_OCT26 + 2 * DAY + 11 * 3600_000 },
]

describe('weeklyMetrics', () => {
  it('returns 8 rows, newest first, starting on the last 8 Mondays', () => {
    const rows = weeklyMetrics({ games: FIXTURE_GAMES, analyses: FIXTURE_ANALYSES, reviews: FIXTURE_REVIEWS, drillReviews: FIXTURE_DRILL_REVIEWS, settings }, TZ, NOW)
    expect(rows).toHaveLength(8)
    expect(rows.map((row) => row.weekStart)).toEqual([
      W_OCT26, W_OCT19, W_OCT12, W_OCT12 - 7 * DAY, W_OCT12 - 14 * DAY, W_OCT12 - 21 * DAY, W_OCT12 - 28 * DAY, W_OCT12 - 35 * DAY,
    ])
  })

  it('computes the current week: games by speed, score, ratings, engine metrics, puzzles, reviews, tasks', () => {
    const rows = weeklyMetrics({ games: FIXTURE_GAMES, analyses: FIXTURE_ANALYSES, reviews: FIXTURE_REVIEWS, drillReviews: FIXTURE_DRILL_REVIEWS, settings }, TZ, NOW)
    const current = rows[0]
    expect(current).toMatchObject({
      totalGames: 3,
      gamesBySpeed: { rapid: 2, blitz: 1 },
      score: 50,
      planSpeedRating: 1510, // latest rapid game as of week end
      topSpeed: 'rapid',
      topSpeedRating: 1510,
      analyzed: 2,
      puzzlesSolved: 2,
      reviewsDone: 1,
      tasksDone: 1, // review-losses only: the one loss is reviewed
      tasksTotal: 4,
    })
    expect(current.mistakesPerGame).toBeCloseTo(1, 6)
    expect(current.missedPerGame).toBeCloseTo(0.5, 6)
    expect(current.conversionPct).toBeCloseTo(50, 6)
  })

  it('shows — (null) for engine metrics without analyzed games and for empty weeks', () => {
    const rows = weeklyMetrics({ games: FIXTURE_GAMES, analyses: FIXTURE_ANALYSES, reviews: FIXTURE_REVIEWS, drillReviews: FIXTURE_DRILL_REVIEWS, settings }, TZ, NOW)
    const prev = rows[1] // Oct 19: one unanalyzed loss
    expect(prev).toMatchObject({
      totalGames: 1,
      score: 0,
      planSpeedRating: 1490,
      topSpeed: 'rapid',
      analyzed: 0,
      puzzlesSolved: 0,
      reviewsDone: 1,
    })
    expect(prev.mistakesPerGame).toBeNull()
    expect(prev.missedPerGame).toBeNull()
    expect(prev.conversionPct).toBeNull()

    const empty = rows[4] // Sep 28: no games at all
    expect(empty).toMatchObject({
      totalGames: 0,
      score: null,
      planSpeedRating: null,
      topSpeed: null,
      topSpeedRating: null,
      analyzed: 0,
      puzzlesSolved: 0,
      reviewsDone: 0,
      tasksDone: 0,
      tasksTotal: 3, // no analyze task with nothing to analyze
    })
    expect(empty.mistakesPerGame).toBeNull()
  })

  it('carries the rating at week end over from earlier weeks', () => {
    const rows = weeklyMetrics(
      { games: FIXTURE_GAMES, analyses: [], reviews: [], drillReviews: [], settings: { ...settings, planSpeed: 'blitz' } },
      TZ,
      NOW,
    )
    expect(rows[1].planSpeedRating).toBe(1350) // the blitz game from Oct 12, as of the Oct 19 week end
    expect(rows[0].planSpeedRating).toBe(1400)
    expect(rows[2].planSpeedRating).toBe(1350)
    expect(rows[3].planSpeedRating).toBeNull()
  })

  it('buckets games by playedAt at the week edges', () => {
    const edgeGames = [
      game({ playedAt: W_OCT26 - 1, result: 'win' }), // last second of Oct 19's week
      game({ playedAt: W_OCT26, result: 'win' }), // first second of Oct 26's week
    ]
    const rows = weeklyMetrics({ games: edgeGames, analyses: [], reviews: [], drillReviews: [], settings }, TZ, NOW)
    expect(rows[1].totalGames).toBe(1)
    expect(rows[0].totalGames).toBe(1)
  })

  it('counts plan tasks per week: play quota, reviewed losses, puzzles, and analysis', () => {
    const rows = weeklyMetrics({ games: FIXTURE_GAMES, analyses: FIXTURE_ANALYSES, reviews: FIXTURE_REVIEWS, drillReviews: FIXTURE_DRILL_REVIEWS, settings }, TZ, NOW)
    // Oct 12: play 1 < 5, no losses (fallback targets the rapid win, unreviewed), 0 puzzles, 2 unanalyzed.
    expect(rows[2]).toMatchObject({ tasksDone: 0, tasksTotal: 4 })
    // Oct 19: the single loss is reviewed → 1 of 4.
    expect(rows[1]).toMatchObject({ tasksDone: 1, tasksTotal: 4 })
    // Oct 26: loss reviewed, but play (2 < 5), train (2 < 50), and analyze (2 of 3) are open.
    expect(rows[0]).toMatchObject({ tasksDone: 1, tasksTotal: 4 })
  })
})
