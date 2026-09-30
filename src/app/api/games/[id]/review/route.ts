import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { markReviewed } from '@/lib/server/plan'
import { getCurrentUserId } from '@/lib/server/session'

/** Marks the game reviewed. Idempotent: repeated calls return the original timestamp. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const result = markReviewed(db, getCurrentUserId(db), Number(id))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ reviewedAt: result.reviewedAt })
}
