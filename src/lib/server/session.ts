import { eq } from 'drizzle-orm'

import { users } from '../db/schema'
import type { getDb } from '../db/client'

type Db = ReturnType<typeof getDb>

// This is the ONLY place that knows there's no auth yet: the current user is
// the row with display_name 'me', created on first call. M5 replaces this
// with a real session. Everything else takes `userId` as a parameter.
export function getCurrentUserId(db: Db): number {
  const existing = db.select({ id: users.id }).from(users).where(eq(users.displayName, 'me')).get()
  if (existing) return existing.id
  const created = db.insert(users).values({ displayName: 'me', createdAt: Date.now() }).returning({ id: users.id }).get()
  return created.id
}
