import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { newCardsToday, trainingQueue } from '@/lib/server/training'
import { getCurrentUserId } from '@/lib/server/session'

/** The next training cards: due first, then new cards within today's allowance. */
export async function GET() {
  const db = getDb()
  const userId = getCurrentUserId(db)
  const now = Date.now()
  const cards = trainingQueue(db, userId, now, newCardsToday(db, userId, now))
  return NextResponse.json({ cards })
}
