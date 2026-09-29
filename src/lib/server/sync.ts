import { eq, max } from 'drizzle-orm'

import { fetchChesscomGames } from '../importers/chesscom'
import { fetchLichessGames } from '../importers/lichess'
import { RateLimitedError, UserNotFoundError, type FetchDeps, type ImportedGame } from '../importers/types'
import type { getDb } from '../db/client'
import { games, linkedAccounts } from '../db/schema'
import { KeyedLock } from './lock'

type Db = ReturnType<typeof getDb>

export interface SyncResult {
  status: 'ok' | 'rate_limited' | 'not_found' | 'error'
  inserted: number
  seen: number
  retryAfterMs?: number
  message?: string
}

/** Options beyond the injected fetch; tests pin `now` to keep timestamps deterministic. */
export interface SyncDeps extends FetchDeps {
  now?: () => number
  onProgress?: (seen: number, inserted: number) => void
}

// One sync per platform at a time: the API etiquette rule from the hard rules.
// A second sync for the same platform queues behind the first.
const platformLock = new KeyedLock()

// Lichess `since` overlaps the cursor by 3 days to catch games created before
// but finished after the latest known game.
const LICHESS_OVERLAP_MS = 3 * 24 * 60 * 60 * 1000

const BATCH_SIZE = 100

/** UTC 'YYYY/MM' for a timestamp, matching Chess.com archive URL suffixes. */
function monthOf(playedAt: number): string {
  const d = new Date(playedAt)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Syncs one linked account into `games`, idempotently (the unique index on
 * platform/externalId/userId dedupes). Throws only when the account doesn't
 * belong to `userId`; every API failure is folded into the result instead.
 */
export async function syncAccount(db: Db, userId: number, accountId: number, deps: SyncDeps = {}): Promise<SyncResult> {
  const account = db.select().from(linkedAccounts).where(eq(linkedAccounts.id, accountId)).get()
  if (!account || account.userId !== userId) {
    throw new Error(`account ${accountId} does not belong to user ${userId}`)
  }
  const now = deps.now ?? Date.now

  // Cursor: the latest playedAt among this account's games. Chess.com re-reads
  // that month (it's still filling up); Lichess overlaps by 3 days.
  const cursor = db
    .select({ playedAt: max(games.playedAt) })
    .from(games)
    .where(eq(games.accountId, accountId))
    .get()?.playedAt

  let seen = 0
  let inserted = 0
  const report = (newSeen: number, newInserted: number) => {
    seen = newSeen
    inserted = newInserted
    deps.onProgress?.(seen, inserted)
  }

  try {
    await platformLock.run(account.platform, async () => {
      const stream =
        account.platform === 'chesscom'
          ? fetchChesscomGames(account.username, {
              fetch: deps.fetch,
              sinceMonth: cursor !== null && cursor !== undefined ? monthOf(cursor) : undefined,
            })
          : fetchLichessGames(account.username, {
              fetch: deps.fetch,
              since: cursor !== null && cursor !== undefined ? cursor - LICHESS_OVERLAP_MS : undefined,
              token: process.env.LICHESS_TOKEN || undefined,
            })
      await ingest(db, stream, userId, accountId, now, report)
    })
    db.update(linkedAccounts).set({ lastSyncedAt: now() }).where(eq(linkedAccounts.id, accountId)).run()
    return { status: 'ok', inserted, seen }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      // Keep what was inserted but leave lastSyncedAt unchanged: the sync
      // didn't complete.
      return { status: 'rate_limited', inserted, seen, retryAfterMs: error.retryAfterMs }
    }
    if (error instanceof UserNotFoundError) {
      return { status: 'not_found', inserted, seen, message: `${error.platform} user not found: ${error.username}` }
    }
    // No stack traces: the message may reach the UI.
    return { status: 'error', inserted, seen, message: error instanceof Error ? error.message : String(error) }
  }
}

/** Inserts games as they stream, in transactions of up to 100 rows. */
async function ingest(
  db: Db,
  stream: AsyncGenerator<ImportedGame>,
  userId: number,
  accountId: number,
  now: () => number,
  onProgress: (seen: number, inserted: number) => void,
): Promise<void> {
  const flush = (rows: (typeof games.$inferInsert)[]): number =>
    db.transaction((tx) => {
      let changes = 0
      for (const row of rows) {
        changes += tx.insert(games).values(row).onConflictDoNothing().run().changes
      }
      return changes
    })

  let seen = 0
  let inserted = 0
  let batch: (typeof games.$inferInsert)[] = []
  const importedAt = now()
  try {
    for await (const game of stream) {
      seen++
      batch.push({ userId, accountId, importedAt, ...game })
      if (batch.length >= BATCH_SIZE) {
        inserted += flush(batch)
        batch = []
        onProgress(seen, inserted)
      }
    }
  } finally {
    // Flush the partial batch even when the stream errors, so games already
    // fetched survive a rate limit or network failure.
    if (batch.length > 0) {
      inserted += flush(batch)
      onProgress(seen, inserted)
    }
  }
}

// --- Background sync with live status --------------------------------------

export type SyncState = 'queued' | 'running' | 'done' | 'rate_limited' | 'not_found' | 'error'

export interface SyncStatus {
  state: SyncState
  inserted: number
  seen: number
  startedAt: number
  finishedAt?: number
  message?: string
}

// In-process status per account; lost on restart (D11: a job queue replaces it).
const syncStatuses = new Map<number, SyncStatus>()

/** Starts a sync in the background without awaiting it; no-op when one is already queued or running. */
export function startSync(db: Db, userId: number, accountId: number): SyncStatus {
  const existing = syncStatuses.get(accountId)
  if (existing && (existing.state === 'queued' || existing.state === 'running')) return existing

  const status: SyncStatus = { state: 'queued', inserted: 0, seen: 0, startedAt: Date.now() }
  syncStatuses.set(accountId, status)
  void runSync(db, userId, accountId, status)
  return status
}

export function getSyncStatus(accountId: number): SyncStatus | undefined {
  return syncStatuses.get(accountId)
}

async function runSync(db: Db, userId: number, accountId: number, status: SyncStatus): Promise<void> {
  status.state = 'running'
  let result: SyncResult
  try {
    result = await syncAccount(db, userId, accountId, {
      onProgress: (seen, inserted) => {
        status.seen = seen
        status.inserted = inserted
      },
    })
  } catch (error) {
    result = {
      status: 'error',
      inserted: status.inserted,
      seen: status.seen,
      message: error instanceof Error ? error.message : String(error),
    }
  }
  status.seen = result.seen
  status.inserted = result.inserted
  status.state = result.status === 'ok' ? 'done' : result.status
  status.finishedAt = Date.now()
  if (result.status === 'rate_limited') {
    status.message = `Rate limited; try again in ${Math.ceil((result.retryAfterMs ?? 60000) / 1000)}s`
  } else if (result.message) {
    status.message = result.message
  }
}
