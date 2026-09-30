import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { getAnalysis, getGameForUser } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

/** A game (with its PGN) and its stored analysis, if any. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const userId = getCurrentUserId(db)
  const game = getGameForUser(db, userId, Number(id))
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  return NextResponse.json({ game, analysis: getAnalysis(db, userId, game.id) })
}
