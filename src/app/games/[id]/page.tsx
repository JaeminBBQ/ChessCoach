import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import AnalyzeButton from '@/components/analysis/analyze-button'
import EngineCredit from '@/components/analysis/engine-credit'
import GameReview from '@/components/analysis/game-review'
import { classifyMoves, evalSeries, gameSummary, keyMoments } from '@/lib/analysis/classify'
import { getDb } from '@/lib/db/client'
import { getAnalysis, getGameForUser } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

/** Game review: classification runs on the server; the client gets judgements, series, and plies. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
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

      <AnalyzeButton gameId={game.id} label={analysis ? 'Re-analyze' : 'Analyze with Stockfish'} />

      {analysis ? (
        <GameReview
          plies={analysis.plies}
          judgements={judgements}
          series={series}
          moments={moments}
          userColor={game.userColor}
        />
      ) : (
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
