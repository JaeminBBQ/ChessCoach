import Link from 'next/link'
import { connection } from 'next/server'

import GamesFilters from '@/components/games-filters'
import { firstMoves } from '@/lib/analysis/insights'
import { getDb } from '@/lib/db/client'
import { speeds, type UserColor } from '@/lib/db/schema'
import { formatLine, moveNo, resultPoints, scoreOf, topDeviations, type Deviation, type MatchRow } from '@/lib/repertoire/match'
import { listAccounts } from '@/lib/server/games'
import { ranges, type Range } from '@/lib/server/insights'
import {
  ensureGameRepertoire,
  listRepertoires,
  loadGameMatches,
  loadRepertoireGames,
  loadRepertoireNodes,
  type RepertoireRow,
} from '@/lib/server/repertoire'
import { getCurrentUserId } from '@/lib/server/session'

const selectClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

const RANGE_LABELS: Record<Range, string> = {
  '90d': 'last 90 days',
  '1y': 'last year',
  all: 'all time',
}

export default async function RepertoirePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  const sp = await searchParams
  const db = getDb()
  const userId = getCurrentUserId(db)
  const accounts = listAccounts(db, userId)
  const accountIds = new Set(accounts.map((account) => account.id))

  const rawAccountId = toNumber(sp.account)
  const filters = {
    accountId: rawAccountId !== undefined && accountIds.has(rawAccountId) ? rawAccountId : undefined,
    // Openings need sample size: all speeds and the full history by default.
    speed: sp.speed === 'all' ? undefined : (pick(speeds, sp.speed) ?? undefined),
    rated: sp.rated !== 'false',
    range: pick(ranges, sp.range) ?? 'all',
  }

  const games = loadRepertoireGames(db, userId, filters)
  ensureGameRepertoire(db, userId, games.map((game) => game.id))
  const matches = loadGameMatches(db, userId, games.map((game) => game.id))
  const repertoires = listRepertoires(db, userId)
  const nodes = loadRepertoireNodes(db, userId)

  const rows: MatchRow[] = []
  for (const game of games) {
    const match = matches.get(game.id)
    if (match) rows.push({ match, game: { userColor: game.userColor, result: game.result, sans: firstMoves(game.pgn, 40) } })
  }

  const query = filterQuery(sp)
  const slugById = new Map(repertoires.map((rep) => [rep.id, rep.slug]))
  const deviations = topDeviations(rows, nodes, 8)
  const neverInBook = neverInBookRows(rows)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Repertoire</h1>
      <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {games.length} games · {RANGE_LABELS[filters.range]} · {filters.speed ?? 'all speeds'} ·{' '}
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

      {repertoires.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          No repertoires imported yet. Run <code className="font-mono">npm run repertoire:import</code>.
        </p>
      ) : (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {repertoires.map((rep) => (
              <RepertoireCard key={rep.id} rep={rep} rows={rows} query={query} />
            ))}
          </section>

          <DeviationSection
            title="Where opponents take you out of book"
            caption="Their move wasn't in your prep — this is what to study next."
            rows={deviations.opponent}
            kind="opponent"
            slugById={slugById}
            query={query}
          />
          <DeviationSection
            title="Where you leave your own book"
            caption="You forgot or varied; the book move is shown for comparison."
            rows={deviations.user}
            kind="user"
            slugById={slugById}
            query={query}
          />

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Never in book
            </h2>
            {neverInBook.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Every game entered one of your repertoires.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {neverInBook.map((row) => (
                  <div key={row.color} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
                    <p className="font-medium">{row.color === 'white' ? 'White' : 'Black'}: {row.n} games never in book</p>
                    <p className="mt-1 tabular-nums text-zinc-600 dark:text-zinc-300">
                      Most common starts:{' '}
                      {row.openings.map((opening) => `${formatLine(opening.moves)} (${opening.n})`).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function RepertoireCard({ rep, rows, query }: { rep: RepertoireRow; rows: MatchRow[]; query: string }) {
  const entered = rows.filter((row) => row.match.repertoireId === rep.id)
  const points = entered.reduce((sum, row) => sum + resultPoints(row.game.result), 0)
  let followed = 0
  let youLeft = 0
  let opponentLeft = 0
  for (const row of entered) {
    if (row.match.status === 'user-left') youLeft++
    else if (row.match.status === 'opponent-left') opponentLeft++
    else followed++ // book-end and game-ended: the game never left the book
  }
  const pct = (n: number) => (entered.length === 0 ? 0 : Math.round((n / entered.length) * 100))
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-base font-semibold">{rep.name}</h2>
      <p className="mt-1 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
        {entered.length} games · score {Math.round(scoreOf(points, entered.length) * 100)}%
      </p>
      <p className="mt-1 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
        followed to the end {pct(followed)}% · you left {pct(youLeft)}% · opponent left {pct(opponentLeft)}%
      </p>
      <p className="mt-2 text-sm">
        <Link
          href={`/repertoire/${rep.slug}${query}`}
          className="font-medium text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
        >
          Explore →
        </Link>
      </p>
    </section>
  )
}

function DeviationSection({
  title,
  caption,
  rows,
  kind,
  slugById,
  query,
}: {
  title: string
  caption: string
  rows: Deviation[]
  kind: 'opponent' | 'user'
  slugById: Map<number, string>
  query: string
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Nothing yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="px-3 py-2 text-left text-xs text-zinc-500 dark:text-zinc-400">{caption}</caption>
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">{kind === 'opponent' ? 'Their move' : 'Your move vs the book'}</th>
                <th className="px-3 py-2 text-right font-medium">Games</th>
                <th className="px-3 py-2 text-right font-medium">Your score</th>
                <th className="px-3 py-2 font-medium">Explore</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const ply = row.line.length + 1
                const move =
                  kind === 'opponent' || row.bookSans.length === 0
                    ? `${moveNo(ply)}${row.san}`
                    : `${moveNo(ply)}${row.san} (book: ${row.bookSans.map((san) => moveNo(ply) + san).join(', ')})`
                const slug = slugById.get(row.repertoireId)
                return (
                  <tr key={i} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 font-mono">{formatLine(row.line)}</td>
                    <td className="px-3 py-2 font-mono">{move}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.n}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(row.score * 100)}%</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {slug && (
                        <Link
                          href={`/repertoire/${slug}?path=${encodeURIComponent(row.line.join(' '))}${query}`}
                          className="text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
                        >
                          Explore →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Per color: how many games never entered a repertoire, and their most common starts. */
function neverInBookRows(rows: MatchRow[]): { color: UserColor; n: number; openings: { moves: string[]; n: number }[] }[] {
  const out: { color: UserColor; n: number; openings: { moves: string[]; n: number }[] }[] = []
  for (const color of ['white', 'black'] as const) {
    const games = rows.filter((row) => row.match.repertoireId === null && row.game.userColor === color)
    if (games.length === 0) continue
    const byPair = new Map<string, { moves: string[]; n: number }>()
    for (const row of games) {
      const moves = row.game.sans.slice(0, 2)
      if (moves.length === 0) continue
      const key = moves.join(' ')
      const entry = byPair.get(key) ?? { moves, n: 0 }
      entry.n++
      byPair.set(key, entry)
    }
    const openings = [...byPair.values()].sort((a, b) => b.n - a.n || a.moves.join(' ').localeCompare(b.moves.join(' '))).slice(0, 5)
    out.push({ color, n: games.length, openings })
  }
  return out
}

/** The filter query string to carry into Explore links. */
function filterQuery(sp: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams()
  for (const key of ['account', 'speed', 'rated', 'range'] as const) {
    const value = sp[key]
    if (typeof value === 'string') qs.set(key, value)
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}
