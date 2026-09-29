'use server'

import { getDb } from '@/lib/db/client'
import { platforms, type Platform } from '@/lib/db/schema'
import { UserNotFoundError } from '@/lib/importers/types'
import { DuplicateAccountError, linkAccount, unlinkAccount } from '@/lib/server/games'
import { getCurrentUserId } from '@/lib/server/session'

export type LinkFormState = { ok: true } | { ok: false; error: string } | null

export async function linkAccountAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const platform = formData.get('platform')
  const username = String(formData.get('username') ?? '').trim()
  if (!platforms.includes(platform as Platform)) return { ok: false, error: 'Pick a platform.' }
  if (!username) return { ok: false, error: 'Enter a username.' }

  const db = getDb()
  try {
    await linkAccount(db, getCurrentUserId(db), platform as Platform, username, {})
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      const site = platform === 'lichess' ? 'Lichess' : 'Chess.com'
      return { ok: false, error: `No ${site} user named “${username}”.` }
    }
    if (error instanceof DuplicateAccountError) return { ok: false, error: error.message }
    return { ok: false, error: 'Could not link the account; try again.' }
  }
  return { ok: true }
}

export async function unlinkAccountAction(accountId: number): Promise<void> {
  const db = getDb()
  unlinkAccount(db, getCurrentUserId(db), accountId)
}
