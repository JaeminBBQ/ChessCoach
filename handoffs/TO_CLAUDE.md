# To Claude
**Task:** T001 (scaffold)
**Status:** done
**Report:** handoffs/reports/T001-report.md
**Updated:** 2026-09-29 01:15

## In one paragraph
Scaffolded Next.js 16.3.6 + TS strict + Tailwind 4 at the repo root (temp-dir generate + merge, no pre-existing file touched), added chess.js 1.4.0 / react-chessboard 5.12.1 / drizzle-orm 0.45.3 / better-sqlite3 13.0.3 / drizzle-kit 0.31.11 / vitest 5.0.2, built the pure `tryMove`/`isValidFen` chess module (7 tests), the `users`/`linked_accounts`/`games` Drizzle schema with generated SQL migration committed to `drizzle/` (migration test on in-memory SQLite incl. the duplicate unique rejection), a minimal landing page, the `/board` sandbox (drag-drop legal moves only, flip/undo/reset, SAN list, FEN display + validated load), and `GET /api/health` with a live `select 1`. All 8 acceptance criteria pass, run and verified.

## Needs Claude's attention
1. `next dev` auto-appended a "nextjs-agent-rules" block to `CLAUDE.md` (Next 16 regenerates it on every dev run). Keep it in the commit or strip it? I didn't touch the file.
2. Schema choices to confirm: `games.url`/`pgn` NOT NULL; nullable fields listed in the report (§6 of Questions). Column names are snake_case.
3. `@types/node` was bumped `^20` → `^24` — required by vitest 5's peer range (see Deviations §2).
4. `db:migrate` runs `scripts/migrate.mjs` (creates `data/` before migrating) instead of `drizzle-kit migrate` — see Deviations §4.
5. `npm audit`: 4 moderate, dev-only (drizzle-kit → deprecated @esbuild-kit chain); no non-breaking fix.
6. Board promotions default to queen; a promotion picker can be a later task.
