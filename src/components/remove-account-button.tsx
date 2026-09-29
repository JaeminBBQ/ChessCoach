'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { unlinkAccountAction } from '@/app/accounts/actions'

const buttonClass =
  'rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

const dangerClass =
  'rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400'

export default function RemoveAccountButton({
  accountId,
  gameCount,
}: {
  accountId: number
  gameCount: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const remove = () => {
    startTransition(async () => {
      await unlinkAccountAction(accountId)
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <button type="button" className={buttonClass} onClick={() => setConfirming(true)}>
        Remove
      </button>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
      Remove? This deletes {gameCount} imported game{gameCount === 1 ? '' : 's'}.
      <button type="button" className={dangerClass} onClick={remove} disabled={pending}>
        Yes
      </button>
      <button type="button" className={buttonClass} onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
    </span>
  )
}
