import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

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

export const cardKinds = ['missed', 'blunder'] as const
export type CardKind = (typeof cardKinds)[number]

export const grades = ['again', 'good', 'easy'] as const
export type Grade = (typeof grades)[number]

// One training puzzle cut from the user's own game, scheduled with spaced repetition.
export const drillCards = sqliteTable(
  'drill_cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    /** The user's move index; the position to solve is plies[ply-1] of the analysis. */
    ply: integer('ply').notNull(),
    kind: text('kind', { enum: cardKinds }).notNull(),
    fen: text('fen').notNull(),
    solutionUci: text('solution_uci').notNull(),
    solutionSan: text('solution_san').notNull(),
    /** Win % after the solution, from the user's point of view. */
    solutionWin: real('solution_win').notNull(),
    /** The move the user actually played, and the win % after it (user POV). */
    playedSan: text('played_san').notNull(),
    playedWin: real('played_win').notNull(),
    /** The opponent's move that led to the position, for highlighting. */
    lastMoveUci: text('last_move_uci'),
    /** Tactical pattern behind the mistake (motifs.ts); null until backfilled. */
    motif: text('motif'),
    ease: real('ease').notNull(),
    intervalDays: real('interval_days').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    /** Next review time (epoch ms). New cards are due at creation. */
    due: integer('due').notNull(),
    lastReviewedAt: integer('last_reviewed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [unique('drill_cards_gameId_ply_unique').on(t.gameId, t.ply)],
)

// Review history, kept for the future progress chart.
export const drillReviews = sqliteTable('drill_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  cardId: integer('card_id')
    .notNull()
    .references(() => drillCards.id, { onDelete: 'cascade' }),
  grade: text('grade', { enum: grades }).notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  reviewedAt: integer('reviewed_at').notNull(),
})

// The repertoire trees imported from content/repertoire (T008). One row per
// tree file; `root` is the JSON SAN array where the tree starts.
export const repertoires = sqliteTable(
  'repertoires',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    color: text('color', { enum: userColors }).notNull(),
    root: text('root').notNull(),
    engine: text('engine').notNull(),
    generatedAt: integer('generated_at').notNull(),
    importedAt: integer('imported_at').notNull(),
  },
  (t) => [unique('repertoires_userId_slug_unique').on(t.userId, t.slug)],
)

export const repertoireBy = ['user', 'opponent'] as const
export type RepertoireBy = (typeof repertoireBy)[number]

// Every position of a repertoire, including the synthesized root-path prefix
// nodes (eval null). `eval` is the JSON Score (White POV), null when terminal.
export const repertoireNodes = sqliteTable(
  'repertoire_nodes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repertoireId: integer('repertoire_id')
      .notNull()
      .references(() => repertoires.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    path: text('path').notNull(),
    san: text('san').notNull(),
    by: text('by', { enum: repertoireBy }).notNull(),
    fen: text('fen').notNull(),
    fenKey: text('fen_key').notNull(),
    eval: text('eval'),
    punish: integer('punish', { mode: 'boolean' }).notNull().default(false),
    note: text('note'),
  },
  (t) => [
    unique('repertoire_nodes_repertoireId_path_unique').on(t.repertoireId, t.path),
    index('repertoire_nodes_userId_fenKey_idx').on(t.userId, t.fenKey),
  ],
)

export const matchStatuses = ['book-end', 'user-left', 'opponent-left', 'game-ended'] as const
export type MatchStatus = (typeof matchStatuses)[number]

// The cached book match of one game (T008). `positions` is the JSON array of
// canonical node ids visited in order (index i = the position after ply i+1);
// canonical ids change on re-import, so the import clears this table.
export const gameRepertoire = sqliteTable('game_repertoire', {
  gameId: integer('game_id')
    .primaryKey()
    .references(() => games.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status', { enum: matchStatuses }).notNull(),
  repertoireId: integer('repertoire_id').references(() => repertoires.id, { onDelete: 'set null' }),
  leftPly: integer('left_ply'),
  leftSan: text('left_san'),
  bookSans: text('book_sans'),
  positions: text('positions').notNull(),
  computedAt: integer('computed_at').notNull(),
})

// Plan settings; one row per user, created lazily with defaults on first read.
export const userSettings = sqliteTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id),
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  weeklyGames: integer('weekly_games').notNull().default(10),
  planSpeed: text('plan_speed', { enum: speeds }).notNull().default('rapid'),
  puzzlesPerWeek: integer('puzzles_per_week').notNull().default(50),
  updatedAt: integer('updated_at').notNull(),
})

// One row per reviewed game (created by the "Mark reviewed" button or by
// visiting every key moment of the review). The unique index makes it idempotent.
export const gameReviews = sqliteTable(
  'game_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    reviewedAt: integer('reviewed_at').notNull(),
  },
  (t) => [unique('game_reviews_game_id_unique').on(t.gameId)],
)

// The weekly plan's focus, fixed once computed so it doesn't flip mid-week.
// `baseline` is JSON: { focus: { id, title, habit }, metric: { value, kind, sample } | null }.
export const plans = sqliteTable(
  'plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /** Monday 00:00 (user time zone) of the plan's week, epoch ms. */
    weekStart: integer('week_start').notNull(),
    focusId: text('focus_id'),
    baseline: text('baseline').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [unique('plans_userId_weekStart_unique').on(t.userId, t.weekStart)],
)

// Manual "Done" checks for plan tasks that can't be auto-tracked (e.g. the
// Lichess puzzle task), one row per (user, week, task).
export const planTaskChecks = sqliteTable(
  'plan_task_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /** Monday 00:00 (user time zone) of the plan's week, epoch ms. */
    weekStart: integer('week_start').notNull(),
    taskId: text('task_id').notNull(),
    checkedAt: integer('checked_at').notNull(),
  },
  (t) => [unique('plan_task_checks_userId_weekStart_taskId_unique').on(t.userId, t.weekStart, t.taskId)],
)
