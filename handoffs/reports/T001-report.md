# T001 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Scaffolded Next.js 16 (App Router, TypeScript strict, Tailwind 4) at the repo root via a temp dir outside the repo, merged in without touching any pre-existing file. Added the chess/DB dependencies, a pure chess module (`tryMove` / `isValidFen` / `START_FEN`) with unit tests, a Drizzle + better-sqlite3 schema for `users`, `linked_accounts`, `games` with generated SQL migrations and an in-memory migration test, a minimal landing page, a `/board` sandbox (drag moves, flip, undo, reset, SAN move list, FEN display + load with validation), and `GET /api/health` returning live DB status. All 8 acceptance criteria pass.

## Files changed
- `package.json` / `package-lock.json`: name `chesscoach`; scripts `typecheck`, `test`, `db:generate`, `db:migrate`; deps below
- `next.config.ts`: `serverExternalPackages: ["better-sqlite3"]` (native module, keep out of the server bundle)
- `.gitignore`: merged missing entries from the scaffold (`.vercel`, `*.pem`, npm/yarn debug logs); kept our narrower `.env` rules so `.env.example` stays committable
- `src/lib/chess/position.ts`: `START_FEN`, `tryMove` (null on illegal move / invalid FEN, promotion defaults to queen), `isValidFen`
- `src/lib/chess/position.test.ts`: 7 tests (legal move, illegal moves, default + explicit promotion, castling, invalid FEN)
- `src/lib/db/schema.ts`: `users`, `linked_accounts`, `games` per ARCHITECTURE data model; int autoincrement PKs, epoch-ms integers, text columns with TS unions, FKs, unique constraints
- `src/lib/db/client.ts`: `getDb()` singleton for `data/chesscoach.db` (creates `data/` if missing, WAL + foreign_keys pragmas); server-only by comment convention (`server-only` package not installed, see deviations)
- `src/lib/db/schema.test.ts`: applies real migrations to in-memory SQLite, inserts user/account/game, asserts duplicate (platform, externalId, userId) is rejected
- `drizzle.config.ts`, `drizzle/0000_condemned_demogoblin.sql` + `meta/`: generated migration (committed to tree)
- `scripts/migrate.mjs`: applies `drizzle/` migrations to `data/chesscoach.db`, creating `data/` first
- `vitest.config.mts`: node environment + `@` alias
- `src/app/page.tsx`, `src/app/layout.tsx`: landing page ("ChessCoach", tagline, link to `/board`), metadata
- `src/app/board/page.tsx`: client-component board sandbox (react-chessboard v5 `options` API; drag-drop via `tryMove`, illegal drops snap back; Flip / Undo / Reset; FEN read-only + Load FEN with inline error; SAN move list; board fills width via `aspect-ratio`, max 560px, controls below)
- `src/app/api/health/route.ts`: `GET /api/health` → `{ ok, db }` with `select 1` through `getDb()` (`force-dynamic`)
- `README.md`: replaced scaffold's

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| 1. `npm run lint` → exit 0 | pass | no errors, exit 0 |
| 2. `npm run typecheck` → exit 0 | pass | `tsc --noEmit` clean |
| 3. `npm test` → ≥ 6 tests pass | pass | `Test Files 2 passed (2) / Tests 9 passed (9)` (7 position + 2 schema) |
| 4. `npm run build` → exit 0 | pass | `✓ Compiled successfully`, routes: `/` ○, `/board` ○, `/api/health` ƒ |
| 5. `rm -rf data && npm run db:migrate && sqlite3 data/chesscoach.db ".tables"` | pass | `__drizzle_migrations  linked_accounts  games  users` |
| 6. dev server: health + board | pass | `HEALTH: {"ok":true,"db":true}`; `/board` → `200` (dev server stopped after) |
| 7. `git status --porcelain \| grep -E "node_modules\|\.next/\|data/"` | pass | no output |
| 8. `grep -rn "server-only\|getDb" src/app src/components` (excl. `src/app/api`) | pass | no output (only `src/app/api/health/route.ts` imports `getDb`) |

## Deviations from the spec
1. The scaffold generated `AGENTS.md` and a stub `CLAUDE.md` — not copied, per spec.
2. `@types/node` bumped `^20` → `^24`: vitest 5's peer requirement (`^22 \|\| >=24`) made `npm install -D` fail otherwise. Version bump of an existing scaffold dev-dep, not a new dependency.
3. `import "server-only"` was omitted per the spec's fallback: the package is not resolvable in Next 16 (only `next/dist/compiled/server-only` exists). `client.ts` carries a comment instead, and acceptance 8 enforces the boundary.
4. `db:migrate` is `node scripts/migrate.mjs` rather than `drizzle-kit migrate`, because drizzle-kit's better-sqlite3 driver cannot open a DB in a missing directory; the script creates `data/` first and applies migrations with the same drizzle migrator used by the tests.
5. `vitest.config.mts` instead of `.ts`: Vite 8 warns that ESM syntax in a CJS-loaded `.ts` config is deprecated; `.mts` removes the warning.
6. react-chessboard 5.12.1 has no `boardWidth` option; the board grid self-sizes via `boardStyle: { width: "100%", aspectRatio: "1 / 1" }` inside a `max-w-[560px]` wrapper (v5 `options` prop API, as the spec anticipated).
7. Column names are snake_case (`user_id`, `played_at`, …); the ARCHITECTURE doc lists field names, not literal SQL columns.
8. `next dev` auto-appended a generated `nextjs-agent-rules` block to `CLAUDE.md` (Next 16 tooling; I did not edit that file). See questions.

## Dependencies added
Runtime: `chess.js@1.4.0`, `react-chessboard@5.12.1` (React 19 peer), `drizzle-orm@0.45.3`, `better-sqlite3@13.0.3` (prebuilt binary works on Node 24).
Dev: `drizzle-kit@0.31.11`, `@types/better-sqlite3@9.6.0`, `vitest@5.0.2`.
Stack versions: Next.js 16.3.6, React/React DOM 19.2.8, Tailwind 4.x, TypeScript 5.x.
Note: `npm audit` reports 4 moderate vulnerabilities, all dev-only via drizzle-kit's deprecated `@esbuild-kit/esm-loader` chain; no fix without breaking drizzle-kit.

## Questions / proposals for Claude
1. `next dev` appended a "nextjs-agent-rules" block to `CLAUDE.md` (re-added on every `next dev`; removing it just re-creates the uncommitted change). Keep it in the commit or strip it?
2. `games.url` and `games.pgn` are NOT NULL — every imported game should have both, but confirm (e.g. some Chess.com variants lack PGN).
3. `games` unique constraint is implemented as a unique index (drizzle's SQLite behavior for table-level `unique()`); same semantics as a table constraint.
4. `getDb()` enables `journal_mode = WAL` and `foreign_keys = ON` per connection. OK?
5. Promotions on the board always queen (per spec). A promotion picker (`onPromotionPieceSelect`) can be added later if wanted.
6. `lastSyncedAt` is nullable until first sync; `timeControl`, `termination`, ratings, opponent fields, and opening fields are nullable where either API can omit them.

## Known issues / follow-ups
None. Board UX (drag, flip, undo, load FEN, phone width) is for the user's visual check.
