import { connection } from 'next/server'

import AdjustPlan from '@/components/plan/adjust-plan'
import PlanTaskCheck from '@/components/plan/plan-task-check'
import Scorecard from '@/components/plan/scorecard'
import SyncAnalyze from '@/components/plan/sync-analyze'
import { getDb } from '@/lib/db/client'
import { buildPlan, focusMetricForWeek, focusTrendSentence, formatMetric, patternFocusMetric, FOCUS_MIN_WEEK_ANALYZED, type FocusMetric, type TrendPoint } from '@/lib/plan/plan'
import { weeklyMetrics } from '@/lib/plan/metrics'
import type { PlanTask } from '@/lib/plan/types'
import { MOTIF_METRIC_LABEL } from '@/lib/analysis/patterns'
import { lastNWeeks, weekRange, weekStart } from '@/lib/plan/week'
import { loadCoachGames } from '@/lib/server/coach'
import { listAccounts } from '@/lib/server/games'
import {
  drillReviewsThisWeek,
  getOrCreatePlan,
  getSettings,
  listDrillReviews,
  listPlanPatterns,
  listReviews,
  listTaskChecks,
  recentGames,
  taskChecksForWeek,
} from '@/lib/server/plan'
import { getCurrentUserId } from '@/lib/server/session'
import { currentTimeMs } from '@/lib/server/training'

export default async function PlanPage() {
  // The page reads the DB per request; never prerender it.
  await connection()
  const db = getDb()
  const userId = getCurrentUserId(db)
  const now = currentTimeMs()
  const settings = getSettings(db, userId)
  const { timezone, weeklyGames, planSpeed, puzzlesPerWeek } = settings
  const week = weekRange(now, timezone)

  // One pass over the last year's rated games: focus, tasks, and the scorecard.
  const coachGames = loadCoachGames(db, userId, { range: '1y', rated: true })
  const planRow = getOrCreatePlan(db, userId, week.start, coachGames, timezone, now)
  const stored = planRow.baseline

  const scorecardWeeks = lastNWeeks(now, timezone, 8)
  const metricsSince = scorecardWeeks[0]
  const reviews = listReviews(db, userId, metricsSince)
  const drillReviews = listDrillReviews(db, userId, metricsSince)
  const drillsThisWeek = drillReviewsThisWeek(db, userId, week)

  const weekGames = coachGames.filter((game) => game.playedAt >= week.start && game.playedAt < week.end)
  const storedPattern = stored.pattern
  const plan = buildPlan({
    settings: { timezone, weeklyGames, planSpeed, puzzlesPerWeek },
    weekGames: weekGames.map((game) => ({
      id: game.id,
      playedAt: game.playedAt,
      speed: game.speed,
      result: game.result,
      opponentName: game.opponentName,
    })),
    recentGames: recentGames(db, userId, 3),
    analyzedIds: new Set(coachGames.filter((game) => game.analysis !== null).map((game) => game.id)),
    reviewedIds: new Set(reviews.map((review) => review.gameId)),
    drillReviews: drillsThisWeek,
    focus: stored.focus,
    pattern:
      storedPattern === null
        ? null
        : {
            motif: storedPattern.motif,
            label: storedPattern.label,
            count: storedPattern.count,
            theme: storedPattern.theme,
            themeUrl: storedPattern.themeUrl,
          },
    manualChecks: taskChecksForWeek(db, userId, week.start),
  })

  // The focus metric live for this week (the focus itself is fixed by the plan row).
  const focusId = stored.focus?.id ?? null
  const thisWeekMetric = focusId === null ? null : focusMetricForWeek(focusId, coachGames, week)
  const analyzedThisWeek = weekGames.filter((game) => game.analysis !== null).length
  const thisWeekPatternMetric =
    focusId === null || storedPattern === null
      ? null
      : patternFocusMetric(focusId, storedPattern.motif, weekGames)
  const trendPoints: TrendPoint[] = scorecardWeeks.map((start) => {
    const metric = focusId === null ? null : focusMetricForWeek(focusId, coachGames, weekRange(start, timezone))
    return metric === null ? { value: null, sample: 0 } : { value: metric.value, sample: metric.sample }
  })
  const trendMetric = thisWeekMetric ?? stored.metric
  const trendSentence = trendMetric === null ? null : focusTrendSentence(trendMetric, trendPoints)

  const scorecard = weeklyMetrics(
    {
      games: coachGames.map((game) => ({
        id: game.id,
        playedAt: game.playedAt,
        speed: game.speed,
        result: game.result,
        userColor: game.userColor,
        userRating: game.userRating,
        opponentName: game.opponentName,
      })),
      analyses: coachGames
        .filter((game) => game.analysis !== null)
        .map((game) => ({ gameId: game.id, analysis: game.analysis! })),
      reviews,
      drillReviews,
      settings: { timezone, weeklyGames, planSpeed, puzzlesPerWeek },
      pattern: focusId !== null && storedPattern !== null ? { focusId, motif: storedPattern.motif } : null,
      plans: listPlanPatterns(db, userId, metricsSince),
      taskChecks: listTaskChecks(db, userId, metricsSince),
    },
    timezone,
    now,
  )

  const accounts = listAccounts(db, userId)
  const lastSyncAt = accounts.reduce<number | null>(
    (latest, account) => (account.lastSyncedAt !== null && (latest === null || account.lastSyncedAt > latest) ? account.lastSyncedAt : latest),
    null,
  )

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
      <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        Week of {new Date(week.start).toLocaleDateString()} · {timezone}
      </p>

      <section className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <SyncAnalyze
          accountIds={accounts.map((account) => account.id)}
          syncSince={weekStart(week.start - 1, timezone)}
          lastSyncAt={lastSyncAt}
        />
      </section>

      <FocusCard
        focus={stored.focus}
        baseline={stored.metric}
        thisWeek={thisWeekMetric}
        analyzedThisWeek={analyzedThisWeek}
        pattern={storedPattern}
        thisWeekPattern={thisWeekPatternMetric}
      />

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">This week</h2>
        <ul className="mt-3 space-y-2">
          {plan.tasks.map((task) => (
            <TaskRow key={task.id} task={task} weekStart={week.start} />
          ))}
        </ul>
      </section>

      <div className="mt-6">
        <AdjustPlan weeklyGames={weeklyGames} planSpeed={planSpeed} puzzlesPerWeek={puzzlesPerWeek} timezone={timezone} />
      </div>

      <Scorecard
        rows={scorecard}
        planSpeed={planSpeed}
        trendSentence={trendSentence}
        patternLabel={
          storedPattern === null ? null : `${MOTIF_METRIC_LABEL[storedPattern.motif]}/game`
        }
      />
    </main>
  )
}

function FocusCard({
  focus,
  baseline,
  thisWeek,
  analyzedThisWeek,
  pattern,
  thisWeekPattern,
}: {
  focus: { id: string; title: string; habit: string } | null
  baseline: FocusMetric | null
  thisWeek: FocusMetric | null
  analyzedThisWeek: number
  pattern: { label: string; metric: FocusMetric | null } | null
  thisWeekPattern: FocusMetric | null
}) {
  const enoughGames = analyzedThisWeek >= FOCUS_MIN_WEEK_ANALYZED
  return (
    <section className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight">Focus of the week</h2>
      {focus === null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No clear weaknesses yet — analyze at least 20 games to unlock a focus.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium">{focus.title}</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{focus.habit}</p>
          <p className="mt-3 text-sm tabular-nums">
            {baseline !== null && (
              <>
                <span className="text-zinc-500 dark:text-zinc-400">Previous 4 weeks: </span>
                {formatMetric(baseline)} <span className="text-zinc-500 dark:text-zinc-400">({baseline.sample} games) → </span>
              </>
            )}
            <span className="text-zinc-500 dark:text-zinc-400">This week: </span>
            {!enoughGames ? (
              <span className="text-zinc-500 dark:text-zinc-400">not enough games yet ({analyzedThisWeek} analyzed)</span>
            ) : thisWeek !== null ? (
              <>
                {formatMetric(thisWeek)} <span className="text-zinc-500 dark:text-zinc-400">({thisWeek.sample} games)</span>
              </>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">no data yet</span>
            )}
          </p>
          {pattern !== null && (
            <p className="mt-2 text-sm tabular-nums">
              <span className="text-zinc-500 dark:text-zinc-400">Top pattern: {pattern.label} — </span>
              {pattern.metric !== null ? (
                <>
                  {formatMetric(pattern.metric)} <span className="text-zinc-500 dark:text-zinc-400">({pattern.metric.sample} games) → </span>
                </>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">no baseline → </span>
              )}
              {!enoughGames ? (
                <span className="text-zinc-500 dark:text-zinc-400">not enough games yet</span>
              ) : thisWeekPattern !== null ? (
                <>
                  {formatMetric(thisWeekPattern)}{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">({thisWeekPattern.sample} games)</span>
                </>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">no data yet</span>
              )}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function TaskRow({ task, weekStart }: { task: PlanTask; weekStart: number }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <span className="text-base" aria-hidden>
        {task.complete ? '✓' : '○'}
      </span>
      <span className="text-sm font-medium">{task.title}</span>
      {task.manual === true ? (
        <PlanTaskCheck weekStart={weekStart} taskId={task.id} done={task.complete} />
      ) : (
        <span className={`text-sm tabular-nums ${task.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {task.done}/{task.target} {task.unit}
        </span>
      )}
      {task.links.length > 0 && (
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {task.links.map((link) => (
            <a key={link.href} href={link.href} className="underline underline-offset-2 hover:text-foreground">
              {link.label}
            </a>
          ))}
        </span>
      )}
      <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">{task.why}</p>
    </li>
  )
}
