import { describe, expect, it } from 'vitest'

import type { CoachGame } from '../analysis/coach'
import type { GameAnalysis, PlyAnalysis } from '../analysis/game-analysis'
import type { Score } from '../engine/uci'
import { taskProviders } from './tasks'
import {
  buildPlan,
  focusMetric,
  focusMetricForWeek,
  focusTrendSentence,
  FOCUS_MIN_ANALYZED,
  formatMetric,
  pickFocus,
  type FocusMetric,
} from './plan'
import type { PlanActivity, PlanGame, PlanSettings } from './types'
import { weekRange } from './week'

const DAY = 24 * 60 * 60 * 1000
// Wednesday 2026-10-28 12:00 UTC (weeks start Monday 2026-10-26).
const NOW = 1_793_188_800_000

const cp = (value: number): Score => ({ type: 'cp', value })

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

let nextId = 1

function coachGame(fields: Partial<CoachGame> = {}): CoachGame {
  return {
    id: nextId++,
    platform: 'lichess',
    playedAt: NOW,
    userColor: 'white',
    result: 'win',
    termination: null,
    speed: 'rapid',
    rated: true,
    userRating: null,
    opponentRating: null,
    opponentName: null,
    accountId: 1,
    pgn: '1. e4 e5 1-0',
    analysis: null,
    ...fields,
  }
}

/** Quiet plies where every move is the engine's best, ending in `finalEval`. */
function quietAnalysis(pliesCount: number, finalEval = 0, fen = START_FEN): GameAnalysis {
  const plies: PlyAnalysis[] = []
  for (let ply = 0; ply < pliesCount; ply++) {
    plies.push({
      ply,
      fen,
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

/** A user (White) mistake at `ply`: their move drops ~25 win % and the engine's best kept it. */
function withUserMistake(a: GameAnalysis, ply: number): GameAnalysis {
  a.plies[ply].move = { san: 'a3', uci: 'a2a3' }
  a.plies[ply].eval = cp(-300)
  a.plies[ply - 1].best = { uci: 'd2d4', san: 'd4', eval: cp(0) }
  return a
}

/** Opponent (Black) blunders at `ply`, then the user misses the chance at `ply + 1`. */
function withMissedChance(a: GameAnalysis, ply: number): GameAnalysis {
  // Black's move drops their win %: position goes from Black 75% to Black 25%.
  a.plies[ply - 1].eval = cp(-300)
  a.plies[ply - 1].best = { uci: 'b8c6', san: 'Nc6', eval: cp(-300) }
  a.plies[ply].move = { san: 'b6', uci: 'b7b6' }
  a.plies[ply].eval = cp(300)
  // The user's reply neither plays the best move nor punishes the blunder.
  a.plies[ply].best = { uci: 'd2d4', san: 'd4', eval: cp(300) }
  a.plies[ply + 1].move = { san: 'a3', uci: 'a2a3' }
  a.plies[ply + 1].eval = cp(-400)
  return a
}

function settings(overrides: Partial<PlanSettings> = {}): PlanSettings {
  return { timezone: 'UTC', weeklyGames: 10, planSpeed: 'rapid', puzzlesPerWeek: 50, ...overrides }
}

describe('buildPlan tasks', () => {
  const baseActivity: PlanActivity = {
    settings: settings(),
    weekGames: [],
    recentGames: [],
    analyzedIds: new Set(),
    reviewedIds: new Set(),
    drillReviews: 0,
    focus: { id: 'mistakes-middlegame', title: 'Mistakes in the middlegame', habit: 'blunder check' },
  }

  it('play task counts this week’s games at the plan speed', () => {
    const plan = buildPlan({
      ...baseActivity,
      weekGames: [
        { id: 1, playedAt: NOW, speed: 'rapid', result: 'win', opponentName: null },
        { id: 2, playedAt: NOW, speed: 'blitz', result: 'loss', opponentName: null },
        { id: 3, playedAt: NOW, speed: 'rapid', result: 'draw', opponentName: null },
      ],
    })
    const play = plan.tasks.find((task) => task.id === 'play')!
    expect(play).toMatchObject({
      title: 'Play 10 rapid games',
      target: 10,
      done: 2,
      unit: 'games',
      complete: false,
    })
    // Rapid gets the concrete time-control suggestion.
    expect(play.why).toContain('Try 10+0 or 15+10')
    // Complete once the quota is reached.
    const done = buildPlan({
      ...baseActivity,
      weekGames: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        playedAt: NOW,
        speed: 'rapid' as const,
        result: 'win' as const,
        opponentName: null,
      })),
    })
    expect(done.tasks.find((task) => task.id === 'play')!.complete).toBe(true)
  })

  it('review task targets this week’s losses, linking the unreviewed ones', () => {
    const plan = buildPlan({
      ...baseActivity,
      weekGames: [
        { id: 1, playedAt: NOW, speed: 'rapid', result: 'loss', opponentName: 'alice' },
        { id: 2, playedAt: NOW, speed: 'blitz', result: 'loss', opponentName: 'bob' },
        { id: 3, playedAt: NOW, speed: 'rapid', result: 'win', opponentName: null },
      ],
      reviewedIds: new Set([1]),
    })
    const review = plan.tasks.find((task) => task.id === 'review-losses')!
    expect(review).toMatchObject({ title: 'Review your losses', target: 2, done: 1, complete: false })
    expect(review.links).toEqual([{ href: '/games/2', label: 'vs bob' }])
  })

  it('review task falls back to the last 3 games when the week has no losses', () => {
    const plan = buildPlan({
      ...baseActivity,
      weekGames: [{ id: 1, playedAt: NOW, speed: 'rapid', result: 'win', opponentName: null }],
      recentGames: [
        { id: 9, playedAt: NOW - DAY, speed: 'blitz', result: 'loss', opponentName: 'zed' },
        { id: 8, playedAt: NOW - 2 * DAY, speed: 'blitz', result: 'win', opponentName: 'yves' },
        { id: 7, playedAt: NOW - 3 * DAY, speed: 'blitz', result: 'loss', opponentName: 'xav' },
        { id: 6, playedAt: NOW - 4 * DAY, speed: 'blitz', result: 'win', opponentName: 'wes' },
      ],
      reviewedIds: new Set([8]),
    })
    const review = plan.tasks.find((task) => task.id === 'review-losses')!
    expect(review.target).toBe(3)
    expect(review.done).toBe(1)
    expect(review.links.map((link) => link.href)).toEqual(['/games/9', '/games/7'])
  })

  it('train task counts this week’s drill reviews', () => {
    const plan = buildPlan({ ...baseActivity, drillReviews: 37 })
    expect(plan.tasks.find((task) => task.id === 'train')).toMatchObject({
      title: 'Solve 50 puzzles from your games',
      target: 50,
      done: 37,
      unit: 'puzzles',
      links: [{ href: '/train', label: 'Train' }],
      complete: false,
    })
  })

  it('analyze task is shown only while this week has unanalyzed games', () => {
    const weekGames: PlanGame[] = [
      { id: 1, playedAt: NOW, speed: 'rapid', result: 'win', opponentName: null },
      { id: 2, playedAt: NOW, speed: 'blitz', result: 'loss', opponentName: null },
    ]
    const plan = buildPlan({ ...baseActivity, weekGames, analyzedIds: new Set([1]) })
    expect(plan.tasks.find((task) => task.id === 'analyze')).toMatchObject({
      title: 'Analyze your new games',
      target: 2,
      done: 1,
      complete: false,
    })
    const allAnalyzed = buildPlan({ ...baseActivity, weekGames, analyzedIds: new Set([1, 2]) })
    expect(allAnalyzed.tasks.find((task) => task.id === 'analyze')).toBeUndefined()
  })

  it('registry: the built-in providers run in order and the focus passes through', () => {
    expect(taskProviders).toHaveLength(4)
    const plan = buildPlan({ ...baseActivity, weekGames: [{ id: 1, playedAt: NOW, speed: 'rapid', result: 'win', opponentName: null }] })
    expect(plan.tasks.map((task) => task.id)).toEqual(['play', 'review-losses', 'train', 'analyze'])
    expect(plan.focus).toEqual(baseActivity.focus)
  })
})

describe('pickFocus', () => {
  const abandoned = (playedAt: number): CoachGame =>
    coachGame({ platform: 'chesscom', playedAt, result: 'loss', termination: 'abandoned', pgn: '1. e4 e5 0-1' })

  it('uses the last 90 days when enough games are analyzed there', () => {
    // 20 quiet analyzed games in the last 90 days, plus 6 early abandons just
    // outside it. With ≥ 20 analyzed in the 90-day pool there is no fallback,
    // and the quiet pool has no findings — so the old abandons are ignored.
    const games = [
      ...Array.from({ length: 20 }, (_, i) => {
        const game = coachGame({ playedAt: NOW - i * DAY })
        game.analysis = quietAnalysis(4)
        return game
      }),
      ...Array.from({ length: 6 }, (_, i) => abandoned(NOW - 100 * DAY - i * DAY)),
    ]
    expect(pickFocus(games, NOW)).toBeNull()
  })

  it('falls back to the wider pool when the last 90 days lack analysis', () => {
    // Only 1 abandoned game in the 90 days (below the evidence gate) and the
    // rest older: the 90-day pool finds nothing, the fallback pool does.
    const games = [
      abandoned(NOW - DAY),
      ...Array.from({ length: 5 }, (_, i) => abandoned(NOW - 100 * DAY - i * DAY)),
    ]
    expect(pickFocus(games, NOW)?.id).toBe('early-abandon')
    // Sanity: the 90-day pool alone has no findings at all.
    const recent = games.filter((game) => game.playedAt >= NOW - 90 * DAY)
    expect(pickFocus(recent, NOW)).toBeNull()
    expect(recent.filter((game) => game.analysis !== null).length).toBeLessThan(FOCUS_MIN_ANALYZED)
  })
})

describe('focusMetric', () => {
  it('mistakes-*: user mistakes and blunders per analyzed game in the phase', () => {
    const game = coachGame()
    game.analysis = withUserMistake(quietAnalysis(4), 1) // ply 1 → opening
    const metric = focusMetric('mistakes-opening', [game])!
    expect(metric).toEqual({ label: 'Mistakes per game', value: 1, kind: 'perGame', sample: 1 })

    // The same move counted against middlegame only when the ply is > 20.
    const middlegame = coachGame()
    middlegame.analysis = withUserMistake(quietAnalysis(24), 21)
    expect(focusMetric('mistakes-opening', [middlegame])).toEqual({ label: 'Mistakes per game', value: 0, kind: 'perGame', sample: 1 })
    expect(focusMetric('mistakes-middlegame', [middlegame])).toEqual({ label: 'Mistakes per game', value: 1, kind: 'perGame', sample: 1 })
  })

  it('missed-chances: opponent’s blunder not punished, per analyzed game', () => {
    const game = coachGame()
    game.analysis = withMissedChance(quietAnalysis(8), 4) // Black blunders at ply 4, user replies at ply 5
    expect(focusMetric('missed-chances', [game])).toEqual({ label: 'Missed chances per game', value: 1, kind: 'perGame', sample: 1 })
  })

  it('conversion: share of winning positions (≥ 85%) not won', () => {
    const reached = coachGame({ result: 'loss' })
    reached.analysis = quietAnalysis(12, 1000) // 97.5% for White at ply 11
    const won = coachGame({ result: 'win' })
    won.analysis = quietAnalysis(12, 1000)
    const never = coachGame()
    never.analysis = quietAnalysis(12, 0)

    const metric = focusMetric('conversion', [reached, won, never])!
    expect(metric.kind).toBe('percent')
    expect(metric.value).toBeCloseTo(50, 6)
    expect(metric.sample).toBe(3)
    expect(focusMetric('conversion', [never])).toBeNull() // never reached 85%
  })

  it('abandoned-playable: losses with a playable final position, per 10 analyzed games', () => {
    const abandoned = coachGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned' })
    abandoned.analysis = quietAnalysis(10, 150) // final win 63.5% ≥ 30
    const lostAnyway = coachGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned' })
    lostAnyway.analysis = quietAnalysis(10, -400) // already lost
    const notAbandoned = coachGame({ result: 'loss', termination: 'resigned' })
    notAbandoned.analysis = quietAnalysis(10, 150)

    const metric = focusMetric('abandoned-playable', [abandoned, lostAnyway, notAbandoned])!
    expect(metric.kind).toBe('per10Games')
    expect(metric.value).toBeCloseTo(10 / 3, 6)
    expect(metric.sample).toBe(3)
  })

  it('early-abandon: abandonments within 10 of the user’s moves, per 10 games', () => {
    const early = coachGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned', pgn: '1. e4 e5 0-1' })
    const late = coachGame({ platform: 'chesscom', result: 'loss', termination: 'abandoned', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 0-1' })
    const normal = coachGame()
    const metric = focusMetric('early-abandon', [early, late, normal])!
    expect(metric.kind).toBe('per10Games')
    expect(metric.value).toBeCloseTo(10 / 3, 6)
    expect(metric.sample).toBe(3)
  })

  it('time-losses-ok-position: time losses with ≥ 50% final win chance, per 10 analyzed games', () => {
    const fine = coachGame({ result: 'loss', termination: 'outoftime' }) // Lichess time loss
    fine.analysis = quietAnalysis(10, 300) // 75.1% ≥ 50
    const alreadyLost = coachGame({ result: 'loss', termination: 'outoftime' })
    alreadyLost.analysis = quietAnalysis(10, -200)
    const metric = focusMetric('time-losses-ok-position', [fine, alreadyLost])!
    expect(metric.value).toBeCloseTo(5, 6)
    expect(metric.sample).toBe(2)
  })

  it('opening-line: the score in the line named by the finding id', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0'
    const games = [
      coachGame({ pgn, result: 'win' }),
      coachGame({ pgn, result: 'loss' }),
      coachGame({ pgn: '1. d4 d5 1-0' }),
    ]
    const metric = focusMetric('opening-line:white:e4.e5.Nf3.Nc6.Bb5.a6', games)!
    expect(metric).toEqual({ label: 'Score in this line', value: 50, kind: 'percent', sample: 2 })
    expect(focusMetric('opening-line:white:e4.e5.Nf3.Nc6.Bb5.a5', games)).toBeNull()
  })

  it('returns null when no game in the sample has an analysis', () => {
    expect(focusMetric('mistakes-opening', [coachGame()])).toBeNull()
  })

  it('focusMetricForWeek restricts to games played inside the week', () => {
    const week = weekRange(NOW, 'UTC')
    const game = coachGame()
    game.analysis = withUserMistake(quietAnalysis(4), 1)
    const old = coachGame({ playedAt: week.start - 2 * DAY })
    old.analysis = withUserMistake(quietAnalysis(4), 1)
    expect(focusMetricForWeek('mistakes-opening', [game, old], week)!.value).toBe(1)
  })
})

describe('formatMetric and focusTrendSentence', () => {
  it('formats by kind', () => {
    expect(formatMetric({ label: 'x', value: 1.25, kind: 'perGame', sample: 1 })).toBe('1.3/game')
    expect(formatMetric({ label: 'x', value: 33.6, kind: 'percent', sample: 1 })).toBe('34%')
    expect(formatMetric({ label: 'x', value: 1.25, kind: 'per10Games', sample: 1 })).toBe('1.3/10 games')
  })

  const trend = (value: number | null, sample: number) => ({ value, sample })
  const metric: FocusMetric = { label: 'Mistakes per game', value: 0, kind: 'perGame', sample: 0 }

  it('compares the last 4 weeks with the 4 before', () => {
    const weeks = [
      trend(1.2, 10), trend(1.2, 10), trend(1.1, 10), trend(1.3, 10),
      trend(0.9, 10), trend(0.9, 10), trend(null, 0), trend(0.9, 10),
    ]
    expect(focusTrendSentence(metric, weeks)).toBe('Mistakes per game: 1.2 → 0.9 over the last 4 weeks vs the 4 before.')
  })

  it('needs at least 5 analyzed games in each half', () => {
    expect(focusTrendSentence(metric, [trend(1.2, 1), trend(1.2, 1), trend(1.2, 1), trend(1.2, 1), trend(0.9, 10), trend(0.9, 10), trend(0.9, 10), trend(0.9, 10)])).toBeNull()
    expect(focusTrendSentence(metric, [trend(null, 0), trend(null, 0), trend(null, 0), trend(null, 0), trend(0.9, 5), trend(0.9, 5), trend(0.9, 5), trend(0.9, 5)])).toBeNull()
  })
})
