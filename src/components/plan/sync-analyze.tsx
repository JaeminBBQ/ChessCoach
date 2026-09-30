'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useAnalyzer } from '@/components/analysis/use-analyzer'

type SyncState = 'queued' | 'running' | 'done' | 'rate_limited' | 'not_found' | 'error'
const FINISHED: SyncState[] = ['done', 'rate_limited', 'not_found', 'error']

type RunState =
  | { kind: 'idle' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'analyzing'; done: number; total: number }
  | { kind: 'finished'; analyzed: number; failed: number }
  | { kind: 'error'; message: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const buttonClass =
  'rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black'

/**
 * Syncs every linked account, then analyzes this week's and last week's
 * unanalyzed games in this browser tab. Auto-runs once per page load when the
 * last sync is more than 30 minutes old.
 */
export default function SyncAnalyze({
  accountIds,
  syncSince,
  lastSyncAt,
}: {
  accountIds: number[]
  syncSince: number
  lastSyncAt: number | null
}) {
  const analyze = useAnalyzer()
  const router = useRouter()
  const [state, setState] = useState<RunState>({ kind: 'idle' })
  const autoRan = useRef(false)

  async function run() {
    // 1. Start a sync per account and poll until every one settles.
    await Promise.all(
      accountIds.map((id) =>
        fetch(`/api/accounts/${id}/sync`, { method: 'POST' }).catch(() => null),
      ),
    )
    const settled = new Set<number>()
    while (settled.size < accountIds.length) {
      await sleep(2000)
      const statuses = await Promise.all(
        accountIds.map((id) =>
          fetch(`/api/accounts/${id}/sync`, { cache: 'no-store' })
            .then((res) => res.json() as Promise<{ state: SyncState }>)
            .catch(() => ({ state: 'error' as const })),
        ),
      )
      statuses.forEach((status, i) => {
        if (FINISHED.includes(status.state)) settled.add(accountIds[i])
      })
      setState({ kind: 'syncing', done: settled.size, total: accountIds.length })
    }

    // 2. Analyze the unanalyzed games of this week and the previous one.
    const queueRes = await fetch(`/api/analysis/queue?since=${syncSince}&limit=500`)
    const { gameIds } = (await queueRes.json()) as { gameIds: number[] }
    let analyzed = 0
    let failed = 0
    for (const gameId of gameIds) {
      setState({ kind: 'analyzing', done: analyzed + failed, total: gameIds.length })
      try {
        await analyze(gameId)
        analyzed++
      } catch {
        failed++
      }
    }
    setState({ kind: 'finished', analyzed, failed })
    router.refresh()
  }

  useEffect(() => {
    if (autoRan.current || accountIds.length === 0) return
    const stale = lastSyncAt === null || Date.now() - lastSyncAt > 30 * 60_000
    if (!stale) return
    autoRan.current = true
    const timer = setTimeout(() => {
      run().catch((error: unknown) =>
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
      )
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const running = state.kind === 'syncing' || state.kind === 'analyzing'
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={buttonClass}
        onClick={() => run().catch((error: unknown) =>
          setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
        )}
        disabled={running || accountIds.length === 0}
      >
        {running ? 'Working…' : 'Sync & analyze'}
      </button>
      {state.kind === 'idle' && <span className="text-xs text-zinc-500 dark:text-zinc-400">New games flow into the plan automatically.</span>}
      {state.kind === 'syncing' && (
        <span className="text-sm" aria-live="polite">
          Syncing {state.done} of {state.total} accounts…
        </span>
      )}
      {state.kind === 'analyzing' && (
        <span className="text-sm" aria-live="polite">
          Analyzing {Math.min(state.done + 1, state.total)} of {state.total}… (keep this tab open)
        </span>
      )}
      {state.kind === 'finished' && (
        <span className="text-sm">
          Done: {state.analyzed} analyzed{state.failed > 0 && `, ${state.failed} failed`}.
        </span>
      )}
      {state.kind === 'error' && <span className="text-sm text-red-600 dark:text-red-400">{state.message}</span>}
      {accountIds.length === 0 && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Link an account on the <a href="/accounts" className="underline underline-offset-2">Accounts page</a> to sync games.
        </span>
      )}
    </div>
  )
}
