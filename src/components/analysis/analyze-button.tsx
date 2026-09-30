'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useAnalyzer } from './use-analyzer'

/** Analyzes one game in the browser, saves it, then refreshes the page's server data. */
export default function AnalyzeButton({ gameId, label }: { gameId: number; label: string }) {
  const analyze = useAnalyzer()
  const router = useRouter()
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    setProgress('Starting engine…')
    try {
      await analyze(gameId, { onProgress: (done, total) => setProgress(`Analyzing ${done}/${total}`) })
      setProgress(null)
      router.refresh()
    } catch (e) {
      setProgress(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        className="rounded-md bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        onClick={run}
        disabled={progress !== null}
      >
        {label}
      </button>
      {progress && <span aria-live="polite">{progress}</span>}
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
