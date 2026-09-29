# T003: Sync service + Accounts and Games pages

**Owner:** DeepSeek · **Depends on:** T002 · **Size:** medium-large

## Goal
The owner links `poip0i333` (Chess.com), `poip0i333` (Lichess), and `jaeminbbq` (Lichess), clicks Sync, and sees all their games in a filterable list. Syncing is incremental, idempotent, polite to both APIs, and scoped per user.

## Read first
- `DEEPSEEK.md`, `CLAUDE.md` "Hard rules"
- `docs/ARCHITECTURE.md` (data model; updated for this task), `docs/DECISIONS.md` D6, D10, D11
- `src/lib/importers/*` (your T002 code) and `src/lib/db/*`
- `node_modules/next/dist/docs/` for Next 16 route handlers and Server Components/Actions before you write them

## Scope: do

### 1. Schema (migration `0002_*`)
- `games.accountId`: `integer('account_id').notNull().references(() => linkedAccounts.id, { onDelete: 'cascade' })`. Every game belongs to the linked account it was imported through. Keep `userId` and the existing unique index.
- SQLite can't `ADD COLUMN ... NOT NULL` without a default. If drizzle-kit generates that, hand-edit `0002` to rebuild `games` (create the new table, copy, drop, rename, and recreate the indexes). `games` is empty in every existing DB, so there's no data to preserve beyond the copy. Add a comment at the top of the SQL file saying it was hand-edited.
- `linked_accounts`: add `createdAt` (integer, not null; default `0` is fine for the migration).

### 2. Small importer additions
- `normalizeChesscomGame`: return null when `time_class` isn't one of `bullet`, `blitz`, `rapid`, `daily` (answers your T002 Q2). Add a test.
- `checkChesscomUser(username, deps)` → `GET /pub/player/{u}`, and `checkLichessUser(username, deps)` → `GET https://lichess.org/api/user/{u}`. Each resolves to `{ username: string }` with the platform's canonical casing, or throws `UserNotFoundError` on 404 (Lichess: also when the JSON has `disabled: true` or `closed: true`). Same headers and error mapping as T002. Add tests with inline mock responses.

### 3. Current user: `src/lib/server/session.ts`
`getCurrentUserId(db): number` returns the id of the user with `display_name = 'me'`, creating it on first call. Put a comment on it saying it's **the only place that knows there's no auth yet**; M5 replaces it with a real session. Everything else takes `userId` as a parameter.

### 4. Sync service: `src/lib/server/sync.ts`
- `syncAccount(db, userId, accountId, deps: FetchDeps & { now?: () => number }): Promise<SyncResult>` with `SyncResult = { status: 'ok' | 'rate_limited' | 'not_found' | 'error'; inserted: number; seen: number; retryAfterMs?: number; message?: string }`.
  - Throws if the account doesn't belong to `userId`.
  - **Cursor:** use the latest `playedAt` among this account's games.
    - Chess.com: `sinceMonth` = that timestamp's UTC `YYYY/MM` (the latest month is re-read because it's still filling up). With no games, fetch all archives.
    - Lichess: `since` = that timestamp minus 3 days (overlap covers games created before and finished after the cursor). With no games, there's no `since`.
  - Insert games **as they stream**, in transactions of up to 100 rows, with `onConflictDoNothing()` on the unique index, `importedAt = now()`, and the account's `userId`/`accountId`. `inserted` counts only new rows; `seen` counts every yielded game.
  - On success, set `lastSyncedAt = now()`. `RateLimitedError` → keep what was inserted, return `rate_limited` with `retryAfterMs`, and leave `lastSyncedAt` unchanged. `UserNotFoundError` → `not_found`. Anything else → `error` with the message (no stack traces in the UI).
  - For Lichess, pass `process.env.LICHESS_TOKEN` as `token` only if it's set.
- **Politeness lock:** only one sync per **platform** runs at a time per server process. A second request for the same platform waits for the first to finish (queue, don't reject). Implement a small keyed mutex in `src/lib/server/lock.ts` with a unit test. This matters for API etiquette, and DECISIONS D11 says this lock will become a job queue later.
- **Background status:** `startSync(userId, accountId)` launches `syncAccount` without awaiting it and records progress in an in-memory `Map<accountId, SyncStatus>`, where `SyncStatus = { state: 'queued' | 'running' | 'done' | 'rate_limited' | 'not_found' | 'error'; inserted; seen; startedAt; finishedAt?; message? }`. It updates `seen`/`inserted` live while running. Starting a sync for an account that's already queued or running is a no-op. `getSyncStatus(accountId)`.

### 5. Queries: `src/lib/server/games.ts`
- `listGames(db, userId, filters, page)`: filters are optional `accountId`, `speed`, `userColor`, `result`, `rated`. Newest first; 50 per page. Returns `{ games, total }`.
- `gameStats(db, userId, filters)` → `{ total, wins, losses, draws }` for the same filters.
- `listAccounts(db, userId)` → accounts with `gameCount` and `lastPlayedAt`.
- `linkAccount(db, userId, platform, username, deps)`: calls `check*User` first, stores the canonical username, and rejects a duplicate for this user with a clear error. `unlinkAccount(db, userId, accountId)` deletes the account and, via cascade, its games.

### 6. API routes (thin wrappers; all use `getCurrentUserId`)
- `POST /api/accounts/[id]/sync` → `startSync`, returns the status (202).
- `GET /api/accounts/[id]/sync` → the current status, or `{ state: 'idle' }`.

### 7. Pages (Server Components where possible; client components only for interactivity)
- **Layout nav** on every page: `ChessCoach` (home link) · Games · Accounts · Board.
- **`/accounts`**: a table of linked accounts (platform, username linking to the profile on the platform, games imported, last synced as relative time, and a **Sync** button). The Sync button starts the sync, then polls `GET …/sync` every 2s while it's running and shows `Syncing… 1,234 games seen, 1,200 new`, then the final state (`Done: 1,200 new`, `Rate limited, try again in 60s`, `User not found`, or the error text). Below the table is a **Link account** form (platform select + username) with an inline error for not-found or duplicate accounts. There's also a **Remove** button with an inline two-step confirm ("Remove? This deletes N imported games. [Yes] [Cancel]"). **Don't use `window.confirm`/`alert`.**
- **`/games`**: a stats strip (`N games · W% win · L% loss · D% draw` for the current filters), then filter selects (account, speed, color, result, rated) driven by URL search params so they're linkable. Then the table, newest first: date (local, short), color (● white / ○ black, or a small square), opponent (rating), result (W/L/D colored), speed + time control, opening name (truncated with a title tooltip), termination, and a ↗ link to the game on the platform. Pagination: Prev/Next and "page X of Y". Empty state: "No games yet. Link an account." with a link to `/accounts`.
- Both pages work at 375px wide. On `/games`, the table may scroll horizontally inside its own container, but the page itself must not scroll sideways.
- Landing page `/`: add links to Games and Accounts.

### 8. Tests (no network; in-memory DB with the real migrations; fixtures via mocked fetch)
- `sync.test.ts`:
  - First Chess.com sync where the mock serves the archive fixture for **all 3 months** → `inserted === 8` (dedup across months), `seen === 24`, and `lastSyncedAt` is set. A second sync → `inserted === 0`, and the requested archive list starts at the latest game's month.
  - First Lichess sync → 7 inserted, with no `since` in the URL. A second sync's URL has `since = latestPlayedAt - 3 days`.
  - Two Lichess accounts for the same user: each game gets the right `accountId`.
  - A 429 on the 2nd archive → `rate_limited`, the first month's games are kept, and `lastSyncedAt` is unchanged.
  - Syncing another user's account throws.
- `games.test.ts`: listGames/gameStats filters and pagination; user A never sees user B's games; unlinking cascades.
- `lock.test.ts`: two same-key tasks run strictly one after the other; different keys can overlap.

## Scope: do not
- No analysis, engine, or repertoire features. No auth. No cron or auto-sync (manual Sync button only).
- No new dependencies (use Tailwind for styling; relative time can be a tiny helper).
- Don't store Lichess `analysis`/`clocks` separately. The PGN already carries clocks.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0. Report the test count.
2. **Fresh DB:** `mv data data.bak-t003 2>/dev/null; npm run db:migrate && sqlite3 data/chesscoach.db "pragma table_info(games)" | grep account_id && sqlite3 data/chesscoach.db "pragma foreign_key_list(games)"` → shows `account_id` and the FK to `linked_accounts` with `CASCADE`. (Use `mv` instead of `rm`; Claude will clean up the backup.)
3. **Upgrade path:** a test (`src/lib/db/migrations.test.ts`) copies `drizzle/` to a temp folder with only migrations 0000–0001 in its journal, applies them to an in-memory DB, inserts a user and an account, then applies the full `drizzle/` folder → no error, and `account_id` exists. Also run `npm run db:migrate` against `data.bak-t003/chesscoach.db` (your pre-T003 dev DB; point the script at it temporarily or copy it into place) → it applies cleanly.
4. With `npm run dev` running:
   - `curl -s -o /dev/null -w "%{http_code}" localhost:3000/games` and `/accounts` → `200` for both.
   - `curl -s -X POST localhost:3000/api/accounts/999/sync` → 404 (unknown account), not a 500.
5. `grep -rn "getCurrentUserId" src | grep -v "src/app\|session.ts\|test"` → no output (only routes and pages call it; services take `userId`).
6. `grep -rn "window.confirm\|alert(" src` → no output.
7. **No live network in tests:** `npm test` passes with the network off. At minimum, confirm that no test file references `https://` URLs except to build expected strings or mock responses.

**Don't do a live sync against the real APIs yourself.** Claude does the first live run with the owner's accounts after review (T003 review step).

## Report
`handoffs/reports/T003-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
