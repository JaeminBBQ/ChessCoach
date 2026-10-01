import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Chess } from 'chess.js'

import ExplorerBoard from '@/components/repertoire/explorer-board'
import { firstMoves } from '@/lib/analysis/insights'
import { getDb } from '@/lib/db/client'
import { speeds } from '@/lib/db/schema'
import { buildBookIndex, bookStats, moveNo, nodeWin, scoreOf, type MatchRow } from '@/lib/repertoire/match'
import { listAccounts } from '@/lib/server/games'
import { ranges } from '@/lib/server/insights'
import {
  ensureGameRepertoire,
  getRepertoire,
  listRepertoires,
  loadGameMatches,
  loadRepertoireGames,
  loadRepertoireNodes,
  type NodeRow,
} from '@/lib/server/repertoire'
import { getCurrentUserId } from '@/lib/server/session'

/** The explorer: click through one repertoire tree, with evals, traps, and your games at each position. */
export default async function ExplorerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  const { slug } = await params
  const sp = await searchParams
  const db = getDb()
  const userId = getCurrentUserId(db)
  const rep = getRepertoire(db, userId, slug)
  if (!rep) notFound()

  const accounts = listAccounts(db, userId)
  const accountIds = new Set(accounts.map((account) => account.id))
  const rawAccountId = toNumber(sp.account)
  const filters = {
    accountId: rawAccountId !== undefined && accountIds.has(rawAccountId) ? rawAccountId : undefined,
    speed: sp.speed === 'all' ? undefined : (pick(speeds, sp.speed) ?? undefined),
    rated: sp.rated !== 'false',
    range: pick(ranges, sp.range) ?? 'all',
  }
  const query = filterQuery(sp)

  const nodes = loadRepertoireNodes(db, userId, rep.color)
  const treeNodes = nodes.filter((node) => node.repertoireId === rep.id)
  const byPath = new Map(treeNodes.map((node) => [node.path, node]))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  // An invalid path falls back to the tree root.
  const rootPath = rep.root.join(' ')
  const pathTokens = parsePath(sp.path)
  const current: NodeRow = byPath.get(pathTokens.join(' ')) ?? byPath.get(rootPath)!

  const index = buildBookIndex(nodes, listRepertoires(db, userId))
  const colorIndex = index[rep.color]
  const bookMoves = (colorIndex.movesAt.get(current.fenKey) ?? []).filter((move) => move.by === 'opponent')

  const games = loadRepertoireGames(db, userId, { ...filters, color: rep.color })
  ensureGameRepertoire(db, userId, games.map((game) => game.id))
  const matches = loadGameMatches(db, userId, games.map((game) => game.id))
  const rows: MatchRow[] = []
  for (const game of games) {
    const match = matches.get(game.id)
    if (match) rows.push({ match, game: { userColor: game.userColor, result: game.result, sans: firstMoves(game.pgn, 40) } })
  }
  const stats = bookStats(rows)

  // Book replies with live stats, most played first.
  const replies = bookMoves
    .map((move) => {
      const child = nodeById.get(move.canonicalId)
      const stat = stats.get(move.canonicalId)
      return {
        san: move.san,
        win: child ? nodeWin(child.eval, child.fen, rep.color) : null,
        punish: child?.punish ?? false,
        n: stat?.n ?? 0,
        score: stat ? scoreOf(stat.score, stat.n) : 0,
      }
    })
    .sort((a, b) => b.n - a.n || a.san.localeCompare(b.san))

  const currentCanonical = colorIndex.canonical.get(current.fenKey)
  const currentStat = currentCanonical ? stats.get(currentCanonical.id) : undefined
  const offBook = currentStat
    ? [...currentStat.offBook.entries()]
        .filter(([, entry]) => entry.by === 'opponent')
        .map(([san, entry]) => ({ san, ...entry }))
        .sort((a, b) => b.n - a.n || a.san.localeCompare(b.san))
    : []

  // The tree's next user move, when it is the user's turn.
  const sideToMove = current.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const userToMove = sideToMove === rep.color
  const userMove = userToMove ? treeNodes.find((node) => isChildOf(node.path, current.path) && node.by === 'user') : undefined
  const userMoveWin = userMove ? nodeWin(userMove.eval, userMove.fen, rep.color) : null

  const arrow = userToMove
    ? userMove ? uciOf(current.fen, userMove.san) : null
    : replies.length > 0
      ? uciOf(current.fen, replies[0].san)
      : null

  const throughGames = currentCanonical
    ? games
        .filter((game) => matches.get(game.id)?.positions.includes(currentCanonical.id))
        .sort((a, b) => b.playedAt - a.playedAt)
    : []
  const recent = throughGames.slice(0, 5)
  const currentCanonicalId = currentCanonical?.id ?? -1

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <Link href={`/repertoire${query}`} className="text-sm underline underline-offset-2">
        ← Repertoire
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{rep.name}</h1>

      <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1 font-mono text-sm">
        {current.path.split(' ').map((san, i) => {
          const prefix = current.path.split(' ').slice(0, i + 1).join(' ')
          const rootMove = i < rep.root.length
          return (
            <span key={i} className="flex items-center gap-x-1">
              {i > 0 && <span className="text-zinc-400 dark:text-zinc-600">·</span>}
              <Link
                href={`/repertoire/${rep.slug}?path=${encodeURIComponent(prefix)}${query}`}
                className={
                  rootMove
                    ? 'text-zinc-400 underline-offset-2 hover:text-foreground dark:text-zinc-500'
                    : 'text-sky-700 underline-offset-2 hover:text-foreground dark:text-sky-400'
                }
              >
                {moveNo(i + 1)}
                {san}
              </Link>
            </span>
          )
        })}
      </div>

      <div className="mt-5 flex flex-col gap-6 md:flex-row">
        <ExplorerBoard id={`explorer-${current.id}`} fen={current.fen} orientation={rep.color} arrow={arrow} />

        <div className="flex-1 space-y-6">
          {userToMove ? (
            <div>
              {userMove ? (
                <>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Your move:</p>
                  <p className="mt-1 text-base">
                    <Link
                      href={`/repertoire/${rep.slug}?path=${encodeURIComponent(`${current.path} ${userMove.san}`)}${query}`}
                      className="font-mono font-semibold text-sky-700 hover:text-foreground dark:text-sky-400"
                    >
                      {userMove.san}
                    </Link>
                    {userMoveWin !== null && (
                      <span className="ml-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                        your win chance {userMoveWin}%
                      </span>
                    )}
                  </p>
                  {userMove.note && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{userMove.note}</p>}
                </>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">End of this line.</p>
              )}
              {current.note && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{current.note}</p>}
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Book replies
              </h2>
              {replies.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">End of this line.</p>
              ) : (
                <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
                  {replies.map((reply) => (
                    <li key={reply.san} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <Link
                        href={`/repertoire/${rep.slug}?path=${encodeURIComponent(`${current.path} ${reply.san}`)}${query}`}
                        className="font-mono font-semibold text-sky-700 hover:text-foreground dark:text-sky-400"
                      >
                        {reply.san}
                      </Link>
                      {reply.win !== null && (
                        <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                          your win chance {reply.win}%
                        </span>
                      )}
                      {reply.punish && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                          Punish!
                        </span>
                      )}
                      <span className="ml-auto tabular-nums text-zinc-500 dark:text-zinc-400">
                        {reply.n} games · {Math.round(reply.score * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {offBook.length > 0 && (
                <div className="mt-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Off-book here
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Moves your real opponents played here that the book doesn&apos;t cover.
                  </p>
                  <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
                    {offBook.map((entry) => (
                      <li key={entry.san} className="flex items-baseline gap-x-3 px-3 py-2 text-sm">
                        <span className="font-mono font-medium">{entry.san}</span>
                        <span className="ml-auto tabular-nums text-zinc-500 dark:text-zinc-400">
                          {entry.n} games · {Math.round(scoreOf(entry.score, entry.n) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Your games here
              {currentStat && (
                <span className="ml-2 font-normal normal-case tabular-nums">
                  {currentStat.n} · score {Math.round(scoreOf(currentStat.score, currentStat.n) * 100)}%
                </span>
              )}
            </h2>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">No games through this position yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {recent.map((game) => {
                  const match = matches.get(game.id)
                  const ply = match ? match.positions.indexOf(currentCanonicalId) + 1 : 0
                  return (
                    <li key={game.id}>
                      <Link
                        href={`/games/${game.id}?ply=${ply}`}
                        className="text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
                      >
                        {new Date(game.playedAt).toLocaleDateString()} · {game.result}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/** A node is the direct child of `parentPath` in its tree. */
function isChildOf(path: string, parentPath: string): boolean {
  if (!path.startsWith(parentPath + ' ')) return false
  return path.split(' ').length === parentPath.split(' ').length + 1
}

function parsePath(value: string | string[] | undefined): string[] {
  if (typeof value !== 'string') return []
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 40)
}

function uciOf(fen: string, san: string): { from: string; to: string } | null {
  try {
    const move = new Chess(fen).move(san)
    return { from: move.from, to: move.to }
  } catch {
    return null
  }
}

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
