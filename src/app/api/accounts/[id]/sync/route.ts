import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { linkedAccounts } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/server/session'
import { getSyncStatus, startSync } from '@/lib/server/sync'

/** Starts a background sync for the account; 202 with the live status. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accountId = Number(id)
  const db = getDb()
  const userId = getCurrentUserId(db)
  if (!ownsAccount(db, userId, accountId)) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }
  return NextResponse.json(startSync(db, userId, accountId), { status: 202 })
}

/** The current sync status, or `{ state: 'idle' }` when none is recorded. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accountId = Number(id)
  const db = getDb()
  const userId = getCurrentUserId(db)
  if (!ownsAccount(db, userId, accountId)) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }
  return NextResponse.json(getSyncStatus(accountId) ?? { state: 'idle' })
}

function ownsAccount(db: ReturnType<typeof getDb>, userId: number, accountId: number): boolean {
  return (
    db
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, accountId), eq(linkedAccounts.userId, userId)))
      .get() !== undefined
  )
}
