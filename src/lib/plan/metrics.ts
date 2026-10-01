import { classifyMoves } from '../analysis/classify'
import { winningPeak } from '../analysis/coach'
import type { GameAnalysis } from '../analysis/game-analysis'
import type { Motif } from '../analysis/motifs'
import type { TopPattern } from '../analysis/patterns'
import { speeds, type Result, type Speed } from '../db/schema'
import { buildPlan, patternFocusMetric } from './plan'
import type { PlanSettings } from './types'
import { weekRange, lastNWeeks } from './week'

/** The game fields the scorecard needs. */
export interface MetricGame {
  id: number
  playedAt: number
  speed: Speed
  result: Result
  userColor: 'white' | 'black'
  userRating: number | null
  opponentName: string | null
}

export interface WeeklyMetricsArgs {
  games: MetricGame[]
  analyses: { gameId: number; analysis: GameAnalysis }[]
  reviews: { gameId: number; reviewedAt: number }[]
  drillReviews: { reviewedAt: number }[]
  settings: PlanSettings
  /** The current focus's top pattern (finding id + motif), for the pattern column. */
  pattern: { focusId: string; motif: Motif } | null
  /** Each week's stored plan pattern, for that week's manual task in the x/y count. */
  plans: { weekStart: number; pattern: TopPattern | null }[]
  /** Manual Done checks, per week. */
  taskChecks: { weekStart: number; taskId: string }[]
}

export interface WeekRow {
  /** Monday 00:00 in the user's time zone. */
  weekStart: number
  end: number
  totalGames: number
  gamesBySpeed: Partial<Record<Speed, number>>
  /** (wins + 0.5 draws) / n as a percent, or null when no games. */
  score: number | null
  /** The user's rating in the plan speed as of the end of the week. */
  planSpeedRating: number | null
  /** The week's most-played speed, and the rating in it as of week end. */
  topSpeed: Speed | null
  topSpeedRating: number | null
  analyzed: number
  /** User mistakes + blunders per analyzed game; null when none analyzed. */
  mistakesPerGame: number | null
  missedPerGame: number | null
  /** Share of winning positions (win % ≥ 85) not won; null when none reached. */
  conversionPct: number | null
  /** The focus's top pattern per analyzed game; null when there is none. */
  patternPerGame: number | null
  puzzlesSolved: number
  reviewsDone: number
  tasksDone: number
  tasksTotal: number
}

/**
 * One row per week, newest first. Engine metrics read null ("—") when the
 * week has no analyzed games; tasks are re-evaluated per week with the
 * current settings (historical settings aren't stored).
 */
export function weeklyMetrics(args: WeeklyMetricsArgs, timezone: string, now: number): WeekRow[] {
  const analysisByGame = new Map(args.analyses.map((entry) => [entry.gameId, entry.analysis]))
  const starts = lastNWeeks(now, timezone, 8)

  return starts
    .map((weekStart) => rowForWeek(args, analysisByGame, timezone, weekStart))
    .reverse()
}

function rowForWeek(
  args: WeeklyMetricsArgs,
  analysisByGame: Map<number, GameAnalysis>,
  timezone: string,
  weekStart: number,
): WeekRow {
  const { start, end } = weekRange(weekStart, timezone)
  const weekGames = args.games.filter((game) => game.playedAt >= start && game.playedAt < end)

  const gamesBySpeed: Partial<Record<Speed, number>> = {}
  for (const game of weekGames) gamesBySpeed[game.speed] = (gamesBySpeed[game.speed] ?? 0) + 1
  let topSpeed: Speed | null = null
  let topCount = 0
  for (const speed of speeds) {
    const n = gamesBySpeed[speed] ?? 0
    if (n > topCount) {
      topSpeed = speed
      topCount = n
    }
  }

  const score =
    weekGames.length === 0
      ? null
      : ((weekGames.filter((game) => game.result === 'win').length +
          weekGames.filter((game) => game.result === 'draw').length * 0.5) /
          weekGames.length) *
        100

  const analyzedGames = weekGames.filter((game) => analysisByGame.has(game.id))

  let mistakes = 0
  let missed = 0
  let winningReached = 0
  let winningNotWon = 0
  for (const game of analyzedGames) {
    const judgements = classifyMoves(analysisByGame.get(game.id)!)
    const byPly = new Map(judgements.map((j) => [j.ply, j]))
    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      if (j.judgement === 'mistake' || j.judgement === 'blunder') mistakes++
      const previous = byPly.get(j.ply - 1)
      if (previous !== undefined && previous.drop >= 20 && j.judgement !== 'best' && j.drop >= 10) missed++
    }
    if (winningPeak(analysisByGame.get(game.id)!, game.userColor) !== null) {
      winningReached++
      if (game.result !== 'win') winningNotWon++
    }
  }

  const puzzlesSolved = args.drillReviews.filter((r) => r.reviewedAt >= start && r.reviewedAt < end).length
  const reviewsDone = args.reviews.filter((r) => r.reviewedAt >= start && r.reviewedAt < end).length

  // Task completion for this week, as buildPlan would show it: the review
  // task counts only reviews made before the week ended, the manual Lichess
  // task comes from that week's stored plan pattern and its Done check.
  const weekPattern = args.plans.find((entry) => entry.weekStart === weekStart)?.pattern ?? null
  const plan = buildPlan({
    settings: args.settings,
    weekGames,
    recentGames: [...args.games]
      .filter((game) => game.playedAt <= end)
      .sort((a, b) => b.playedAt - a.playedAt || b.id - a.id)
      .slice(0, 3),
    analyzedIds: new Set(analyzedGames.map((game) => game.id)),
    reviewedIds: new Set(
      args.reviews.filter((review) => review.reviewedAt <= end).map((review) => review.gameId),
    ),
    drillReviews: puzzlesSolved,
    focus: null,
    pattern: weekPattern,
    manualChecks: new Set(
      args.taskChecks.filter((check) => check.weekStart === weekStart).map((check) => check.taskId),
    ),
  })

  return {
    weekStart,
    end,
    totalGames: weekGames.length,
    gamesBySpeed,
    score,
    planSpeedRating: ratingAtEnd(args.games, args.settings.planSpeed, end),
    topSpeed,
    topSpeedRating: topSpeed === null ? null : ratingAtEnd(args.games, topSpeed, end),
    analyzed: analyzedGames.length,
    mistakesPerGame: analyzedGames.length === 0 ? null : mistakes / analyzedGames.length,
    missedPerGame: analyzedGames.length === 0 ? null : missed / analyzedGames.length,
    conversionPct: winningReached === 0 ? null : (winningNotWon / winningReached) * 100,
    patternPerGame:
      args.pattern === null
        ? null
        : patternFocusMetric(
            args.pattern.focusId,
            args.pattern.motif,
            analyzedGames.map((game) => ({
              userColor: game.userColor,
              analysis: analysisByGame.get(game.id)!,
            })),
          )?.value ?? null,
    puzzlesSolved,
    reviewsDone,
    tasksDone: plan.tasks.filter((task) => task.complete).length,
    tasksTotal: plan.tasks.length,
  }
}

/** The user's rating in `speed` as of `end`: the latest rated game at or before it. */
function ratingAtEnd(games: MetricGame[], speed: Speed, end: number): number | null {
  let best: MetricGame | undefined
  for (const game of games) {
    if (game.speed !== speed || game.userRating === null || game.playedAt > end) continue
    if (best === undefined || game.playedAt > best.playedAt) best = game
  }
  return best?.userRating ?? null
}
