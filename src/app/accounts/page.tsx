import { connection } from 'next/server'

import LinkAccountForm from '@/components/link-account-form'
import RemoveAccountButton from '@/components/remove-account-button'
import SyncButton from '@/components/sync-button'
import { getDb } from '@/lib/db/client'
import { listAccounts } from '@/lib/server/games'
import { getCurrentUserId } from '@/lib/server/session'
import { relativeTime } from '@/lib/time'

export default async function AccountsPage() {
  // The page reads the DB per request; never prerender it.
  await connection()
  const db = getDb()
  const userId = getCurrentUserId(db)
  const accounts = listAccounts(db, userId)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Your games are imported through linked accounts.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 text-right font-medium">Games</th>
              <th className="px-3 py-2 font-medium">Last synced</th>
              <th className="px-3 py-2 font-medium">Sync</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No linked accounts yet. Link one below.
                </td>
              </tr>
            )}
            {accounts.map((account) => (
              <tr
                key={account.id}
                className="border-b border-black/5 align-middle last:border-0 dark:border-white/5"
              >
                <td className="px-3 py-2">{account.platform === 'lichess' ? 'Lichess' : 'Chess.com'}</td>
                <td className="px-3 py-2">
                  <a
                    href={profileUrl(account.platform, account.username)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-foreground dark:decoration-zinc-700"
                  >
                    {account.username}
                  </a>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{account.gameCount}</td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {account.lastSyncedAt === null ? 'Never' : relativeTime(account.lastSyncedAt)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <SyncButton accountId={account.id} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <RemoveAccountButton accountId={account.id} gameCount={account.gameCount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <LinkAccountForm />
      </div>
    </main>
  )
}

function profileUrl(platform: 'lichess' | 'chesscom', username: string): string {
  return platform === 'lichess'
    ? `https://lichess.org/@/${username}`
    : `https://www.chess.com/member/${username.toLowerCase()}`
}
