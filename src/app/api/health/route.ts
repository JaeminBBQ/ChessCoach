import { sql } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  let db = true
  try {
    getDb().get(sql`select 1`)
  } catch {
    db = false
  }
  return Response.json({ ok: true, db })
}
