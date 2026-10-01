import { NextResponse, type NextRequest } from 'next/server'

import { getDb } from '@/lib/db/client'
import { MOTIF_LABEL } from '@/lib/analysis/motifs'
import { newCardsToday, trainingQueue } from '@/lib/server/training'
import { getCurrentUserId } from '@/lib/server/session'

const isMotif = (value: string): boolean => Object.prototype.hasOwnProperty.call(MOTIF_LABEL, value)

/**
 * The next training cards: due first, then new cards within today's allowance.
 * `?motif=hangingPiece` limits the session to one pattern.
 */
export async function GET(request: NextRequest) {
  const motifParam = request.nextUrl.searchParams.get('motif')
  let motif: string | undefined
  if (motifParam !== null) {
    if (!isMotif(motifParam)) {
      return NextResponse.json({ error: `Unknown motif ${motifParam}` }, { status: 400 })
    }
    motif = motifParam
  }
  const db = getDb()
  const userId = getCurrentUserId(db)
  const now = Date.now()
  const cards = trainingQueue(db, userId, now, newCardsToday(db, userId, now), motif)
  return NextResponse.json({ cards })
}
