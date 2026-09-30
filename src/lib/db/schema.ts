import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const platforms = ['lichess', 'chesscom'] as const
export type Platform = (typeof platforms)[number]

export const speeds = ['bullet', 'blitz', 'rapid', 'classical', 'daily'] as const
export type Speed = (typeof speeds)[number]

export const userColors = ['white', 'black'] as const
export type UserColor = (typeof userColors)[number]

export const results = ['win', 'loss', 'draw'] as const
export type Result = (typeof results)[number]

// Timestamps are UTC epoch milliseconds (integers).

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const linkedAccounts = sqliteTable(
  'linked_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    platform: text('platform', { enum: platforms }).notNull(),
    username: text('username').notNull(),
    createdAt: integer('created_at').notNull().default(0),
    // Null until the first sync.
    lastSyncedAt: integer('last_synced_at'),
  },
  (t) => [unique('linked_accounts_platform_username_userId_unique').on(t.platform, t.username, t.userId)],
)

export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    // The linked account the game was imported through; deleting the account
    // deletes its games.
    accountId: integer('account_id')
      .notNull()
      .references(() => linkedAccounts.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: platforms }).notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    pgn: text('pgn').notNull(),
    playedAt: integer('played_at').notNull(),
    timeControl: text('time_control'),
    rated: integer('rated', { mode: 'boolean' }).notNull().default(true),
    speed: text('speed', { enum: speeds }).notNull(),
    userColor: text('user_color', { enum: userColors }).notNull(),
    result: text('result', { enum: results }).notNull(),
    termination: text('termination'),
    userRating: integer('user_rating'),
    opponentName: text('opponent_name'),
    opponentRating: integer('opponent_rating'),
    openingEco: text('opening_eco'),
    openingName: text('opening_name'),
    importedAt: integer('imported_at').notNull(),
  },
  (t) => [unique('games_platform_externalId_userId_unique').on(t.platform, t.externalId, t.userId)],
)

// One engine analysis per game; `data` is the JSON GameAnalysis (src/lib/analysis/game-analysis.ts).
export const analyses = sqliteTable(
  'analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    engine: text('engine').notNull(),
    nodes: integer('nodes').notNull(),
    version: integer('version').notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [unique('analyses_game_id_unique').on(t.gameId)],
)
