import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import AnalyzeButton from '@/components/analysis/analyze-button'
import EngineCredit from '@/components/analysis/engine-credit'
import ReviewPanel from '@/components/review/review-panel'
import { classifyMoves, evalSeries, gameSummary, keyMoments, type MoveJudgement } from '@/lib/analysis/classify'
import { isMissedChance } from '@/lib/analysis/coach'
import { parsePly, type GameAnalysis } from '@/lib/analysis/game-analysis'
import { mistakeMotif, missedMotif, MOTIF_LABEL } from '@/lib/analysis/motifs'
import { getDb } from '@/lib/db/client'
import { moveNo, type GameMatch } from '@/lib/repertoire/match'
import { getAnalysis, getGameForUser } from '@/lib/server/analyses'
import { getReview } from '@/lib/server/plan'
import { ensureGameMatch, getNodeLine, getRepertoireById } from '@/lib/server/repertoire'
import { getCurrentUserId } from '@/lib/server/session'

/** Game review: classification runs on the server; the client gets judgements, series, and plies. */
export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  const { id } = await params
  const sp = await searchParams
  const db = getDb()
  const userId = getCurrentUserId(db)
  const game = getGameForUser(db, userId, Number(id))
  if (!game) notFound()
  const analysis = getAnalysis(db, userId, game.id)

  const judgements = analysis ? classifyMoves(analysis) : []
  const userSummary = analysis ? gameSummary(judgements, game.userColor) : null
  const opponentSummary = analysis ? gameSummary(judgements, game.userColor === 'white' ? 'black' : 'white') : null
  const moments = analysis ? keyMoments(judgements, game.userColor) : []
  const series = analysis ? evalSeries(analysis) : []
  const initialPly = analysis ? parsePly(sp.ply, analysis.plies.length - 1) : 0
  const reviewedAt = getReview(db, userId, game.id)
  const motifLabels = analysis ? motifLabelsFor(analysis, judgements, game.userColor) : undefined

  const match = ensureGameMatch(db, userId, game.id)
  const repertoire = match && match.repertoireId !== null ? getRepertoireById(db, userId, match.repertoireId) : undefined
  const deviationPositionId =
    match && (match.status === 'user-left' || match.status === 'opponent-left') && match.leftPly !== null && match.leftPly >= 2
      ? match.positions[match.leftPly - 2]
      : undefined
  const nodeLine = deviationPositionId !== undefined ? getNodeLine(db, userId, deviationPositionId) : undefined

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <div className="space-y-1">
        <Link href="/games" className="text-sm underline underline-offset-2">
          ← Games
        </Link>
        <h1 className="text-xl font-semibold">
          {game.userColor === 'white' ? 'White' : 'Black'} vs {game.opponentName ?? 'Unknown'}
          {game.opponentRating ? ` (${game.opponentRating})` : ''}: {game.result}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {new Date(game.playedAt).toLocaleString()} · {game.speed} {game.timeControl ?? ''} ·{' '}
          {game.openingName ?? 'Unknown opening'} ·{' '}
          <a href={game.url} target="_blank" rel="noreferrer" className="underline">
            view on {game.platform === 'lichess' ? 'Lichess' : 'Chess.com'}
          </a>
        </p>
        {userSummary && opponentSummary && (
          <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
            Your accuracy {userSummary.accuracy} · Opponent {opponentSummary.accuracy} · You:{' '}
            {countText(userSummary.blunders, 'blunder')}, {countText(userSummary.mistakes, 'mistake')},{' '}
            {countText(userSummary.inaccuracies, 'inaccuracy', 'inaccuracies')}
          </p>
        )}
      </div>

      {match && (
        <BookBanner
          match={match}
          repertoireName={repertoire?.name}
          nodeLine={nodeLine ?? null}
          gameId={game.id}
          judgement={match.leftPly !== null ? judgements.find((j) => j.ply === match.leftPly) : undefined}
        />
      )}

      <AnalyzeButton gameId={game.id} label={analysis ? 'Re-analyze' : 'Analyze with Stockfish'} />

      <ReviewPanel
        gameId={game.id}
        reviewedAt={reviewedAt}
        review={
          analysis
            ? { plies: analysis.plies, judgements, series, moments, userColor: game.userColor, initialPly, motifLabels }
            : undefined
        }
      />

      {!analysis && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Analyze this game to get a move-by-move review with your mistakes and the moments that decided it.
        </p>
      )}

      <EngineCredit />
    </main>
  )
}

function countText(count: number, noun: string, plural: string = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`
}

const bannerClass = 'rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10'

/**
 * The one-line "where did this game leave your book" banner. The move links
 * jump the review board to that ply; Explore opens the book at the position
 * the deviation was played from. Deviations on the shared root moves show too
 * (without a repertoire name); book-end and game-ended only show when the
 * game actually entered a tree.
 */
function BookBanner({
  match,
  repertoireName,
  nodeLine,
  gameId,
  judgement,
}: {
  match: GameMatch
  repertoireName: string | undefined
  nodeLine: { slug: string; path: string } | null
  gameId: number
  judgement: MoveJudgement | undefined
}) {
  if (match.status === 'book-end') {
    if (repertoireName === undefined) return null
    const ply = match.leftPly
    return (
      <div className={bannerClass}>
        Followed your book to the end
        {ply !== null && (
          <a href={`/games/${gameId}?ply=${ply}`} className="underline underline-offset-2">
            {' '}
            (move {ply})
          </a>
        )}
        .
      </div>
    )
  }
  if (match.status === 'game-ended') {
    return repertoireName === undefined ? null : <div className={bannerClass}>Game ended inside your book.</div>
  }
  const ply = match.leftPly
  if (ply === null || match.leftSan === null) return null
  const moveLabel = `${moveNo(ply)}${match.leftSan}`
  const moveLink = (
    <a href={`/games/${gameId}?ply=${ply}`} className="font-mono underline underline-offset-2">
      {moveLabel}
    </a>
  )
  const explore =
    nodeLine !== null ? (
      <Link
        href={`/repertoire/${nodeLine.slug}?path=${encodeURIComponent(nodeLine.path)}`}
        className="text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
      >
        Explore →
      </Link>
    ) : null
  const judged =
    judgement !== undefined
      ? ` · ${judgement.judgement}${judgement.drop >= 0.5 ? `, −${Math.round(judgement.drop)}%` : ''}`
      : ''
  if (match.status === 'user-left') {
    const book = (match.bookSans ?? []).map((san) => moveNo(ply) + san).join(', ')
    return (
      <div className={bannerClass}>
        <strong>You strayed from your book</strong> at {moveLink}
        {book && <> (book: {book})</>}
        {repertoireName !== undefined && <> — {repertoireName}</>}
        {judged}. {explore}
      </div>
    )
  }
  return (
    <div className={bannerClass}>
      <strong>Your opponent left your book</strong> at {moveLink}: no prepared answer here. {explore}
    </div>
  )
}

/** Pattern labels for the user's mistakes and missed chances, by ply. */
function motifLabelsFor(
  analysis: GameAnalysis,
  judgements: MoveJudgement[],
  userColor: 'white' | 'black',
): Map<number, string> {
  const labels = new Map<number, string>()
  const byPly = new Map(judgements.map((j) => [j.ply, j]))
  for (const j of judgements) {
    if (j.color !== userColor) continue
    const previous = byPly.get(j.ply - 1)
    if (isMissedChance(previous, j)) {
      labels.set(j.ply, MOTIF_LABEL[missedMotif(analysis, j.ply).motif])
    } else if (j.judgement === 'mistake' || j.judgement === 'blunder') {
      labels.set(j.ply, MOTIF_LABEL[mistakeMotif(analysis, j.ply).motif])
    }
  }
  return labels
}
