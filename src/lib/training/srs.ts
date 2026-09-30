import type { Grade } from '../db/schema'

/** Scheduling state, stored on each drill card. */
export interface SrsState {
  ease: number
  intervalDays: number
  reps: number
  lapses: number
  /** Next review time, epoch ms. */
  due: number
}

export const NEW_CARDS_PER_DAY = 10
export const SESSION_CAP = 20
const AGAIN_DELAY_MS = 10 * 60_000
const DAY_MS = 24 * 60 * 60_000
const MIN_EASE = 1.3

/**
 * Simplified SM-2 with three grades. `again` resets the card for review in
 * 10 minutes; `good` grows the interval 1 → 3 → interval × ease days; `easy`
 * is `good` with the interval multiplied by 1.3 and a small ease bonus.
 */
export function applyReview(state: SrsState, grade: Grade, now: number): SrsState {
  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      intervalDays: 0,
      reps: 0,
      lapses: state.lapses + 1,
      due: now + AGAIN_DELAY_MS,
    }
  }
  const interval = state.reps === 0 ? 1 : state.reps === 1 ? 3 : Math.round(state.intervalDays * state.ease)
  if (grade === 'easy') {
    return {
      ease: state.ease + 0.15,
      intervalDays: interval * 1.3,
      reps: state.reps + 1,
      lapses: state.lapses,
      due: now + Math.round(interval * 1.3 * DAY_MS),
    }
  }
  return {
    ease: state.ease,
    intervalDays: interval,
    reps: state.reps + 1,
    lapses: state.lapses,
    due: now + interval * DAY_MS,
  }
}

/** The slice of a card the queue needs; full card rows satisfy it structurally. */
export interface QueueCard {
  id: number
  gameId: number
  due: number
  /** null until first reviewed — never-reviewed cards are "new". */
  lastReviewedAt: number | null
}

/**
 * The session: due cards (reviewed before and due ≤ now), oldest due first,
 * then new cards (never reviewed), newest game first, up to 10 − `newToday`
 * per day, capped at `sessionCap` cards overall.
 */
export function buildQueue(
  cards: readonly QueueCard[],
  now: number,
  newToday: number,
  sessionCap = SESSION_CAP,
): QueueCard[] {
  const due = cards
    .filter((card) => card.lastReviewedAt !== null && card.due <= now)
    .sort((a, b) => a.due - b.due || a.id - b.id)
  const fresh = cards
    .filter((card) => card.lastReviewedAt === null)
    .sort((a, b) => b.gameId - a.gameId || a.id - b.id)
  const newAllowance = Math.max(0, NEW_CARDS_PER_DAY - newToday)
  return [...due, ...fresh.slice(0, newAllowance)].slice(0, sessionCap)
}
