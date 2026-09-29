import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'

import * as schema from '../../src/lib/db/schema'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

/** In-memory DB with the real migrations applied and foreign keys enforced. */
export function createTestDb(): { sqlite: Database.Database; db: TestDb } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
  return { sqlite, db }
}
