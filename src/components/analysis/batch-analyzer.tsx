'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { useAnalyzer } from './use-analyzer'

const selectClass = 'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; index: number; total: number; ply: number; plies: number; done: number; startedAt: number }
  | { kind: 'finished'; done: number; failed: number; seconds: number; stopped: boolean }

/** Analyzes the newest unanalyzed games one after another, in this browser tab. */
export default function BatchAnalyzer() {
  const analyze = useAnalyzer()
  const router = useRouter()
  const [speed, setSpeed] = useState('blitz')
  const [count, setCount] = useState(10)
  const [state, setState] = useState<RunState>({ kind: 'idle' })
  const [lastError, setLastError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function start() {
    const controller = new AbortController()
    abortRef.current = controller
    setLastError(null)
    const res = await fetch(`/api/analysis/queue?limit=${count}${speed ? `&speed=${speed}` : ''}`)
    const { gameIds } = (await res.json()) as { gameIds: number[] }
    const startedAt = Date.now()
    let done = 0
    let failed = 0
    for (let i = 0; i < gameIds.length && !controller.signal.aborted; i++) {
      setState({ kind: 'running', index: i, total: gameIds.length, ply: 0, plies: 0, done, startedAt })
      try {
        await analyze(gameIds[i], {
          signal: controller.signal,
          onProgress: (ply, plies) =>
            setState({ kind: 'running', index: i, total: gameIds.length, ply, plies, done, startedAt }),
        })
        done++
      } catch (error) {
        if (controller.signal.aborted) break
        failed++
        setLastError(error instanceof Error ? error.message : String(error))
      }
    }
    setState({
      kind: 'finished',
      done,
      failed,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      stopped: controller.signal.aborted,
    })
    router.refresh()
  }

  const running = state.kind === 'running'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Speed
          <select className={selectClass} value={speed} onChange={(e) => setSpeed(e.target.value)} disabled={running}>
            <option value="">All</option>
            <option value="bullet">Bullet</option>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
            <option value="daily">Daily</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Games
          <select className={selectClass} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={running}>
            {[1, 10, 25, 50, 100, 250].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="rounded-md bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" onClick={start}>
            Analyze newest {count}
          </button>
        )}
      </div>

      {state.kind === 'running' && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p>
            Game {state.index + 1} of {state.total}: position {state.ply}/{state.plies || '…'}
            {state.done > 0 && <> · about {eta(state)} left</>}
          </p>
          <div className="h-2 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
            <div
              className="h-full bg-black/60 dark:bg-white/60"
              style={{ width: `${(100 * (state.index + (state.plies ? state.ply / state.plies : 0))) / state.total}%` }}
            />
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">Keep this tab open; analysis runs in your browser.</p>
        </div>
      )}
      {state.kind === 'finished' && (
        <p className="text-sm">
          {state.stopped ? 'Stopped. ' : 'Done. '}
          {state.done} analyzed{state.failed > 0 && `, ${state.failed} failed`} in {state.seconds}s.
        </p>
      )}
      {lastError && <p className="text-sm text-red-600 dark:text-red-400">Last error: {lastError}</p>}
    </div>
  )
}

function eta(s: Extract<RunState, { kind: 'running' }>): string {
  const perGame = (Date.now() - s.startedAt) / Math.max(s.done, 1)
  const seconds = Math.round(((s.total - s.index) * perGame) / 1000)
  return seconds >= 90 ? `${Math.round(seconds / 60)} min` : `${seconds}s`
}
