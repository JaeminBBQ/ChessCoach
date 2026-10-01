import Link from 'next/link'
import { connection } from 'next/server'
import { count, eq } from 'drizzle-orm'

import Trainer from '@/components/training/trainer'
import { getDb } from '@/lib/db/client'
import { analyses } from '@/lib/db/schema'
import { MOTIF_LABEL } from '@/lib/analysis/motifs'
import { currentTimeMs, syncDrillCards, trainingStats } from '@/lib/server/training'
import { getCurrentUserId } from '@/lib/server/session'

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The page reads the DB per request; never prerender it.
  await connection()
  const sp = await searchParams
  const db = getDb()
  const userId = getCurrentUserId(db)
  const now = currentTimeMs()
  syncDrillCards(db, userId, now)
  const stats = trainingStats(db, userId, now)
  const analyzed = db.select({ n: count() }).from(analyses).where(eq(analyses.userId, userId)).get()?.n ?? 0

  // `?motif=X` limits the session to one pattern (Coach links here).
  const motifParam = typeof sp.motif === 'string' ? sp.motif : null
  const motif = motifParam !== null && Object.prototype.hasOwnProperty.call(MOTIF_LABEL, motifParam) ? motifParam : null

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Train</h1>
      {motif !== null ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Practicing: {MOTIF_LABEL[motif as keyof typeof MOTIF_LABEL]} ·{' '}
          <Link href="/train" className="underline underline-offset-2 hover:text-foreground">
            clear
          </Link>
        </p>
      ) : (
        <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
          {stats.due} due · {stats.new} new · {stats.learned} learned · {stats.accuracy7d}% right (7 days)
        </p>
      )}

      {analyzed === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          Puzzles are cut from your own analyzed games.{' '}
          <Link href="/analyze" className="underline underline-offset-2 hover:text-foreground">
            Analyze your games →
          </Link>
        </p>
      ) : stats.total === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          No trainable positions yet — the fair-puzzle gates rejected every candidate.{' '}
          <Link href="/analyze" className="underline underline-offset-2 hover:text-foreground">
            Analyze more games →
          </Link>
        </p>
      ) : stats.due === 0 && stats.new === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          All caught up. Next card due {stats.nextDue !== null ? inFuture(stats.nextDue, now) : 'later'}.
        </p>
      ) : (
        <Trainer motif={motif} />
      )}
    </main>
  )
}

/** "in 10m", "in 3h", "in 2d" for the next scheduled review. */
function inFuture(ms: number, now: number): string {
  const diff = ms - now
  if (diff < 60_000) return 'in a moment'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.floor(hours / 24)}d`
}
