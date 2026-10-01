import { and, count, eq, gte, isNotNull, isNull, lte, min, or } from 'drizzle-orm'

import type { GameAnalysis } from '../analysis/game-analysis'
import { mistakeMotif, missedMotif } from '../analysis/motifs'
import type { getDb } from '../db/client'
import { analyses, drillCards, drillReviews, games, grades, type Grade } from '../db/schema'
import { buildCards } from '../training/cards'
import { applyReview, buildQueue, type QueueCard } from '../training/srs'

type Db = ReturnType<typeof getDb>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Builds drill cards for every analyzed game of the user that has none yet,
 * and backfills the motif on cards that predate the motif column (computed
 * from the stored analysis, once per card). Idempotent: games with at least
 * one card are skipped, and the unique (gameId, ply) index guards the rest.
 * Returns the number of cards created.
 */
export function syncDrillCards(db: Db, userId: number, now = Date.now()): number {
  const rows = db
    .select({ id: games.id, userColor: games.userColor, data: analyses.data })
    .from(games)
    .innerJoin(analyses, and(eq(analyses.gameId, games.id), eq(analyses.userId, userId)))
    .leftJoin(drillCards, eq(drillCards.gameId, games.id))
    .where(and(eq(games.userId, userId), isNull(drillCards.id)))
    .all()

  let created = 0
  for (const row of rows) {
    const analysis = JSON.parse(row.data) as GameAnalysis
    for (const card of buildCards({ id: row.id, userColor: row.userColor }, analysis)) {
      db.insert(drillCards)
        .values({
          userId,
          gameId: card.gameId,
          ply: card.ply,
          kind: card.kind,
          fen: card.fen,
          solutionUci: card.solutionUci,
          solutionSan: card.solutionSan,
          solutionWin: card.solutionWin,
          playedSan: card.playedSan,
          playedWin: card.playedWin,
          lastMoveUci: card.lastMoveUci,
          motif: card.motif,
          ease: 2.5,
          intervalDays: 0,
          reps: 0,
          lapses: 0,
          due: now,
          lastReviewedAt: null,
          createdAt: now,
        })
        .onConflictDoNothing()
        .run()
      created++
    }
  }
  backfillMotifs(db, userId)
  return created
}

/** Fills `motif` on cards that predate the column, from their game's stored analysis. */
function backfillMotifs(db: Db, userId: number): void {
  const rows = db
    .select({
      id: drillCards.id,
      ply: drillCards.ply,
      kind: drillCards.kind,
      data: analyses.data,
    })
    .from(drillCards)
    .innerJoin(games, eq(games.id, drillCards.gameId))
    .innerJoin(analyses, and(eq(analyses.gameId, games.id), eq(analyses.userId, userId)))
    .where(and(eq(drillCards.userId, userId), isNull(drillCards.motif)))
    .all()
  for (const row of rows) {
    const analysis = JSON.parse(row.data) as GameAnalysis
    const motif = (row.kind === 'missed' ? missedMotif(analysis, row.ply) : mistakeMotif(analysis, row.ply)).motif
    db.update(drillCards).set({ motif }).where(eq(drillCards.id, row.id)).run()
  }
}

/** Drill cards per motif, for the Coach pattern links ("Your positions (N)"). */
export function motifCardCounts(db: Db, userId: number): Map<string, number> {
  const rows = db
    .select({ motif: drillCards.motif, n: count() })
    .from(drillCards)
    .where(and(eq(drillCards.userId, userId), isNotNull(drillCards.motif)))
    .groupBy(drillCards.motif)
    .all()
  return new Map(rows.filter((row) => row.motif !== null).map((row) => [row.motif!, row.n]))
}

/** How many new cards were introduced today: cards whose first review is since local midnight. */
export function newCardsToday(db: Db, userId: number, now: number): number {
  const midnight = localMidnight(now)
  const firsts = db
    .select({ firstAt: min(drillReviews.reviewedAt).as('firstAt') })
    .from(drillReviews)
    .where(eq(drillReviews.userId, userId))
    .groupBy(drillReviews.cardId)
    .as('firsts')
  return db.select({ n: count() }).from(firsts).where(gte(firsts.firstAt, midnight)).get()?.n ?? 0
}

/**
 * The session queue: due cards first, then new cards within today's allowance,
 * capped. When `motif` is given, only cards with that pattern are considered
 * (same due/new rules, and the new-per-day cap still applies).
 */
export function trainingQueue(
  db: Db,
  userId: number,
  now: number,
  newToday: number,
  motif?: string,
): QueueCard[] {
  const cards = db
    .select()
    .from(drillCards)
    .where(
      and(
        eq(drillCards.userId, userId),
        motif !== undefined ? eq(drillCards.motif, motif) : undefined,
        or(
          and(isNotNull(drillCards.lastReviewedAt), lte(drillCards.due, now)),
          isNull(drillCards.lastReviewedAt),
        ),
      ),
    )
    .all()
  return buildQueue(cards, now, newToday)
}

export type ReviewResult = { ok: false; status: 400 | 404; error: string } | { ok: true }

/** Applies one review to the card's schedule and writes history. */
export function reviewCard(
  db: Db,
  userId: number,
  cardId: number,
  grade: string,
  correct: boolean,
  now: number,
): ReviewResult {
  if (!(grades as readonly string[]).includes(grade)) {
    return { ok: false, status: 400, error: 'Unknown grade' }
  }
  const card = db
    .select()
    .from(drillCards)
    .where(and(eq(drillCards.id, cardId), eq(drillCards.userId, userId)))
    .get()
  if (!card) return { ok: false, status: 404, error: 'Card not found' }

  const next = applyReview(
    { ease: card.ease, intervalDays: card.intervalDays, reps: card.reps, lapses: card.lapses, due: card.due },
    grade as Grade,
    now,
  )
  db.update(drillCards)
    .set({ ...next, lastReviewedAt: now })
    .where(and(eq(drillCards.id, cardId), eq(drillCards.userId, userId)))
    .run()
  db.insert(drillReviews).values({ userId, cardId, grade: grade as Grade, correct, reviewedAt: now }).run()
  return { ok: true }
}

export interface TrainingStats {
  due: number
  new: number
  /** Cards with reps ≥ 2. */
  learned: number
  total: number
  reviewedToday: number
  /** Percent of correct answers over the last 7 days (0 when none). */
  accuracy7d: number
  /** Next review time among cards that aren't due yet (null when none). */
  nextDue: number | null
}

export function trainingStats(db: Db, userId: number, now: number): TrainingStats {
  const all = db.select().from(drillCards).where(eq(drillCards.userId, userId)).all()
  let due = 0
  let fresh = 0
  let learned = 0
  let nextDue: number | null = null
  for (const card of all) {
    if (card.lastReviewedAt === null) fresh++
    else if (card.due <= now) due++
    else if (nextDue === null || card.due < nextDue) nextDue = card.due
    if (card.reps >= 2) learned++
  }
  const midnight = localMidnight(now)
  const reviewedToday =
    db
      .select({ n: count() })
      .from(drillReviews)
      .where(and(eq(drillReviews.userId, userId), gte(drillReviews.reviewedAt, midnight)))
      .get()?.n ?? 0
  const week = db
    .select({ correct: drillReviews.correct })
    .from(drillReviews)
    .where(and(eq(drillReviews.userId, userId), gte(drillReviews.reviewedAt, now - 7 * DAY_MS)))
    .all()
  const accuracy7d = week.length === 0 ? 0 : Math.round((week.filter((r) => r.correct).length / week.length) * 100)
  return { due, new: fresh, learned, total: all.length, reviewedToday, accuracy7d, nextDue }
}

function localMidnight(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Indirection so server components can read the clock without an impure call at render. */
export function currentTimeMs(): number {
  return Date.now()
}
