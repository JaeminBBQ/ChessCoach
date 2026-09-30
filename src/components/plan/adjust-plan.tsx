'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { savePlanSettingsAction, type PlanSettingsState } from '@/app/plan/actions'

const selectClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'
const inputClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

// Common IANA zones; the user's current zone is added when it isn't listed.
const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

export default function AdjustPlan({
  weeklyGames,
  planSpeed,
  puzzlesPerWeek,
  timezone,
}: {
  weeklyGames: number
  planSpeed: string
  puzzlesPerWeek: number
  timezone: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<PlanSettingsState, FormData>(savePlanSettingsAction, null)

  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])

  const zones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]
  return (
    <details className="rounded-lg border border-black/10 dark:border-white/10">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">Adjust plan</summary>
      <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-black/10 px-3 py-3 dark:border-white/10">
        <label className="flex flex-col gap-1 text-sm">
          Games per week
          <input
            type="number"
            name="weeklyGames"
            defaultValue={weeklyGames}
            min={1}
            max={100}
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Plan speed
          <select name="planSpeed" defaultValue={planSpeed} className={selectClass}>
            {['bullet', 'blitz', 'rapid', 'daily'].map((speed) => (
              <option key={speed} value={speed}>
                {speed}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Puzzles per week
          <input
            type="number"
            name="puzzlesPerWeek"
            defaultValue={puzzlesPerWeek}
            min={1}
            max={1000}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Time zone
          <select name="timezone" defaultValue={timezone} className={selectClass}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state !== null && !state.ok && (
          <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-sm text-zinc-500 dark:text-zinc-400">Saved.</p>}
      </form>
    </details>
  )
}
