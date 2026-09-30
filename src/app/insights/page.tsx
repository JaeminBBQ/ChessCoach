import Link from 'next/link'
import { connection } from 'next/server'

import GamesFilters from '@/components/games-filters'
import {
  byColor,
  byOpening,
  byOpeningTree,
  byRatingDiff,
  byTermination,
  firstMoves,
  ratingSeries,
  scoreOf,
  sessions,
  type InsightGame,
  type OpeningRow,
  type RatingSeries,
  type ScoreSummary,
  type SessionStats,
  type TerminationRow,
  type Terminations,
} from '@/lib/analysis/insights'
import { getDb } from '@/lib/db/client'
import { speeds, userColors, type Speed, type UserColor } from '@/lib/db/schema'
import { listAccounts, type AccountWithGames } from '@/lib/server/games'
import { loadInsightGames, ranges, type Range } from '@/lib/server/insights'
import { getCurrentUserId } from '@/lib/server/session'

const selectClass =
  'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15'

const RANGE_LABELS: Record<Range, string> = {
  '90d': 'last 90 days',
  '1y': 'last year',
  all: 'all time',
}

const CHART_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

interface FilterState {
  accountId?: number
  speed?: Speed
  rated: boolean
  range: Range
}

export default async function InsightsPage({
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
  const rangeGames = loadInsightGames(db, userId, {
    accountId: filters.accountId,
    rated: filters.rated,
    range: filters.range,
  })
  const defaultSpeed = mostPlayedSpeed(rangeGames)
  filters.speed =
    sp.speed === 'all' ? undefined : (pick(speeds, sp.speed) ?? defaultSpeed)
  const games =
    filters.speed === undefined ? rangeGames : rangeGames.filter((game) => game.speed === filters.speed)

  // Opening drill-down: `line` is dot-joined SAN moves, `color` the user's side.
  const line = parseLine(sp.line)
  const drillColor = line.length > 0 ? pick(userColors, sp.color) : undefined

  const total = scoreOf(games)
  const colors = byColor(games)
  const openings = byOpening(games, 6)
  const whiteRows = openings.filter((row) => row.color === 'white').slice(0, 15)
  const blackRows = openings.filter((row) => row.color === 'black').slice(0, 15)
  const terminations = byTermination(games)
  const bands = byRatingDiff(games)
  const sessionStats = sessions(games)
  const series = ratingSeries(games)
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const drillRows =
    line.length > 0 && drillColor !== undefined ? byOpeningTree(games, drillColor, line) : []
  const lineGames =
    line.length > 0 && drillColor !== undefined
      ? games.filter(
          (game) =>
            game.userColor === drillColor && sameMoves(firstMoves(game.pgn, line.length), line),
        )
      : []

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {total.n} games · {RANGE_LABELS[filters.range]} · {filters.speed ?? 'all speeds'} ·{' '}
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
          {line.length > 0 && drillColor !== undefined && (
            <>
              <input type="hidden" name="line" value={line.join('.')} />
              <input type="hidden" name="color" value={drillColor} />
            </>
          )}
        </div>
      </GamesFilters>

      {total.n === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          No games match these filters.{' '}
          <Link href="/accounts" className="underline underline-offset-2 hover:text-foreground">
            Link an account.
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Games" value={String(total.n)} />
            <Stat label="Score" value={pct(total)} />
            <Stat label="As White" value={pct(colors.white)} />
            <Stat label="As Black" value={pct(colors.black)} />
          </div>
          <Takeaway text={summaryTakeaway(total, colors)} />

          <Section title="Rating trend">
            <Takeaway text={chartTakeaway(series, accountById)} />
            <RatingChart series={series} accountById={accountById} />
          </Section>

          <Section title="Openings">
            {line.length > 0 && drillColor !== undefined ? (
              <>
                <OpeningBreadcrumb line={line} color={drillColor} filters={filters} />
                <Takeaway text={drillTakeaway(lineGames, line)} />
                <h3 className="mt-4 text-sm font-medium">
                  Next move after {formatLine(line)} as {drillColor === 'white' ? 'White' : 'Black'}
                </h3>
                <OpeningTable rows={drillRows} filters={filters} />
              </>
            ) : (
              <>
                <Takeaway text={openingTakeaway([...whiteRows, ...blackRows])} />
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium">As White</h3>
                    <OpeningTable rows={whiteRows} filters={filters} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">As Black</h3>
                    <OpeningTable rows={blackRows} filters={filters} />
                  </div>
                </div>
              </>
            )}
          </Section>

          <Section title="How games end">
            <Takeaway text={terminationTakeaway(terminations)} />
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Your wins</h3>
                <TerminationTable rows={terminations.wins} />
              </div>
              <div>
                <h3 className="text-sm font-medium">Your losses</h3>
                <TerminationTable rows={terminations.losses} highlightTime />
              </div>
            </div>
          </Section>

          <Section title="Opponent strength">
            <Takeaway text={ratingTakeaway(games)} />
            <div className="mt-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="px-3 py-2 font-medium">Opponent minus your rating</th>
                    <th className="px-3 py-2 text-right font-medium">Games</th>
                    <th className="px-3 py-2 text-right font-medium">W</th>
                    <th className="px-3 py-2 text-right font-medium">L</th>
                    <th className="px-3 py-2 text-right font-medium">D</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band) => (
                    <tr
                      key={band.label}
                      className="border-b border-black/5 align-middle last:border-0 dark:border-white/5"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap">{band.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                        {band.n}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{band.wins}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{band.losses}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{band.draws}</td>
                      <td className="px-3 py-1.5">
                        <ScoreBar score={band.score} n={band.n} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Sessions and tilt">
            <Takeaway text={sessionTakeaway(sessionStats)} />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {sessionStats.sessionCount} sessions · {sessionStats.avgGamesPerSession.toFixed(1)} games
              per session on average
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Score by game in the session</h3>
                <div className="mt-2">
                  {sessionStats.byGameIndex.map((bucket) => (
                    <BarRow key={bucket.label} label={gameIndexLabel(bucket.label)} summary={bucket} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium">Score after the previous result</h3>
                <div className="mt-2">
                  <BarRow label="After a win" summary={sessionStats.afterResult.afterWin} />
                  <BarRow label="After a loss" summary={sessionStats.afterResult.afterLoss} />
                  <BarRow label="After a draw" summary={sessionStats.afterResult.afterDraw} />
                </div>
              </div>
            </div>
          </Section>
        </>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Takeaway({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p data-takeaway className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
      {text}
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  )
}

function OpeningTable({ rows, filters }: { rows: OpeningRow[]; filters: FilterState }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No games reach this line.</p>
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <th className="px-3 py-2 font-medium">Line</th>
            <th className="px-3 py-2 text-right font-medium">Games</th>
            <th className="px-3 py-2 text-right font-medium">W</th>
            <th className="px-3 py-2 text-right font-medium">L</th>
            <th className="px-3 py-2 text-right font-medium">D</th>
            <th className="px-3 py-2 font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.moves.join(' ')}
              className="border-b border-black/5 align-middle last:border-0 dark:border-white/5"
            >
              <td className="px-3 py-1.5">
                <Link
                  href={lineHref(filters, row.color, row.moves)}
                  className="font-medium whitespace-nowrap hover:underline"
                >
                  {formatLine(row.moves)}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.n}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.wins}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.losses}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.draws}</td>
              <td className="px-3 py-1.5">
                <ScoreBar score={row.score} n={row.n} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TerminationTable({ rows, highlightTime }: { rows: TerminationRow[]; highlightTime?: boolean }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">None.</p>
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <th className="px-3 py-2 font-medium">How</th>
            <th className="px-3 py-2 text-right font-medium">Games</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const timeLoss = highlightTime === true && isTimeOrAbandon(row.termination)
            return (
              <tr
                key={row.termination}
                className={`border-b border-black/5 align-middle last:border-0 dark:border-white/5 ${
                  timeLoss ? 'bg-red-500/10' : ''
                }`}
              >
                <td
                  className={`px-3 py-1.5 capitalize ${
                    timeLoss ? 'font-medium text-red-700 dark:text-red-400' : ''
                  }`}
                >
                  {row.termination}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.n}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Math.round(row.share * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RatingChart({
  series,
  accountById,
}: {
  series: RatingSeries[]
  accountById: Map<number, AccountWithGames>
}) {
  const charted = series.filter((entry) => entry.points.length > 0)
  if (charted.length === 0) return null
  const allPoints = charted.flatMap((entry) => entry.points)
  const tMin = Math.min(...allPoints.map((point) => point.t))
  const tMax = Math.max(...allPoints.map((point) => point.t))
  const ratingMin = Math.min(...allPoints.map((point) => point.rating))
  const ratingMax = Math.max(...allPoints.map((point) => point.rating))
  const pad = Math.max(25, (ratingMax - ratingMin) * 0.1)
  const rMin = ratingMin - pad
  const rMax = ratingMax + pad
  const x = (t: number) => (tMax === tMin ? 50 : ((t - tMin) / (tMax - tMin)) * 100)
  const y = (rating: number) => (rMax === rMin ? 50 : 100 - ((rating - rMin) / (rMax - rMin)) * 100)

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        {charted.map((entry, i) => (
          <span key={`${entry.accountId}-${entry.speed}`} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {seriesLabel(entry, accountById)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <div className="flex h-48 w-12 shrink-0 flex-col justify-between text-right text-[10px] leading-none text-zinc-500 dark:text-zinc-400">
          <span>{Math.round(rMax)}</span>
          <span>{Math.round((rMin + rMax) / 2)}</span>
          <span>{Math.round(rMin)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full" aria-hidden="true">
            {[0, 50, 100].map((gy) => (
              <line
                key={gy}
                x1="0"
                y1={gy}
                x2="100"
                y2={gy}
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                className="text-black/10 dark:text-white/10"
              />
            ))}
            {charted.map((entry, i) => (
              <polyline
                key={`${entry.accountId}-${entry.speed}`}
                points={entry.points
                  .map((point) => `${x(point.t).toFixed(2)},${y(point.rating).toFixed(2)}`)
                  .join(' ')}
                fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-14 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span>{axisDate(tMin)}</span>
        <span>{axisDate(tMax)}</span>
      </div>
      <p className="sr-only">
        {charted
          .map(
            (entry) =>
              `${seriesLabel(entry, accountById)}: ${entry.points[0].rating} to ${entry.points[entry.points.length - 1].rating}.`,
          )
          .join(' ')}
      </p>
    </div>
  )
}

function OpeningBreadcrumb({
  line,
  color,
  filters,
}: {
  line: string[]
  color: UserColor
  filters: FilterState
}) {
  return (
    <nav aria-label="Opening line" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
      <Link
        href={`/insights?${filterParams(filters).toString()}`}
        className="text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
      >
        All lines
      </Link>
      {line.map((move, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>
            ›
          </span>
          {i === line.length - 1 ? (
            <span className="font-medium">{formatMoveAt(move, i)}</span>
          ) : (
            <Link
              href={lineHref(filters, color, line.slice(0, i + 1))}
              className="underline-offset-2 hover:underline"
            >
              {formatMoveAt(move, i)}
            </Link>
          )}
        </span>
      ))}
      <span className="text-zinc-500 dark:text-zinc-400">as {color === 'white' ? 'White' : 'Black'}</span>
    </nav>
  )
}

function BarRow({ label, summary }: { label: string; summary: ScoreSummary }) {
  const barPct = summary.n === 0 ? null : Math.round(summary.score * 100)
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-32 shrink-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{summary.n} games</div>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className={`h-full rounded-full ${barColor(barPct)}`} style={{ width: `${barPct ?? 0}%` }} />
      </div>
      <div className={`w-12 shrink-0 text-right text-sm tabular-nums ${scoreText(barPct)}`}>
        {barPct === null ? '—' : `${barPct}%`}
      </div>
    </div>
  )
}

function ScoreBar({ score, n }: { score: number; n: number }) {
  const barPct = n === 0 ? null : Math.round(score * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className={`h-full rounded-full ${barColor(barPct)}`} style={{ width: `${barPct ?? 0}%` }} />
      </div>
      <span className={`w-10 shrink-0 text-right text-xs tabular-nums ${scoreText(barPct)}`}>
        {barPct === null ? '—' : `${barPct}%`}
      </span>
    </div>
  )
}

function barColor(barPct: number | null): string {
  if (barPct === null) return 'bg-zinc-300 dark:bg-zinc-700'
  if (barPct >= 55) return 'bg-emerald-500'
  if (barPct <= 40) return 'bg-red-500'
  return 'bg-amber-500'
}

function scoreText(barPct: number | null): string {
  if (barPct === null) return 'text-zinc-500 dark:text-zinc-400'
  if (barPct >= 55) return 'text-emerald-600 dark:text-emerald-400'
  if (barPct <= 40) return 'text-red-600 dark:text-red-400'
  return 'text-zinc-600 dark:text-zinc-300'
}

/** Renders moves as '1.e4 e5 2.Nf3 Nf6' — numbering restarts at the first move. */
function formatLine(moves: readonly string[]): string {
  return moves.map(formatMoveAt).join(' ')
}

function formatMoveAt(move: string, i: number): string {
  return i % 2 === 0 ? `${i / 2 + 1}.${move}` : move
}

function gameIndexLabel(label: string): string {
  if (label === '1' || label === '2' || label === '3') return `Game ${label}`
  if (label === '4–6') return 'Games 4–6'
  return 'Game 7+'
}

function seriesLabel(entry: RatingSeries, accountById: Map<number, AccountWithGames>): string {
  const account = accountById.get(entry.accountId)
  const platform = account?.platform === 'lichess' ? 'Lichess' : 'Chess.com'
  const username = account?.username ?? `account ${entry.accountId}`
  return `${platform} ${username} · ${entry.speed}`
}

function pct(summary: ScoreSummary): string {
  return summary.n === 0 ? '—' : `${Math.round(summary.score * 100)}%`
}

function summaryTakeaway(
  total: ScoreSummary,
  colors: { white: ScoreSummary; black: ScoreSummary },
): string | null {
  if (total.n === 0) return null
  return `You score ${pct(total)} over ${total.n} games: ${pct(colors.white)} as White and ${pct(colors.black)} as Black.`
}

function chartTakeaway(
  series: RatingSeries[],
  accountById: Map<number, AccountWithGames>,
): string | null {
  const charted = series.filter((entry) => entry.points.length > 0)
  if (charted.length === 0) return null
  const biggest = [...charted].sort((a, b) => b.points.length - a.points.length)[0]
  const first = biggest.points[0].rating
  const last = biggest.points[biggest.points.length - 1].rating
  const label = seriesLabel(biggest, accountById)
  if (biggest.points.length === 1) return `${label}: ${first} (a single rated game in this range).`
  const delta = last - first
  return `${label}: ${first} → ${last} (${delta >= 0 ? '+' : ''}${delta}).`
}

function openingTakeaway(rows: OpeningRow[]): string | null {
  const candidates = rows.filter((row) => row.n >= 5)
  if (candidates.length === 0) return null
  let best = candidates[0]
  let worst = candidates[0]
  for (const row of candidates) {
    if (row.score > best.score) best = row
    if (row.score < worst.score) worst = row
  }
  const bestText = `${formatLine(best.moves)} ${best.color === 'white' ? 'as White' : 'as Black'} (${pct(best)} over ${best.n} games)`
  if (best === worst) return `Among lines with at least 5 games, your most reliable is ${bestText}.`
  return `Among lines with at least 5 games, your best is ${bestText} and your weakest is ${formatLine(worst.moves)} ${worst.color === 'white' ? 'as White' : 'as Black'} (${pct(worst)} over ${worst.n} games).`
}

function drillTakeaway(lineGames: InsightGame[], line: string[]): string | null {
  const summary = scoreOf(lineGames)
  if (summary.n === 0) return null
  return `In ${formatLine(line)} you score ${pct(summary)} (${summary.wins}W ${summary.losses}L ${summary.draws}D over ${summary.n} games).`
}

function terminationTakeaway(terminations: Terminations): string | null {
  if (terminations.losses.length === 0) return null
  const totalLosses = terminations.losses.reduce((sum, row) => sum + row.n, 0)
  const timeLosses = terminations.losses
    .filter((row) => isTimeOrAbandon(row.termination))
    .reduce((sum, row) => sum + row.n, 0)
  return `${Math.round((timeLosses / totalLosses) * 100)}% of your losses end by timeout or abandonment (${timeLosses} of ${totalLosses}).`
}

function ratingTakeaway(games: InsightGame[]): string | null {
  const stronger = games.filter(
    (game) =>
      game.userRating !== null &&
      game.opponentRating !== null &&
      game.opponentRating - game.userRating >= 101,
  )
  const weaker = games.filter(
    (game) =>
      game.userRating !== null &&
      game.opponentRating !== null &&
      game.opponentRating - game.userRating <= -101,
  )
  if (stronger.length === 0 && weaker.length === 0) return null
  const clauses: string[] = []
  if (stronger.length > 0)
    clauses.push(
      `${pct(scoreOf(stronger))} against opponents rated 100+ points higher (${stronger.length} games)`,
    )
  if (weaker.length > 0)
    clauses.push(
      `${pct(scoreOf(weaker))} against opponents rated 100+ points lower (${weaker.length} games)`,
    )
  return `You score ${clauses.join(' and ')}.`
}

function sessionTakeaway(stats: SessionStats): string | null {
  if (stats.sessionCount === 0) return null
  const clauses: string[] = []
  const first = stats.byGameIndex[0]
  if (first.n > 0) clauses.push(`${pct(first)} in the first game of a session (${first.n} games)`)
  const { afterWin, afterLoss, afterDraw } = stats.afterResult
  if (afterWin.n > 0) clauses.push(`${pct(afterWin)} right after a win (${afterWin.n} games)`)
  if (afterLoss.n > 0) clauses.push(`${pct(afterLoss)} right after a loss (${afterLoss.n} games)`)
  if (afterDraw.n > 0) clauses.push(`${pct(afterDraw)} right after a draw (${afterDraw.n} games)`)
  if (clauses.length === 0)
    return `You have played ${stats.sessionCount} sessions; not enough follow-up games to read tilt.`
  return `You score ${clauses.join(', ')}.`
}

function isTimeOrAbandon(termination: string): boolean {
  return /time|abandon/i.test(termination)
}

function axisDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })
}

function mostPlayedSpeed(games: readonly InsightGame[]): Speed | undefined {
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

function sameMoves(moves: readonly string[], line: readonly string[]): boolean {
  if (moves.length < line.length) return false
  for (let i = 0; i < line.length; i++) {
    if (moves[i] !== line[i]) return false
  }
  return true
}

function lineHref(filters: FilterState, color: UserColor, line: readonly string[]): string {
  const params = filterParams(filters)
  params.set('color', color)
  params.set('line', line.join('.'))
  return `/insights?${params.toString()}`
}

function filterParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.accountId !== undefined) params.set('account', String(filters.accountId))
  if (filters.speed !== undefined) params.set('speed', filters.speed)
  params.set('rated', String(filters.rated))
  params.set('range', filters.range)
  return params
}

function parseLine(value: string | string[] | undefined): string[] {
  return typeof value === 'string' ? value.split('.').filter(Boolean) : []
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}
