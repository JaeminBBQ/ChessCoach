import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from './schema'

const drizzleFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

describe('migration upgrade path (T003)', () => {
  it('applies 0002 on top of a 0000–0001 database with data in it', () => {
    // Copy drizzle/ to a temp folder whose journal stops at migration 0001.
    const temp = mkdtempSync(path.join(tmpdir(), 'cc-migrations-'))
    try {
      cpSync(drizzleFolder, temp, { recursive: true })
      const journalPath = path.join(temp, 'meta', '_journal.json')
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] }
      journal.entries = journal.entries.filter((entry) => entry.idx < 2)
      writeFileSync(journalPath, JSON.stringify(journal))

      const sqlite = new Database(':memory:')
      sqlite.pragma('foreign_keys = ON')
      const db = drizzle(sqlite, { schema })

      // Pre-T003 schema, with a user and an account already in place. Raw SQL:
      // drizzle would write created_at, which doesn't exist yet in 0000–0001.
      migrate(db, { migrationsFolder: temp })
      sqlite.prepare("INSERT INTO users (display_name, created_at) VALUES ('me', 1)").run()
      sqlite.prepare("INSERT INTO linked_accounts (user_id, platform, username) VALUES (1, 'lichess', 'poip0i333')").run()

      // The full folder, 0002 included, must apply cleanly.
      migrate(db, { migrationsFolder: drizzleFolder })

      const columns = sqlite.pragma('table_info(games)') as { name: string }[]
      expect(columns.some((column) => column.name === 'account_id')).toBe(true)
      const foreignKeys = sqlite.pragma('foreign_key_list(games)') as { table: string; on_delete: string }[]
      const accountFk = foreignKeys.find((fk) => fk.table === 'linked_accounts')
      expect(accountFk?.on_delete).toBe('CASCADE')

      // The pre-0002 row survives, backfilled with the migration default.
      expect(db.select().from(schema.linkedAccounts).where(eq(schema.linkedAccounts.id, 1)).get()?.createdAt).toBe(0)
      sqlite.close()
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })
})
