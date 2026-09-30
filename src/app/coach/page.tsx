import Link from 'next/link'
import { connection } from 'next/server'

import GamesFilters from '@/components/games-filters'
import { coach, type CoachGame, type Finding } from '@/lib/analysis/coach'
import { getDb } from '@/lib/db/client'
import { speeds, type Speed } from '@/lib/db/schema'
import { loadCoachGames } from '@/lib/server/coach'
import { listAccounts } from '@/lib/server/games'
import { ranges, type Range } from '@/lib/server/insights'
import { getCurrentUserId } from '@/lib/server/session'

const selectClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

const RANGE_LABELS: Record<Range, string> = {
  '90d': 'last 90 days',
  '1y': 'last year',
  all: 'all time',
}

interface FilterState {
  accountId?: number
  speed?: Speed
  rated: boolean
  range: Range
}

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The page reads the DB per request; never prerender it.
  await connection()
  const sp = await searchParams
  const db = getDb()
  const userId = getCurrentUserId(db)
  const accounts = listAccounts(db, userId)
  const accountIds = new Set(accounts.map((account) => account.id))

  const rawAccountId = toNumber(sp.account)
  const filters: FilterState = {
    accountId: rawAccountId !== undefined && accountIds.has(rawAccountId) ? rawAccountId : undefined,
    rated: sp.rated !== 'false',
    range: pick(ranges, sp.range) ?? '1y',
  }

  // One pass for the whole range; the default speed and the final view both come from it.
  const rangeGames = loadCoachGames(db, userId, {
    accountId: filters.accountId,
    rated: filters.rated,
    range: filters.range,
  })
  const defaultSpeed = mostPlayedSpeed(rangeGames)
  filters.speed = sp.speed === 'all' ? undefined : (pick(speeds, sp.speed) ?? defaultSpeed)
  const games = filters.speed === undefined ? rangeGames : rangeGames.filter((game) => game.speed === filters.speed)

  const result = coach(games)
  const [top, rest] = [result.findings.slice(0, 3), result.findings.slice(3)]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
      <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {result.totalGames} games · {RANGE_LABELS[filters.range]} · {filters.speed ?? 'all speeds'} ·{' '}
        {filters.rated ? 'rated' : 'casual'}
      </p>

      <GamesFilters>
        <div className="mt-4 flex flex-wrap gap-2">
          <select name="account" defaultValue={String(filters.accountId ?? '')} className={selectClass}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · {account.username}
              </option>
            ))}
          </select>
          <select name="speed" defaultValue={filters.speed ?? 'all'} className={selectClass}>
            <option value="all">All speeds</option>
            {speeds.map((speed) => (
              <option key={speed} value={speed}>
                {speed}
              </option>
            ))}
          </select>
          <select name="rated" defaultValue={String(filters.rated)} className={selectClass}>
            <option value="true">Rated</option>
            <option value="false">Casual</option>
          </select>
          <select name="range" defaultValue={filters.range} className={selectClass}>
            {ranges.map((range) => (
              <option key={range} value={range}>
                {RANGE_LABELS[range]}
              </option>
            ))}
          </select>
        </div>
      </GamesFilters>

      {result.totalGames === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          No games match these filters.{' '}
          <Link href="/accounts" className="underline underline-offset-2 hover:text-foreground">
            Link an account.
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
            Based on {result.totalGames} {filters.speed ?? 'all speeds'} games ({result.analyzedGames} analyzed
            with Stockfish), {RANGE_LABELS[filters.range]}.
          </p>

          {result.needsAnalysis && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Analyze at least 20 games to unlock move-level coaching.{' '}
              <Link href="/analyze" className="font-medium underline underline-offset-2">
                Analyze games →
              </Link>
            </div>
          )}

          {result.findings.length === 0 ? (
            <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
              No clear weaknesses yet. Analyze more games.
            </p>
          ) : (
            <>
              <div className="mt-6 grid gap-4">
                {top.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>

              {rest.length > 0 && (
                <section className="mt-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Also noticed
                  </h2>
                  <div className="mt-2 space-y-2">
                    {rest.map((finding) => (
                      <details
                        key={finding.id}
                        className="rounded-lg border border-black/10 dark:border-white/10"
                      >
                        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                          <span className="font-medium">{finding.title}</span>
                          <PointsPill finding={finding} />
                          <span className="w-full text-zinc-500 dark:text-zinc-400 sm:w-auto sm:flex-1">
                            {finding.headline}
                          </span>
                        </summary>
                        <div className="border-t border-black/10 px-3 py-3 dark:border-white/10">
                          <FindingBody finding={finding} />
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">{finding.title}</h2>
        <PointsPill finding={finding} />
      </div>
      <FindingBody finding={finding} />
    </section>
  )
}

function PointsPill({ finding }: { finding: Finding }) {
  return (
    <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-500/20 dark:text-red-300">
      −{finding.pointsPer100.toFixed(1)} pts / 100 games
    </span>
  )
}

function FindingBody({ finding }: { finding: Finding }) {
  return (
    <>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{finding.headline}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
        {finding.evidence.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {finding.examples.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {finding.examples.map((example) => (
            <li key={`${example.gameId}-${example.ply}`}>
              <Link
                href={`/games/${example.gameId}?ply=${example.ply}`}
                className="font-mono text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
              >
                {example.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 rounded-md bg-black/5 p-3 dark:bg-white/5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          How to train
        </div>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{finding.training}</p>
      </div>
    </>
  )
}

function mostPlayedSpeed(games: readonly CoachGame[]): Speed | undefined {
  const counts = new Map<Speed, number>()
  for (const game of games) counts.set(game.speed, (counts.get(game.speed) ?? 0) + 1)
  let best: Speed | undefined
  let bestCount = 0
  for (const speed of speeds) {
    const n = counts.get(speed) ?? 0
    if (n > bestCount) {
      best = speed
      bestCount = n
    }
  }
  return best
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}
