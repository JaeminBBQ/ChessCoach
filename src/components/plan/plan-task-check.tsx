'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { togglePlanTaskAction } from '@/app/plan/actions'

const buttonClass =
  'rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10'

/** The manual Done toggle for tasks that can't be auto-tracked (Lichess puzzles). */
export default function PlanTaskCheck({ weekStart, taskId, done }: { weekStart: number; taskId: string; done: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      await togglePlanTaskAction(weekStart, taskId)
    } finally {
      setBusy(false)
    }
    router.refresh()
  }

  return (
    <button type="button" className={buttonClass} onClick={toggle} disabled={busy} aria-pressed={done}>
      {done ? '✓ Done' : 'Mark done'}
    </button>
  )
}
