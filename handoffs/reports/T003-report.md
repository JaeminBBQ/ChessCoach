# T003 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Sync service, Accounts and Games pages, and the schema change that carries them: `games.accountId` (NOT NULL, FK → `linked_accounts` with ON DELETE CASCADE) and `linked_accounts.createdAt`, in hand-edited migration `0002`. Syncs are incremental per account (Chess.com `sinceMonth` = latest game's UTC month; Lichess `since` = latest − 3 days), idempotent via `onConflictDoNothing`, batched in ≤100-row transactions, and serialized per platform by a keyed mutex. Background syncs report live status from an in-memory map, surfaced by the two `/api/accounts/[id]/sync` routes. The Accounts page links/removes accounts (server actions, two-step inline confirm, no `window.confirm`) and shows per-account sync buttons that poll every 2s. The Games page is a Server Component with URL-driven filters, stats strip, pagination, and a horizontally scrollable table at 375px. All acceptance criteria pass; 65 tests total (9 files).

## Files changed
- `src/lib/db/schema.ts`: `games.accountId` (cascade FK), `linkedAccounts.createdAt` (default 0)
- `drizzle/0002_loving_power_man.sql`: **hand-edited** (noted in a header comment) to rebuild `games` instead of the ALTER drizzle-kit generated; generated journal/snapshot kept as-is
- `src/lib/importers/chesscom.ts`: `checkChesscomUser` (canonical username, UA header, T002 error mapping); `normalizeChesscomGame` now returns null for `time_class` outside bullet/blitz/rapid/daily
- `src/lib/importers/lichess.ts`: `checkLichessUser` (canonical username, `disabled`/`closed` → not found)
- `src/lib/server/session.ts`: `getCurrentUserId(db)` — the only no-auth seam; creates the `display_name = 'me'` user on first call
- `src/lib/server/lock.ts`: `KeyedLock` — queueing keyed mutex, one key per platform
- `src/lib/server/sync.ts`: `syncAccount` (cursor, streaming ingest, partial-batch flush on error, `lastSyncedAt` only on full success) + `startSync`/`getSyncStatus` background status map
- `src/lib/server/games.ts`: `listGames`, `gameStats`, `listAccounts`, `linkAccount` (canonical casing, `DuplicateAccountError`), `unlinkAccount` (cascade)
- `src/app/api/accounts/[id]/sync/route.ts`: POST (202) + GET status, 404 for unknown/foreign accounts
- `src/app/accounts/page.tsx` + `actions.ts`, `src/components/{sync-button,link-account-form,remove-account-button}.tsx`: Accounts UI
- `src/app/games/page.tsx`, `src/components/games-filters.tsx`: Games UI (auto-submitting GET form keeps filters in the URL)
- `src/app/layout.tsx`, `src/app/page.tsx`: nav on every page; landing links to Games/Accounts
- `src/lib/time.ts`: `relativeTime` helper
- Tests: `src/lib/server/sync.test.ts`, `src/lib/server/games.test.ts`, `src/lib/server/lock.test.ts`, `src/lib/db/migrations.test.ts`, additions to the two importer test files; `test/helpers/db.ts` (in-memory DB with real migrations, FK ON); `src/lib/db/schema.test.ts` updated for `accountId`

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| 1. lint / typecheck / test / build exit 0 | pass | All four exit 0. `npm test`: **65 passed** across 9 files |
| 2. Fresh DB migration shows `account_id` + CASCADE FK | pass | `mv data data.bak-t003; npm run db:migrate; sqlite3 data/chesscoach.db "pragma table_info(games)" \| grep account_id` → `2\|account_id\|INTEGER\|1\|\|0`; `pragma foreign_key_list(games)` → `0\|0\|linked_accounts\|account_id\|id\|NO ACTION\|CASCADE\|NONE` |
| 3. Upgrade path: `migrations.test.ts` + real pre-T003 DB | pass | Test copies `drizzle/` to a temp folder with a 0000–0001 journal, applies, inserts a user + account via raw SQL, applies the full folder → no error, `account_id` exists, FK is CASCADE, pre-0002 account survives with `created_at = 0`. Also ran `npm run db:migrate` against `data.bak-t003/chesscoach.db` (0000–0001 applied, row data intact) → applies cleanly |
| 4. Dev server curls | pass | `/games` → 200, `/accounts` → 200, `POST /api/accounts/999/sync` → 404 with `{"error":"Account not found"}` |
| 5. `getCurrentUserId` only in src/app, session.ts, tests | pass | grep with exclusions → no output |
| 6. No `window.confirm`/`alert(` | pass | grep → no output |
| 7. No live network in tests | pass | Every `https://` in test files is an expected-URL string or mock data; all fetches are injected. Suite also passes with only in-memory DBs |

Not run by me (per spec): a live sync against the real APIs — that's Claude's review step.

## Deviations from the spec
- `0002` rebuild keeps the `PRAGMA foreign_keys=OFF/ON` statements drizzle-kit would emit, but they are no-ops inside the migrator's transaction; the rebuild is safe regardless (nothing references `games`). Noted in the file header.
- `ingest` flushes the partial batch in a `finally` so games fetched before a mid-stream 429 are kept — the spec's 429 test requires this; without it the batch was discarded on error.
- `runSync` maps `status: 'ok'` → `state: 'done'` (the status map's vocabulary), and rate-limited status carries a human message ("Rate limited; try again in Ns").
- `/games` shows "No games match these filters." when filters exclude everything (spec's empty state only covers the no-games case), and clamps an out-of-range `page` param.
- Link/remove use Server Actions (`useActionState` / `startTransition`) instead of API routes — the spec's §6 only lists the sync routes; actions keep the client components thin.

## Dependencies added
None.

## Questions / proposals for Claude
1. **Same game under two linked accounts** (owner's two Lichess accounts playing each other): the unique index is `(platform, externalId, userId)`, so the second account's copy of that game is silently dropped and the game is attributed to whichever account synced first. Kept per spec ("Keep `userId` and the existing unique index"), flagging because D10's multi-account goal makes this a real scenario. If you want both copies kept, the index needs `accountId` in it.
2. The sync status map is per server process and per route bundle; in production a GET and POST to the same route share it, but two app instances wouldn't. Fine until D11's job queue; noting it here since polling crosses no boundaries today.
3. `startSync` returns the existing status when an account is already queued/running (no-op per spec) — the button shows the running sync rather than starting a new one. If you'd rather it always re-queue after completion, that's a one-line change.

## Known issues / follow-ups
- `data.bak-t003/` (the pre-T003 dev DB, migrated in place during acceptance) is left on disk for Claude to clean up, per the spec's `mv` note.
- The `Sync` button refreshes the page data once when the sync settles; mid-sync it only shows seen/new counts (spec text).
- Lichess `evals=true` is requested in the export URL (T002 behavior) but the eval data isn't stored; the PGN carries clocks. Nothing to do until the engine milestone.
