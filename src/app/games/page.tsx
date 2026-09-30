import Link from 'next/link'
import { connection } from 'next/server'

import GamesFilters from '@/components/games-filters'
import { getDb } from '@/lib/db/client'
import { results, speeds, userColors, type Result } from '@/lib/db/schema'
import {
  GAMES_PAGE_SIZE,
  gameStats,
  listAccounts,
  listGames,
  type GameFilters,
} from '@/lib/server/games'
import { getCurrentUserId } from '@/lib/server/session'

const selectClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

export default async function GamesPage({
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

  const accountIds = new Set(accounts.map((a) => a.id))
  const rawAccountId = toNumber(sp.account)
  const filters: GameFilters = {
    accountId: rawAccountId !== undefined && accountIds.has(rawAccountId) ? rawAccountId : undefined,
    speed: pick(speeds, sp.speed),
    userColor: pick(userColors, sp.color),
    result: pick(results, sp.result),
    rated: sp.rated === 'true' ? true : sp.rated === 'false' ? false : undefined,
  }

  const { games, total } = listGames(db, userId, filters, 1)
  const stats = gameStats(db, userId, filters)
  const pages = Math.max(1, Math.ceil(total / GAMES_PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, toNumber(sp.page) ?? 1))

  const pageGames = page === 1 ? games : listGames(db, userId, filters, page).games
  const hasFilters = Object.values(filters).some((value) => value !== undefined)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
        <Link href="/analyze" className="text-sm underline underline-offset-2">
          Analyze games →
        </Link>
      </div>
      <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {stats.total} games · {percent(stats.wins, stats.total)}% win ·{' '}
        {percent(stats.losses, stats.total)}% loss · {percent(stats.draws, stats.total)}% draw
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
          <select name="speed" defaultValue={filters.speed ?? ''} className={selectClass}>
            <option value="">All speeds</option>
            {speeds.map((speed) => (
              <option key={speed} value={speed}>
                {speed}
              </option>
            ))}
          </select>
          <select name="color" defaultValue={filters.userColor ?? ''} className={selectClass}>
            <option value="">All colors</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
          <select name="result" defaultValue={filters.result ?? ''} className={selectClass}>
            <option value="">All results</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="draw">Draw</option>
          </select>
          <select
            name="rated"
            defaultValue={filters.rated === undefined ? '' : String(filters.rated)}
            className={selectClass}
          >
            <option value="">Rated &amp; casual</option>
            <option value="true">Rated</option>
            <option value="false">Casual</option>
          </select>
        </div>
      </GamesFilters>

      {total === 0 ? (
        hasFilters ? (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">No games match these filters.</p>
        ) : (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
            No games yet.{' '}
            <Link href="/accounts" className="underline underline-offset-2 hover:text-foreground">
              Link an account.
            </Link>
          </p>
        )
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Opponent</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Speed</th>
                  <th className="px-3 py-2 font-medium">Opening</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pageGames.map((game) => (
                  <tr
                    key={game.id}
                    className="border-b border-black/5 align-middle last:border-0 dark:border-white/5"
                  >
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      <Link href={`/games/${game.id}`} className="underline underline-offset-2">
                        {new Date(game.playedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Link>
                    </td>
                    <td className="px-3 py-2" title={game.userColor === 'white' ? 'White' : 'Black'}>
                      {game.userColor === 'white' ? '●' : '○'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {game.opponentName ?? '—'}
                      {game.opponentRating !== null && (
                        <span className="text-zinc-500 dark:text-zinc-400"> ({game.opponentRating})</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${resultClass(game.result)}`}>
                      {game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : 'D'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {game.speed}
                      {game.timeControl !== null && (
                        <span className="text-zinc-500 dark:text-zinc-400"> {game.timeControl}</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2">
                      <span className="block truncate" title={game.openingName ?? undefined}>
                        {game.openingName ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {game.termination ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={game.url}
                        target="_blank"
                        rel="noreferrer"
                        title="View on the platform"
                        className="text-zinc-500 hover:text-foreground dark:text-zinc-400"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              page {page} of {pages}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={pageHref(filters, page - 1)}
                  className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Prev
                </Link>
              ) : (
                <span className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium opacity-40 dark:border-white/15">
                  Prev
                </span>
              )}
              {page < pages ? (
                <Link
                  href={pageHref(filters, page + 1)}
                  className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium opacity-40 dark:border-white/15">
                  Next
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100)
}

function resultClass(result: Result): string {
  if (result === 'win') return 'text-emerald-600 dark:text-emerald-400'
  if (result === 'loss') return 'text-red-600 dark:text-red-400'
  return 'text-zinc-500 dark:text-zinc-400'
}

function pageHref(filters: GameFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.accountId !== undefined) params.set('account', String(filters.accountId))
  if (filters.speed !== undefined) params.set('speed', filters.speed)
  if (filters.userColor !== undefined) params.set('color', filters.userColor)
  if (filters.result !== undefined) params.set('result', filters.result)
  if (filters.rated !== undefined) params.set('rated', String(filters.rated))
  params.set('page', String(page))
  return `/games?${params.toString()}`
}
