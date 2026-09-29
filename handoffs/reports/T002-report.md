# T002 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built the two platform importers: `normalizeChesscomGame` / `normalizeLichessGame` map each API's raw game shape onto one `ImportedGame`, and `fetchChesscomGames` / `fetchLichessGames` page/stream a user's finished games politely (serial requests, User-Agent, NDJSON streaming, 429/404/other error classes). Also added `parseNdjson` (chunk-safe, UTF-8-safe), the `rated` column on `games` with migration `0001_motionless_norrin_radd`, and `CHESSCOM_CONTACT` to `.env.example`. All golden tests over the 20 fixture games pass, along with the mocked-fetch behavior tests. No DB writes, no UI wiring, no new dependencies.

## Files changed
- `src/lib/db/schema.ts`: added `rated` boolean column to `games` (NOT NULL, default true)
- `drizzle/0001_motionless_norrin_radd.sql` (+ meta snapshot/journal): generated migration
- `src/lib/importers/types.ts`: `ImportedGame`, `RateLimitedError`, `UserNotFoundError`, `ImporterHttpError`, `FetchDeps`
- `src/lib/importers/chesscom.ts`: normalizer, `listChesscomArchives`, `fetchChesscomGames`, `CHESSCOM_USER_AGENT`
- `src/lib/importers/lichess.ts`: normalizer, `fetchLichessGames`
- `src/lib/importers/ndjson.ts`: chunk-safe NDJSON stream parser
- `src/lib/importers/chesscom.test.ts`, `lichess.test.ts`, `ndjson.test.ts`: fixture-based tests (no network)
- `.env.example`: `CHESSCOM_CONTACT=` with a comment

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| 1. lint / typecheck / build exit 0 | pass | `npm run lint` ✓, `npm run typecheck` ✓, `npm run build` ✓ (5 routes, compiled successfully) |
| 2. `npm test` all pass, golden tests for all 20 fixture games | pass | `Test Files 5 passed (5)`, `Tests 32 passed (32)`. Golden coverage: chesscom archive = 8 real + 2 skipped (chess960, custom start), lichess NDJSON = 7 real + 3 skipped (chess960, fromPosition, aborted) = **20 games**, each compared field-by-field against `expected.json` plus `pgn === raw pgn` |
| 3. `drizzle/0001_*.sql` adds `rated`; migrate shows the column | pass | `drizzle/0001_motionless_norrin_radd.sql` = `ALTER TABLE \`games\` ADD \`rated\` integer DEFAULT true NOT NULL;`. `npm run db:migrate` then `pragma table_info(games) \| grep rated` → `18\|rated\|INTEGER\|1\|true\|0`. (The `rm -rf data` prefix was denied by the permission classifier; see deviations. The from-scratch path is covered by `schema.test.ts`, which migrates a fresh in-memory DB through all migrations on every run.) |
| 4. No hard-coded email in `src/lib/importers/*.ts` | pass | `grep -rnE "@\|gmail" src/lib/importers/*.ts \| grep -v "^.*//"` → no output (exit 1) |
| 5. Nothing wired into the UI | pass | `grep -rn "importers" src/app` → no output; `src/components` doesn't exist yet |

## Deviations from the spec
1. **Three defensive skips beyond the spec's closed lists** (all return null; none affect the golden files):
   - Lichess: skip when the game has no `pgn` (DB requires it NOT NULL), when the username matches neither side, or when a standard game has a speed outside the six known values.
   - Chess.com: skip when the username matches neither side.
   - Rationale: without these, `userColor`/`result`/`pgn` would have to be fabricated or crash. Flagged for confirmation.
2. **Mid-UTF-8 chunk test**: the lichess fixture is pure ASCII, so splitting it can't split a multi-byte character. The awkward-chunk test therefore appends one synthetic line containing a 4-byte emoji (variant chess960 → normalizes to null) and splits a chunk inside the emoji; mid-line splits happen on the real fixture. `parseNdjson`'s UTF-8 handling is also unit-tested directly in `ndjson.test.ts`.
3. **Archive ordering**: `fetchChesscomGames` sorts archive URLs by their `YYYY/MM` suffix before walking, so oldest → newest holds even if the API lists them out of order (test feeds them reversed).
4. **`rm -rf data` acceptance step**: the permission classifier denied deleting the local `data/` directory, so I could not run the criterion's exact command. I instead verified by migrating the existing dev DB (0001 applied cleanly, `rated` present) and by the schema test's fresh in-memory migrations. Claude can run the exact command when reviewing.
5. **Retry-After**: parsed as seconds with a 60 s default when absent/invalid; the HTTP-date form of Retry-After isn't handled (not seen from either API in practice).

## Dependencies added
None.

## Questions / proposals for Claude
1. Should the defensive skips (deviation 1) stay as silent skips, or should some of them (e.g. user not found in the game) throw so a sync can surface them? My call was skip-and-continue, since a single odd game shouldn't abort a sync.
2. Chess.com `time_class` is cast to `Speed` unchecked; values outside `bullet/blitz/rapid/daily` (legacy `lightning`, custom) would flow into the DB. Propose a validation pass (skip or map) in T003 when the sync service decides policy.
3. `CHESSCOM_CONTACT` is read from `process.env` at module load. Next.js inlines env vars server-side, but if the importers ever run client-side this becomes a build-time constant; fine for now since importers are server-only.
4. The month-archive `sinceMonth` filter compares strings — correct for zero-padded `YYYY/MM` as the API guarantees.

## Known issues / follow-ups
- No retries/backoff loops — per scope, T003.
- Lichess `daysPerTurn` timeControl format (`1/N`) is per spec but unverified against real correspondence games (none in fixtures).
