import { and, count, desc, eq, gte } from 'drizzle-orm'

import type { CoachGame } from '../analysis/coach'
import type { Motif } from '../analysis/motifs'
import { topPattern } from '../analysis/patterns'
import type { getDb } from '../db/client'
import { drillReviews, gameReviews, games, plans, planTaskChecks, userSettings, type Result, type Speed } from '../db/schema'
import { focusMetric, patternFocusMetric, pickFocus, type FocusMetric } from '../plan/plan'
import { lastNWeeks, weekRange, type WeekRange } from '../plan/week'

type Db = ReturnType<typeof getDb>

export interface PlanSettingsRow {
  timezone: string
  weeklyGames: number
  planSpeed: Speed
  puzzlesPerWeek: number
  updatedAt: number
}

export const DEFAULT_SETTINGS = {
  timezone: 'America/Los_Angeles',
  weeklyGames: 10,
  planSpeed: 'rapid',
  puzzlesPerWeek: 50,
} as const

/** The user's plan settings, created with defaults on first read. */
export function getSettings(db: Db, userId: number, now = Date.now()): PlanSettingsRow {
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get()
  if (existing) return existing
  const row: PlanSettingsRow = { ...DEFAULT_SETTINGS, updatedAt: now }
  db.insert(userSettings).values({ userId, ...row }).run()
  return row
}

export interface SettingsPatch {
  timezone?: string
  weeklyGames?: number
  planSpeed?: Speed
  puzzlesPerWeek?: number
}

export function updateSettings(db: Db, userId: number, patch: SettingsPatch, now = Date.now()): void {
  db.update(userSettings)
    .set({ ...patch, updatedAt: now })
    .where(eq(userSettings.userId, userId))
    .run()
}

/** True when `timezone` is a valid IANA zone. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

// --- Game reviews -----------------------------------------------------------

export type ReviewResult = { ok: true; reviewedAt: number } | { ok: false; status: 404; error: string }

/**
 * Marks a game reviewed, idempotently: the first call writes the row, later
 * calls (or concurrent ones, via the unique index) return the same timestamp.
 */
export function markReviewed(db: Db, userId: number, gameId: number, now = Date.now()): ReviewResult {
  const game = db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.userId, userId)))
    .get()
  if (!game) return { ok: false, status: 404, error: 'Game not found' }

  db.insert(gameReviews).values({ userId, gameId, reviewedAt: now }).onConflictDoNothing().run()
  const row = db
    .select({ reviewedAt: gameReviews.reviewedAt })
    .from(gameReviews)
    .where(and(eq(gameReviews.gameId, gameId), eq(gameReviews.userId, userId)))
    .get()
  return row ? { ok: true, reviewedAt: row.reviewedAt } : { ok: false, status: 404, error: 'Game not found' }
}

/** The review timestamp, or null when the game belongs to the user but isn't reviewed. */
export function getReview(db: Db, userId: number, gameId: number): number | null {
  return (
    db
      .select({ reviewedAt: gameReviews.reviewedAt })
      .from(gameReviews)
      .where(and(eq(gameReviews.gameId, gameId), eq(gameReviews.userId, userId)))
      .get()?.reviewedAt ?? null
  )
}

/** Every review of the user's games since `since` (gameId → reviewedAt). */
export function listReviews(db: Db, userId: number, since: number): { gameId: number; reviewedAt: number }[] {
  return db
    .select({ gameId: gameReviews.gameId, reviewedAt: gameReviews.reviewedAt })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), gte(gameReviews.reviewedAt, since)))
    .all()
}

// --- Drill reviews ----------------------------------------------------------

/** Drill review timestamps since `since`, for weekly bucketing. */
export function listDrillReviews(db: Db, userId: number, since: number): { reviewedAt: number }[] {
  return db
    .select({ reviewedAt: drillReviews.reviewedAt })
    .from(drillReviews)
    .where(and(eq(drillReviews.userId, userId), gte(drillReviews.reviewedAt, since)))
    .all()
}

/** Drill reviews this week, for the train task. */
export function drillReviewsThisWeek(db: Db, userId: number, week: WeekRange): number {
  const row = db
    .select({ n: count() })
    .from(drillReviews)
    .where(and(eq(drillReviews.userId, userId), gte(drillReviews.reviewedAt, week.start)))
    .get()
  return row?.n ?? 0
}

// --- Weekly plan (focus, fixed per week) ------------------------------------

export interface StoredPattern {
  motif: Motif
  label: string
  count: number
  theme: string | null
  themeUrl: string | null
  /** The pattern metric over the previous 4 weeks, null when there was no data. */
  metric: FocusMetric | null
}

export interface StoredBaseline {
  /** The focus snapshot (id, title, habit), null when the week had no findings. */
  focus: { id: string; title: string; habit: string } | null
  /** The focus metric over the previous 4 weeks, null when there was no data. */
  metric: FocusMetric | null
  /** The focus's top pattern, when the focus is mistakes-* or missed-chances. */
  pattern: StoredPattern | null
}

export interface PlanRow {
  id: number
  userId: number
  weekStart: number
  focusId: string | null
  baseline: StoredBaseline
  createdAt: number
}

const isPatternFinding = (findingId: string): boolean =>
  findingId.startsWith('mistakes-') || findingId === 'missed-chances'

/**
 * The week's plan row: computes and stores the focus (and its baseline over
 * the previous 4 weeks) on first read, so it stays fixed for the week. Rows
 * stored before T006b get their pattern snapshot backfilled the same way —
 * the inputs (previous 4 weeks, the 1-year pool) are stable, so the value
 * can't drift.
 */
export function getOrCreatePlan(
  db: Db,
  userId: number,
  weekStart: number,
  games: readonly CoachGame[],
  timezone: string,
  now = Date.now(),
): PlanRow {
  const existing = db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.weekStart, weekStart)))
    .get()
  if (existing) {
    const baseline = JSON.parse(existing.baseline) as StoredBaseline
    if (baseline.pattern === undefined && baseline.focus !== null && isPatternFinding(baseline.focus.id)) {
      baseline.pattern = computePattern(baseline.focus.id, games, weekStart, timezone)
      db.update(plans).set({ baseline: JSON.stringify(baseline) }).where(eq(plans.id, existing.id)).run()
    }
    return { ...existing, baseline }
  }

  const focus = pickFocus(games, now)
  const metric = focus === null ? null : baselineFor(games, weekStart, timezone, focus.id)
  const pattern = focus !== null && isPatternFinding(focus.id) ? computePattern(focus.id, games, weekStart, timezone) : null
  const baseline: StoredBaseline = {
    focus: focus === null ? null : { id: focus.id, title: focus.title, habit: focus.training },
    metric,
    pattern,
  }
  const row = {
    userId,
    weekStart,
    focusId: focus?.id ?? null,
    baseline: JSON.stringify(baseline),
    createdAt: now,
  }
  const inserted = db.insert(plans).values(row).returning({ id: plans.id }).get()
  return { ...row, id: inserted.id, baseline }
}

/** The focus's top pattern in the 1-year pool, with its previous-4-weeks baseline metric. */
function computePattern(
  focusId: string,
  games: readonly CoachGame[],
  weekStart: number,
  timezone: string,
): StoredPattern | null {
  const top = topPattern(focusId, games)
  if (top === null) return null
  const metric = patternFocusMetric(focusId, top.motif, baselineGames(games, weekStart, timezone))
  return { motif: top.motif, label: top.label, count: top.count, theme: top.theme, themeUrl: top.themeUrl, metric }
}

/** The focus metric over the 4 weeks before the plan's week. */
function baselineFor(
  games: readonly CoachGame[],
  weekStart: number,
  timezone: string,
  findingId: string,
): FocusMetric | null {
  return focusMetric(findingId, baselineGames(games, weekStart, timezone))
}

function baselineGames(games: readonly CoachGame[], weekStart: number, timezone: string): CoachGame[] {
  const weeks = lastNWeeks(weekStart, timezone, 5).slice(0, 4)
  const inBaseline = (playedAt: number) => {
    for (const start of weeks) {
      const week = weekRange(start, timezone)
      if (playedAt >= week.start && playedAt < week.end) return true
    }
    return false
  }
  return games.filter((game) => inBaseline(game.playedAt))
}

// --- Manual task checks -----------------------------------------------------

/** The task ids checked this week (the manual Done toggles). */
export function taskChecksForWeek(db: Db, userId: number, weekStart: number): Set<string> {
  const rows = db
    .select({ taskId: planTaskChecks.taskId })
    .from(planTaskChecks)
    .where(and(eq(planTaskChecks.userId, userId), eq(planTaskChecks.weekStart, weekStart)))
    .all()
  return new Set(rows.map((row) => row.taskId))
}

/** All manual checks since `since`, for the scorecard's per-week task counts. */
export function listTaskChecks(db: Db, userId: number, since: number): { weekStart: number; taskId: string }[] {
  return db
    .select({ weekStart: planTaskChecks.weekStart, taskId: planTaskChecks.taskId })
    .from(planTaskChecks)
    .where(and(eq(planTaskChecks.userId, userId), gte(planTaskChecks.weekStart, since)))
    .all()
}

/** Toggles a manual task's Done check for the week: checked ↔ unchecked. */
export function toggleTaskCheck(db: Db, userId: number, weekStart: number, taskId: string, now = Date.now()): void {
  const existing = db
    .select({ id: planTaskChecks.id })
    .from(planTaskChecks)
    .where(
      and(
        eq(planTaskChecks.userId, userId),
        eq(planTaskChecks.weekStart, weekStart),
        eq(planTaskChecks.taskId, taskId),
      ),
    )
    .get()
  if (existing) {
    db.delete(planTaskChecks).where(eq(planTaskChecks.id, existing.id)).run()
  } else {
    db.insert(planTaskChecks).values({ userId, weekStart, taskId, checkedAt: now }).run()
  }
}

/** Each week's stored plan pattern (if any), for the scorecard's manual-task column. */
export function listPlanPatterns(
  db: Db,
  userId: number,
  since: number,
): { weekStart: number; pattern: StoredPattern | null }[] {
  const rows = db
    .select({ weekStart: plans.weekStart, baseline: plans.baseline })
    .from(plans)
    .where(and(eq(plans.userId, userId), gte(plans.weekStart, since)))
    .all()
  return rows.map((row) => {
    const baseline = JSON.parse(row.baseline) as StoredBaseline
    return { weekStart: row.weekStart, pattern: baseline.pattern ?? null }
  })
}

/** The user's newest games, for the loss-review fallback ("your last 3 games"). */
export function recentGames(
  db: Db,
  userId: number,
  limit = 3,
): { id: number; playedAt: number; speed: Speed; result: Result; opponentName: string | null }[] {
  return db
    .select({
      id: games.id,
      playedAt: games.playedAt,
      speed: games.speed,
      result: games.result,
      opponentName: games.opponentName,
    })
    .from(games)
    .where(eq(games.userId, userId))
    .orderBy(desc(games.playedAt), desc(games.id))
    .limit(limit)
    .all()
}
