# T001: Scaffold, tooling, board sandbox, DB schema

**Owner:** DeepSeek · **Depends on:** nothing · **Size:** medium

## Goal
A working Next.js + TypeScript app skeleton with lint, typecheck, test, and build all green; a `/board` sandbox where you can play legal moves; and a Drizzle/SQLite schema for users, linked accounts, and games. Every later task builds on this, so keep it clean and minimal.

## Read first
- `DEEPSEEK.md` (rules and conventions)
- `docs/ARCHITECTURE.md` (stack, layout, data model)
- `docs/DECISIONS.md` D2–D6

## Scope: do
1. **Scaffold Next.js at the repo root.** `create-next-app` refuses non-empty directories, so generate it in a temp dir **outside** the repo and move the files in:
   ```
   cd /Users/jaemin/Projects && npx create-next-app@latest chesscoach-tmp --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes
   ```
   (If a flag has been renamed, use the equivalent and note it in the report.) Move everything, including dotfiles, into `ChessCoach/`, then delete the temp dir. **Don't overwrite** existing files: `CLAUDE.md`, `DEEPSEEK.md`, `.gitignore` (merge any missing entries into ours instead), `docs/`, `handoffs/`, `tools/`, `.claude/`. If the scaffold generates its own `AGENTS.md`/`CLAUDE.md`, don't copy them over; mention them in the report. Don't copy its `.git`.
2. **Dependencies** (latest stable): `chess.js`, `react-chessboard`, `drizzle-orm`, `better-sqlite3`; dev: `drizzle-kit`, `@types/better-sqlite3`, `vitest`. Nothing else without flagging it.
3. **package.json scripts:** `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `db:generate` (drizzle-kit generate), `db:migrate` (applies migrations to `data/chesscoach.db`, creating `data/` if missing). `package.json` `name`: `chesscoach`.
4. **Pure chess module** `src/lib/chess/position.ts`:
   - `START_FEN` constant
   - `tryMove(fen: string, move: { from: string; to: string; promotion?: string }): { fen: string; san: string } | null`, which returns null for illegal moves and defaults promotion to queen
   - `isValidFen(fen: string): boolean`
   - Unit tests in `src/lib/chess/position.test.ts`: a legal move, an illegal move, a promotion, castling, and an invalid FEN.
5. **DB** under `src/lib/db/`:
   - `schema.ts`: tables `users`, `linked_accounts`, `games`, exactly as in `docs/ARCHITECTURE.md` "Data model" (non-planned rows). Integer autoincrement ids; timestamps as integer epoch ms; `platform`/`speed`/`userColor`/`result` as text with TS union types; the unique constraints as listed; FKs to `users.id`.
   - `client.ts`: exports a `getDb()` singleton for `data/chesscoach.db` (server-only; add `import "server-only"` if it's available without an extra dependency, otherwise add a comment).
   - Migrations generated into `drizzle/` and committed to the tree (the user commits).
   - A test `src/lib/db/schema.test.ts` that applies the migrations to an **in-memory** SQLite database, inserts a user, a linked account, and a game, and asserts that the unique constraint on (platform, externalId, userId) rejects a duplicate.
6. **Routes:**
   - `/`: a minimal landing page: app name "ChessCoach", one sentence ("A chess coach that learns from your games."), and a link to `/board`. Replace the create-next-app boilerplate entirely.
   - `/board`: a client component with a react-chessboard board driven by `tryMove`. It has buttons **Flip**, **Undo**, and **Reset**; shows the current FEN (read-only text) and the move list in SAN; and has a text input + **Load FEN** button (reject invalid FENs with an inline message). Illegal drops snap back. The layout must work at 375px wide (board fills the width, controls below). Check the installed react-chessboard version's API; v5 uses an `options` prop, while older versions use flat props.
   - `GET /api/health` → `{ "ok": true, "db": true }`, where `db` is the result of a trivial `select 1` via `getDb()`.
7. **README.md** (replace the scaffold's): a short description, prerequisites (Node 24), and setup commands (`npm install`, `npm run db:migrate`, `npm run dev`), plus the scripts list.

## Scope: do not
- No auth, no importers, no Stockfish, no styling beyond clean Tailwind defaults. No extra pages.
- Don't edit `docs/`, `CLAUDE.md`, `DEEPSEEK.md`, `tools/`, or `.claude/`.
- Don't commit.

## Acceptance criteria
Run all of these from the repo root and paste the key output into the report:
1. `npm run lint` → exit 0
2. `npm run typecheck` → exit 0
3. `npm test` → all tests pass (≥ 6 tests across the position and schema test files)
4. `npm run build` → exit 0
5. `rm -rf data && npm run db:migrate && sqlite3 data/chesscoach.db ".tables"` → lists `users`, `linked_accounts`, `games` (plus the drizzle migrations table)
6. With `npm run dev` running: `curl -s localhost:3000/api/health` → `{"ok":true,"db":true}`; `curl -s -o /dev/null -w "%{http_code}" localhost:3000/board` → `200`. Stop the dev server afterward.
7. `git status --porcelain | grep -E "node_modules|\.next/|data/"` → no output (all ignored)
8. `grep -rn "server-only\|getDb" src/app src/components 2>/dev/null | grep -v "src/app/api"` → no client-side imports of the DB (only API routes / server code use it)

The user will do the visual check of `/board` (drag moves, flip, undo, load FEN, phone width). You don't need to.

## Report
`handoffs/reports/T001-report.md` (template: `handoffs/REPORT_TEMPLATE.md`). Include the exact versions of Next.js, React, chess.js, react-chessboard, drizzle-orm, and better-sqlite3. Then update `TO_CLAUDE.md` and `BOARD.md`, notify, and tell the user.
