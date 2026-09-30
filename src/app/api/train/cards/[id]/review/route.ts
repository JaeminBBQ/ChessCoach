import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { reviewCard } from '@/lib/server/training'
import { getCurrentUserId } from '@/lib/server/session'

/** Records a review (`{ grade: 'again' | 'good' | 'easy', correct: boolean }`) and reschedules the card. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const payload = (body ?? {}) as { grade?: unknown; correct?: unknown }
  if (typeof payload.grade !== 'string' || typeof payload.correct !== 'boolean') {
    return NextResponse.json({ error: 'grade and correct are required' }, { status: 400 })
  }
  const db = getDb()
  const result = reviewCard(db, getCurrentUserId(db), Number(id), payload.grade, payload.correct, Date.now())
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
