import { and, count, desc, eq, gte } from 'drizzle-orm'

import type { CoachGame } from '../analysis/coach'
import type { getDb } from '../db/client'
import { drillReviews, gameReviews, games, plans, userSettings, type Result, type Speed } from '../db/schema'
import { focusMetric, pickFocus, type FocusMetric } from '../plan/plan'
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

export interface StoredBaseline {
  /** The focus snapshot (id, title, habit), null when the week had no findings. */
  focus: { id: string; title: string; habit: string } | null
  /** The focus metric over the previous 4 weeks, null when there was no data. */
  metric: FocusMetric | null
}

export interface PlanRow {
  id: number
  userId: number
  weekStart: number
  focusId: string | null
  baseline: StoredBaseline
  createdAt: number
}

/**
 * The week's plan row: computes and stores the focus (and its baseline over
 * the previous 4 weeks) on first read, so it stays fixed for the week.
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
  if (existing) return { ...existing, baseline: JSON.parse(existing.baseline) as StoredBaseline }

  const focus = pickFocus(games, now)
  const metric = focus === null ? null : baselineFor(games, weekStart, timezone, focus.id)
  const baseline: StoredBaseline = {
    focus: focus === null ? null : { id: focus.id, title: focus.title, habit: focus.training },
    metric,
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

/** The focus metric over the 4 weeks before the plan's week. */
function baselineFor(
  games: readonly CoachGame[],
  weekStart: number,
  timezone: string,
  findingId: string,
): FocusMetric | null {
  const weeks = lastNWeeks(weekStart, timezone, 5).slice(0, 4)
  const inBaseline = (playedAt: number) => {
    for (const start of weeks) {
      const week = weekRange(start, timezone)
      if (playedAt >= week.start && playedAt < week.end) return true
    }
    return false
  }
  return focusMetric(findingId, games.filter((game) => inBaseline(game.playedAt)))
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
