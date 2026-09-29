'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SyncState = 'queued' | 'running' | 'done' | 'rate_limited' | 'not_found' | 'error' | 'idle'

interface Status {
  state: SyncState
  inserted?: number
  seen?: number
  message?: string
}

const buttonClass =
  'rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

const FINISHED: SyncState[] = ['done', 'rate_limited', 'not_found', 'error']

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function SyncButton({ accountId }: { accountId: number }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)

  const isActive = status !== null && (status.state === 'queued' || status.state === 'running')

  const poll = async () => {
    // The server keeps the sync status in memory; poll until it settles.
    for (;;) {
      const response = await fetch(`/api/accounts/${accountId}/sync`, { cache: 'no-store' })
      if (!response.ok) break
      const data = (await response.json()) as Status
      setStatus(data)
      if (FINISHED.includes(data.state)) {
        router.refresh()
        break
      }
      await sleep(2000)
    }
  }

  const start = async () => {
    const response = await fetch(`/api/accounts/${accountId}/sync`, { method: 'POST' })
    if (!response.ok) return
    setStatus((await response.json()) as Status)
    void poll()
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={buttonClass} onClick={start} disabled={isActive}>
        Sync
      </button>
      {status !== null && <span className="text-xs text-zinc-500 dark:text-zinc-400">{label(status)}</span>}
    </span>
  )
}

function label(status: Status): string {
  switch (status.state) {
    case 'queued':
    case 'running':
      return `Syncing… ${format(status.seen)} games seen, ${format(status.inserted)} new`
    case 'done':
      return `Done: ${format(status.inserted)} new`
    case 'rate_limited':
      return status.message ?? 'Rate limited'
    case 'not_found':
      return 'User not found'
    case 'error':
      return status.message ?? 'Sync failed'
    case 'idle':
      return ''
  }
}

const format = (n: number | undefined) => (n ?? 0).toLocaleString()
