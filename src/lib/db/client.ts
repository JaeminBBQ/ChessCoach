import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import * as schema from './schema'

// NOTE: this module is server-only (DB access). The `server-only` package is
// not installed, so enforce it by convention: never import getDb() from a
// client component. (Acceptance tests grep for `getDb` in src/app and src/components.)

type Db = ReturnType<typeof createDb>

// Next.js dev hot-reloads modules; the globalThis slot keeps one connection per process.
const globalForDb = globalThis as unknown as { chesscoachDb?: Db }

function createDb() {
  const dataDir = path.resolve(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })
  const sqlite = new Database(path.join(dataDir, 'chesscoach.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function getDb(): Db {
  return (globalForDb.chesscoachDb ??= createDb())
}
