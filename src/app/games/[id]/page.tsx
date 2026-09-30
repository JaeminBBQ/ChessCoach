import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import AnalyzeButton from '@/components/analysis/analyze-button'
import EngineCredit from '@/components/analysis/engine-credit'
import { getDb } from '@/lib/db/client'
import { formatScore } from '@/lib/engine/uci'
import { getAnalysis, getGameForUser } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

/** Minimal game page: header, analyze button, and the raw per-move engine table. T005 replaces the table with the review UI. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const db = getDb()
  const userId = getCurrentUserId(db)
  const game = getGameForUser(db, userId, Number(id))
  if (!game) notFound()
  const analysis = getAnalysis(db, userId, game.id)

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <Link href="/games" className="text-sm underline">
          ← Games
        </Link>
        <h1 className="text-xl font-semibold">
          {game.userColor === 'white' ? 'White' : 'Black'} vs {game.opponentName ?? 'Unknown'}
          {game.opponentRating ? ` (${game.opponentRating})` : ''}: {game.result}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {new Date(game.playedAt).toLocaleString()} · {game.speed} {game.timeControl ?? ''} · {game.openingName ?? 'Unknown opening'} ·{' '}
          <a href={game.url} target="_blank" rel="noreferrer" className="underline">
            view on {game.platform === 'lichess' ? 'Lichess' : 'Chess.com'}
          </a>
        </p>
      </div>

      <AnalyzeButton gameId={game.id} label={analysis ? 'Re-analyze' : 'Analyze with Stockfish'} />

      {analysis && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Move</th>
                <th className="py-1 pr-3">Eval after</th>
                <th className="py-1 pr-3">Engine best (before)</th>
                <th className="py-1 pr-3">Depth</th>
              </tr>
            </thead>
            <tbody>
              {analysis.plies.slice(1).map((p) => {
                const before = analysis.plies[p.ply - 1]
                const moveNo = `${Math.ceil(p.ply / 2)}${p.ply % 2 === 1 ? '.' : '...'}`
                return (
                  <tr key={p.ply} className="border-t border-black/5 dark:border-white/10">
                    <td className="py-1 pr-3 tabular-nums">{moveNo}</td>
                    <td className="py-1 pr-3 font-medium">{p.move?.san}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {p.terminal === 'checkmate' ? 'Checkmate' : p.terminal === 'stalemate' ? 'Stalemate' : p.eval ? formatScore(p.eval) : '—'}
                    </td>
                    <td className="py-1 pr-3">
                      {before.best ? `${before.best.san} (${formatScore(before.best.eval)})` : '—'}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{p.depth || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <EngineCredit />
    </main>
  )
}
