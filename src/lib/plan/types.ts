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
}

/** A task provider returns its task, or null when it should not be shown. `buildPlan` computes `complete`. */
export type TaskProvider = (activity: PlanActivity) => Omit<PlanTask, 'complete'> | null
