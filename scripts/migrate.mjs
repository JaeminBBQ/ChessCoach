// Applies the SQL migrations in drizzle/ to data/chesscoach.db,
// creating data/ first if it doesn't exist.
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

mkdirSync('data', { recursive: true })
const db = drizzle(new Database('data/chesscoach.db'))
migrate(db, { migrationsFolder: 'drizzle' })
console.log('Migrations applied to data/chesscoach.db')
