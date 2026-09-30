import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { saveAnalysis } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

/** Stores a browser-computed analysis after validating it against the game. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const db = getDb()
  const result = saveAnalysis(db, getCurrentUserId(db), Number(id), body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
