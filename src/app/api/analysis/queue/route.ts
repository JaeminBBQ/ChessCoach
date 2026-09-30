import { NextResponse, type NextRequest } from 'next/server'

import { getDb } from '@/lib/db/client'
import { speeds, type Speed } from '@/lib/db/schema'
import { analysisQueue } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

/** Next unanalyzed games (newest first) for a batch run. `?limit=1..500&speed=blitz` */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 20, 1), 500)
  const speedParam = sp.get('speed')
  const speed = speeds.includes(speedParam as Speed) ? (speedParam as Speed) : undefined
  const db = getDb()
  return NextResponse.json(analysisQueue(db, getCurrentUserId(db), { speed }, limit))
}
