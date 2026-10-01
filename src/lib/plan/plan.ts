import { classifyMoves, positionWin } from '../analysis/classify'
import {
  coach,
  isAbandonedLoss,
  isMissedChance,
  isTimeLoss,
  phaseAt,
  userMoveCount,
  winningPeak,
  type CoachGame,
  type Finding,
} from '../analysis/coach'
import type { GameAnalysis } from '../analysis/game-analysis'
import { byOpening } from '../analysis/insights'
import type { Motif } from '../analysis/motifs'
import { MOTIF_METRIC_LABEL, patternCounts, type PatternGame } from '../analysis/patterns'
import { taskProviders } from './tasks'
import type { WeekRange } from './week'
import type { FocusInfo, PlanActivity, PlanTask } from './types'

export { taskProviders } from './tasks'
export type { FocusInfo, PlanActivity, PlanSettings, PlanTask } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000

/** The focus comes from the last 90 days, falling back to the wider pool (1y) when fewer are analyzed. */
export const FOCUS_MIN_ANALYZED = 20

/** A week's focus metric reads "not enough games yet" below this many analyzed games. */
export const FOCUS_MIN_WEEK_ANALYZED = 5

export interface Plan {
  focus: FocusInfo | null
  tasks: PlanTask[]
}

/** Builds the week's task list; `done` comes from data (or a manual toggle), never from checkboxes. */
export function buildPlan(activity: PlanActivity): Plan {
  const tasks = taskProviders
    .map((provider) => provider(activity))
    .filter((task) => task !== null)
    .map((task) => ({
      ...task,
      complete: task.manual === true ? task.done > 0 : task.target > 0 && task.done >= task.target,
    }))
  return { focus: activity.focus, tasks }
}

/** The top Coach finding over the last 90 days, or the wider pool when 90 days lacks analysis. */
export function pickFocus(games: readonly CoachGame[], now: number): Finding | null {
  const recent = games.filter((game) => game.playedAt >= now - 90 * DAY_MS)
  const analyzed = recent.filter((game) => game.analysis !== null).length
  const pool = analyzed >= FOCUS_MIN_ANALYZED ? recent : games
  return coach(pool).findings[0] ?? null
}

export type MetricKind = 'perGame' | 'percent' | 'per10Games'

export interface FocusMetric {
  /** Short label, e.g. "Mistakes per game". */
  label: string
  value: number
  kind: MetricKind
  /** The denominator the value is computed over (analyzed games, or all games for early-abandon). */
  sample: number
}

export function metricLabel(findingId: string): string {
  if (findingId.startsWith('mistakes-')) return 'Mistakes per game'
  if (findingId === 'missed-chances') return 'Missed chances per game'
  if (findingId === 'conversion') return 'Converting winning positions'
  if (findingId === 'abandoned-playable') return 'Playable games abandoned'
  if (findingId === 'early-abandon') return 'Games abandoned early'
  if (findingId === 'time-losses-ok-position') return 'Time losses in fine positions'
  if (findingId.startsWith('opening-line:')) return 'Score in this line'
  return findingId
}

/**
 * The focus metric for a finding id over a set of games, or null when the
 * denominator is empty. The detectors mirror `coach.ts` (same phase rule,
 * missed-chance rule, and termination codes) so the focus tracks the Coach
 * findings exactly; see the report for the drift note.
 */
export function focusMetric(findingId: string, games: readonly CoachGame[]): FocusMetric | null {
  if (findingId.startsWith('mistakes-')) {
    const phase = findingId.slice('mistakes-'.length) as Phase
    return perAnalyzed(`Mistakes per game`, mistakesInPhase(games, phase), games, 'perGame')
  }
  if (findingId === 'missed-chances') {
    return perAnalyzed(metricLabel(findingId), missedChances(games), games, 'perGame')
  }
  if (findingId === 'conversion') {
    const { reached, notWon, analyzed } = conversions(games)
    if (analyzed === 0 || reached === 0) return null
    return { label: metricLabel(findingId), value: (notWon / reached) * 100, kind: 'percent', sample: analyzed }
  }
  if (findingId === 'abandoned-playable' || findingId === 'time-losses-ok-position') {
    const isLoss = findingId === 'abandoned-playable' ? isAbandonedLoss : isTimeLoss
    const threshold = findingId === 'abandoned-playable' ? 30 : 50
    const count = analyzedGames(games).filter((game) => isLoss(game) && userWinAtFinal(game) >= threshold).length
    const analyzed = analyzedCount(games)
    return analyzed === 0 ? null : { label: metricLabel(findingId), value: (count / analyzed) * 10, kind: 'per10Games', sample: analyzed }
  }
  if (findingId === 'early-abandon') {
    if (games.length === 0) return null
    const count = games.filter((game) => isAbandonedLoss(game) && userMoveCount(game) <= 10).length
    return { label: metricLabel(findingId), value: (count / games.length) * 10, kind: 'per10Games', sample: games.length }
  }
  if (findingId.startsWith('opening-line:')) {
    const [, color, moves] = findingId.split(':')
    const line = moves.split('.')
    const row = byOpening(games, 6).find((candidate) => candidate.color === color && sameMoves(candidate.moves, line))
    if (!row || row.n === 0) return null
    return { label: metricLabel(findingId), value: row.score * 100, kind: 'percent', sample: row.n }
  }
  return null
}

export function formatMetric(metric: FocusMetric): string {
  if (metric.kind === 'percent') return `${Math.round(metric.value)}%`
  return `${metric.value.toFixed(1)}${metric.kind === 'perGame' ? '/game' : '/10 games'}`
}

/** The focus metric over the games played inside one week range. */
export function focusMetricForWeek(findingId: string, games: readonly CoachGame[], week: WeekRange): FocusMetric | null {
  return focusMetric(findingId, games.filter((game) => game.playedAt >= week.start && game.playedAt < week.end))
}

/**
 * The focus's top pattern as a per-analyzed-game metric (e.g. "Hanging pieces/game"),
 * using the same detectors as the Coach pattern tables. Null when nothing is analyzed.
 */
export function patternFocusMetric(
  findingId: string,
  motif: Motif,
  games: readonly PatternGame[],
): FocusMetric | null {
  const analyzed = games.filter((game) => game.analysis !== null).length
  if (analyzed === 0) return null
  const count = patternCounts(findingId, games).get(motif) ?? 0
  return { label: `${MOTIF_METRIC_LABEL[motif]}/game`, value: count / analyzed, kind: 'perGame', sample: analyzed }
}

export interface TrendPoint {
  value: number | null
  sample: number
}

/**
 * "Mistakes per game: 1.2 → 0.9 over the last 4 weeks vs the 4 before." —
 * null when either half has fewer than 5 analyzed games behind it. `weeks`
 * is oldest first.
 */
export function focusTrendSentence(metric: FocusMetric, weeks: readonly TrendPoint[]): string | null {
  const half = (points: readonly TrendPoint[]) => {
    const withData = points.filter((point) => point.value !== null)
    return {
      sample: withData.reduce((sum, point) => sum + point.sample, 0),
      values: withData.map((point) => point.value!),
    }
  }
  const recent = half(weeks.slice(4))
  const previous = half(weeks.slice(0, 4))
  if (recent.sample < FOCUS_MIN_WEEK_ANALYZED || previous.sample < FOCUS_MIN_WEEK_ANALYZED) return null
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return `${metric.label}: ${formatValue(metric.kind, avg(previous.values))} → ${formatValue(metric.kind, avg(recent.values))} over the last 4 weeks vs the 4 before.`
}

/** Formats a metric value inside the trend sentence; labels already carry "per game". */
function formatValue(kind: MetricKind, value: number): string {
  if (kind === 'percent') return `${Math.round(value)}%`
  return kind === 'perGame' ? value.toFixed(1) : `${value.toFixed(1)} per 10 games`
}

function perAnalyzed(label: string, count: number, games: readonly CoachGame[], kind: MetricKind): FocusMetric | null {
  const analyzed = analyzedCount(games)
  if (analyzed === 0) return null
  return { label, value: count / analyzed, kind, sample: analyzed }
}

// --- Focus metric detectors (phase rule, missed-chance rule, conversion
// peak, and termination codes all come from coach.ts) ---

type Phase = 'opening' | 'middlegame' | 'endgame'

function analyzedCount(games: readonly CoachGame[]): number {
  return games.filter((game) => game.analysis !== null).length
}

function analyzedGames(games: readonly CoachGame[]): CoachGame[] {
  return games.filter((game) => game.analysis !== null) as CoachGame[]
}

function userWinAt(a: GameAnalysis, ply: number, userColor: 'white' | 'black'): number | null {
  const white = positionWin(a.plies[ply])
  if (white === null) return null
  return userColor === 'white' ? white : 100 - white
}

function userWinAtFinal(game: CoachGame): number {
  const a = game.analysis!
  return userWinAt(a, a.plies.length - 1, game.userColor) ?? 0
}

function mistakesInPhase(games: readonly CoachGame[], phase: Phase): number {
  let count = 0
  for (const game of analyzedGames(games)) {
    const judgements = classifyMoves(game.analysis!)
    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      if ((j.judgement === 'mistake' || j.judgement === 'blunder') && phaseAt(game.analysis!.plies[j.ply - 1].fen, j.ply) === phase) count++
    }
  }
  return count
}

function missedChances(games: readonly CoachGame[]): number {
  let count = 0
  for (const game of analyzedGames(games)) {
    const judgements = classifyMoves(game.analysis!)
    const byPly = new Map(judgements.map((j) => [j.ply, j]))
    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      if (isMissedChance(byPly.get(j.ply - 1), j)) count++
    }
  }
  return count
}

/** Games that reached a winning position (win % ≥ 85 after ply 10), and of those, the ones not won. */
function conversions(games: readonly CoachGame[]): { reached: number; notWon: number; analyzed: number } {
  let reached = 0
  let notWon = 0
  let analyzed = 0
  for (const game of analyzedGames(games)) {
    analyzed++
    if (winningPeak(game.analysis!, game.userColor) !== null) {
      reached++
      if (game.result !== 'win') notWon++
    }
  }
  return { reached, notWon, analyzed }
}

function sameMoves(moves: readonly string[], line: readonly string[]): boolean {
  if (moves.length < line.length) return false
  for (let i = 0; i < line.length; i++) {
    if (moves[i] !== line[i]) return false
  }
  return true
}
