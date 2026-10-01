import type { WeekRow } from '@/lib/plan/metrics'
import type { Speed } from '@/lib/db/schema'

const thClass =
  'px-2 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 first:text-left dark:text-zinc-400'
const tdClass =
  'px-2 py-1.5 text-right text-sm tabular-nums first:text-left first:whitespace-nowrap'
const muted = 'text-zinc-500 dark:text-zinc-400'

/** "2 rapid · 1 blitz", most-played first, or —. */
function gamesLabel(row: WeekRow): string {
  if (row.totalGames === 0) return '—'
  return (Object.keys(row.gamesBySpeed) as Speed[])
    .map((speed) => `${row.gamesBySpeed[speed]} ${speed}`)
    .join(' · ')
}

function ratingCell(row: WeekRow, planSpeed: Speed) {
  const parts: { label: string; value: number | null; sample: string }[] = [
    { label: planSpeed, value: row.planSpeedRating, sample: `no rated ${planSpeed} games` },
  ]
  if (row.topSpeed !== null && row.topSpeed !== planSpeed) {
    parts.push({ label: row.topSpeed, value: row.topSpeedRating, sample: `no rated ${row.topSpeed} games` })
  }
  return (
    <td className={tdClass}>
      {parts.map((part, i) => (
        <span key={part.label}>
          {i > 0 && <span className={muted}> · </span>}
          {part.value === null ? (
            <span className={muted} title={part.sample}>
              —
            </span>
          ) : (
            <span title={`rating in ${part.label} at week end`}>
              {part.value} <span className={muted}>{part.label}</span>
            </span>
          )}
        </span>
      ))}
    </td>
  )
}

/** A metric cell: the value, or — with a tooltip naming the sample. */
function metricCell(value: number | null, sample: string, format: (n: number) => string) {
  return (
    <td className={tdClass}>
      {value === null ? (
        <span className={muted} title={sample}>
          —
        </span>
      ) : (
        <span title={`${sample} · ${format(value)}`}>{format(value)}</span>
      )}
    </td>
  )
}

/** A tiny inline-SVG sparkline of the metric across the weeks (oldest → newest). */
function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.map((value, i) => ({ i, value })).filter((p) => p.value !== null)
  if (points.length < 2) return <svg className="h-3 w-10" aria-hidden="true" />
  const values2 = points.map((p) => p.value!)
  const min = Math.min(...values2)
  const max = Math.max(...values2)
  const span = max - min || 1
  const coords = points
    .map((p) => `${((p.i / (values.length - 1)) * 100).toFixed(1)},${(100 - ((p.value! - min) / span) * 80 - 10).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-3 w-10" aria-hidden="true">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="4" vectorEffect="non-scaling-stroke" className="text-sky-600 dark:text-sky-400" />
    </svg>
  )
}

/** A header cell: label plus a sparkline of the column's values. */
function MetricHeader({ label, values }: { label: string; values: (number | null)[] }) {
  return (
    <th className={thClass}>
      <span className="inline-flex flex-col items-end gap-0.5">
        <span>{label}</span>
        <Sparkline values={values} />
      </span>
    </th>
  )
}

/** The last-8-weeks scorecard; metrics without enough data show — with the sample in a tooltip. */
export default function Scorecard({
  rows,
  planSpeed,
  trendSentence,
  patternLabel,
}: {
  rows: WeekRow[]
  planSpeed: Speed
  trendSentence: string | null
  /** The focus's top pattern column label ("Hanging pieces/game"), or null to hide it. */
  patternLabel: string | null
}) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight">Weekly scorecard</h2>
      {trendSentence !== null ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{trendSentence}</p>
      ) : (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Not enough weeks of data for a trend yet.</p>
      )}
      <div className="mt-3 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className={thClass}>Week</th>
              <th className={thClass}>Games</th>
              <MetricHeader label="Score" values={rows.map((row) => row.score)} />
              <th className={thClass}>Rating</th>
              <th className={thClass}>Analyzed</th>
              <MetricHeader label="Mistakes/game" values={rows.map((row) => row.mistakesPerGame)} />
              <MetricHeader label="Missed/game" values={rows.map((row) => row.missedPerGame)} />
              {patternLabel !== null && (
                <MetricHeader label={patternLabel} values={rows.map((row) => row.patternPerGame)} />
              )}
              <MetricHeader label="Conversion" values={rows.map((row) => row.conversionPct)} />
              <MetricHeader label="Puzzles" values={rows.map((row) => row.puzzlesSolved)} />
              <MetricHeader label="Reviews" values={rows.map((row) => row.reviewsDone)} />
              <MetricHeader label="Plan tasks" values={rows.map((row) => (row.tasksTotal > 0 ? (row.tasksDone / row.tasksTotal) * 100 : null))} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.weekStart} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className={tdClass} title={weekTitle(row)}>
                  {weekLabel(row.weekStart)}
                </td>
                <td className={tdClass}>{gamesLabel(row)}</td>
                {metricCell(row.score, `${row.totalGames} games`, (n) => `${Math.round(n)}%`)}
                {ratingCell(row, planSpeed)}
                <td className={tdClass}>{row.analyzed}</td>
                {metricCell(row.mistakesPerGame, `${row.analyzed} analyzed games`, (n) => n.toFixed(2))}
                {metricCell(row.missedPerGame, `${row.analyzed} analyzed games`, (n) => n.toFixed(2))}
                {patternLabel !== null &&
                  metricCell(row.patternPerGame, `${row.analyzed} analyzed games`, (n) => n.toFixed(2))}
                {metricCell(row.conversionPct, `${row.analyzed} analyzed games`, (n) => `${Math.round(n)}%`)}
                <td className={tdClass}>{row.puzzlesSolved}</td>
                <td className={tdClass}>{row.reviewsDone}</td>
                <td className={tdClass}>
                  <span title="plan tasks completed that week">
                    {row.tasksDone}/{row.tasksTotal}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function weekLabel(weekStart: number): string {
  return new Date(weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function weekTitle(row: WeekRow): string {
  const end = new Date(row.end - 1)
  return `Week of ${new Date(row.weekStart).toLocaleDateString()} – ${end.toLocaleDateString()}`
}
