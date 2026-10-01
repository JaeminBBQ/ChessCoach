import type { TopPattern } from '../analysis/patterns'
import type { Result, Speed } from '../db/schema'

// Types shared by the plan builder, the task providers, and the scorecard.

export interface PlanSettings {
  timezone: string
  weeklyGames: number
  planSpeed: Speed
  puzzlesPerWeek: number
}

/** The game fields the plan tasks need. */
export interface PlanGame {
  id: number
  playedAt: number
  speed: Speed
  result: Result
  opponentName: string | null
}

export interface PlanTask {
  id: string
  title: string
  why: string
  target: number
  done: number
  unit: string
  links: { href: string; label: string }[]
  /** done >= target. */
  complete: boolean
  /** Manual tasks (the only one so far: Lichess puzzles) complete via a Done toggle. */
  manual?: boolean
}

export interface FocusInfo {
  id: string
  title: string
  habit: string
}

/** The week's activity: everything `buildPlan` reads to compute `done`. */
export interface PlanActivity {
  settings: PlanSettings
  /** This week's games, any order. */
  weekGames: PlanGame[]
  /** The most recent games overall, newest first (the loss-review fallback). */
  recentGames: PlanGame[]
  analyzedIds: ReadonlySet<number>
  reviewedIds: ReadonlySet<number>
  /** Drill reviews this week. */
  drillReviews: number
  focus: FocusInfo | null
  /** The focus's top pattern, when the focus is mistakes-* or missed-chances. */
  pattern: TopPattern | null
  /** Task ids whose manual Done toggle is checked this week. */
  manualChecks: ReadonlySet<string>
}

/** A task provider returns its task, or null when it should not be shown. `buildPlan` computes `complete`. */
export type TaskProvider = (activity: PlanActivity) => Omit<PlanTask, 'complete'> | null
