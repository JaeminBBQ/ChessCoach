'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import GameReview, { type GameReviewProps } from '@/components/analysis/game-review'

const buttonClass =
  'rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

/**
 * The "Mark reviewed" control plus the interactive review. The review
 * auto-marks the game once every key-moment ply has been visited (or the last
 * ply, when there are none).
 */
export default function ReviewPanel({
  gameId,
  reviewedAt,
  review,
}: {
  gameId: number
  reviewedAt: number | null
  review?: Omit<GameReviewProps, 'onReviewComplete'>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const mark = async () => {
    setBusy(true)
    try {
      await fetch(`/api/games/${gameId}/review`, { method: 'POST' })
    } finally {
      setBusy(false)
    }
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {reviewedAt !== null ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            ✓ Reviewed {new Date(reviewedAt).toLocaleDateString()}
          </span>
        ) : (
          <button type="button" className={buttonClass} onClick={mark} disabled={busy}>
            Mark reviewed ✓
          </button>
        )}
      </div>
      {review && (
        <GameReview {...review} onReviewComplete={reviewedAt === null ? mark : undefined} />
      )}
    </>
  )
}
