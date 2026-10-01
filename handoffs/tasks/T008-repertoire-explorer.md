# T008: Repertoire explorer + "where did the game leave my book?"

**Owner:** DeepSeek (Claude generated and verified the trees in T007) · **Depends on:** T007, T003 · **Size:** large

## Goal
Claude built engine-verified repertoire trees for the owner's openings (`content/repertoire/owner/*.json`): Ponziani, against the Petrov/Stafford, against the Scandinavian, Black vs 1.e4 (Stafford, Traxler, and the rest), and the Englund. Now make them useful:
1. **Explore** them: a board you click through, where each position shows the book move(s), the engine's eval, traps to punish, and how *your real games* went from there.
2. **Find where each game left the book**, and who left it: *you* (you forgot or varied) or *your opponent* (a move you have no prep for). Show this on every game page, and aggregate it into "where opponents take you out of book" and "where you leave your own book".

## Read first
- `DEEPSEEK.md`
- `docs/REPERTOIRE.md` (the "Generated trees" section explains how the trees were built), `docs/DECISIONS.md` D19
- `content/repertoire/owner/specs.json` and one tree file. A node is `{ path, san, by: 'user'|'opponent', fen, eval (White POV, null when terminal), freq, punish?, note? }`. `path` is space-separated SAN from the start position, and `root` is the SAN prefix where the tree starts.
- `src/lib/repertoire/build.ts` (`pathKey`), `src/lib/analysis/insights.ts` (`firstMoves`), `src/lib/analysis/classify.ts` (`winPercent`)
- `src/app/coach/page.tsx` for the filter pattern (`GamesFilters`), and `src/components/coach/replay-board.tsx` for driving a read-only board

## Definitions (use exactly these)
- **fenKey** = the first 4 FEN fields (placement, side to move, castling, en passant), with every FEN produced by chess.js. Positions match by fenKey, not by path, so transpositions count (e.g. the Traxler reached via 2.Bc4 Nf6 3.Nf3 Nc6).
- **Book of a color** = the union of all of the user's repertoires of that color, **plus** the root-path positions of each tree (the start position, the position after 1.e4, and so on), so a game can be followed from move 1.
- **Canonical node** of a fenKey (per user and color) = the node with the lowest id that has that fenKey. **Book moves at a position P** = the distinct child positions of every node whose fenKey is P's (one entry per distinct child fenKey, keeping its SAN and `by`).
- **Matching a game:** start at the start position (always in the book) and play the game's SAN moves (`firstMoves(pgn, 40)`) with chess.js. At each ply, look at the position before the move:
  - It has no book moves → **`book-end`**. `leftPly` = the last in-book ply, i.e. the game followed the book to its end. That's fine, not a deviation.
  - The move's resulting fenKey is among the book moves → continue.
  - Otherwise → **`user-left`** if the mover was the user, or **`opponent-left`** if it was the opponent. `leftPly` = this ply, `leftSan` = the move, and `bookSans` = the book moves' SANs at that position.
  - The game's moves run out while still in the book → **`game-ended`**.
- `repertoireId` of a match = the repertoire of the canonical node of the **last in-book position after the root path**, i.e. the deepest position that belongs to a real tree, not just the shared root moves. It's `null` when the game never got past the root path (e.g. 1.c4 against a Black user).
- **Score** = 1 / 0.5 / 0 for the user's win/draw/loss.

## Scope: do
1. **Schema + migration (0007)**
   - `repertoires`: id, userId, slug (the tree's `id`), name, color, root (JSON SAN array), engine, generatedAt, importedAt; `unique(userId, slug)`.
   - `repertoire_nodes`: id, repertoireId (cascade), userId, path, san, by, fen, fenKey, eval (JSON, nullable), punish (bool), note (nullable). `unique(repertoireId, path)`, index `(userId, fenKey)`. The root-path prefixes are imported as nodes too, with `eval` null.
   - `game_repertoire` (the per-game match cache): gameId (PK, cascade), userId, status, repertoireId (nullable, set null on delete), leftPly (nullable), leftSan (nullable), bookSans (JSON, nullable), positions (JSON array of the canonical node ids visited in order, starting after the start position), computedAt.
   - **Don't store `freq`**: stats are computed live from games (below).
2. **Import:** `importRepertoireSet(db, userId, setDir)` in `src/lib/server/repertoire.ts`. In one transaction per tree, it upserts the `repertoires` row by `(userId, slug)` and replaces that repertoire's nodes. Afterwards it **deletes the user's `game_repertoire` rows** (the canonical ids changed). It's idempotent. Run it with `npm run repertoire:import`, a `scripts/repertoire/import.run.ts` under the content config (env `REPERTOIRE_SET`, default `owner`; `REPERTOIRE_USER_ID`, default 1). **Change `content:repertoire` to filter on `shard`** so generation never runs the import, and vice versa (`vitest run --config vitest.content.config.mts shard` / `... import`).
3. **Pure matcher: `src/lib/repertoire/match.ts`**
   - `buildBookIndex(nodes)` → per-color index (fenKey → canonical id + book moves). The start position is the root of each color.
   - `matchGame(index, sans, userColor) → { status, repertoireId, leftPly, leftSan, bookSans, positions }`.
   - `bookStats(matches, games)`: per canonical node id, the games through it (n, score), plus the off-book moves played at each position (by whom, SAN, n, score).
   - `topDeviations(...)`: the aggregate tables below.
   No DB in this module.
4. **Lazy cache fill:** `ensureGameRepertoire(db, userId, gameIds)` computes and stores rows for games without one. Pages call it for the games they show. Report the first-load time over all 5,712 games and the warm-load time.
5. **`/repertoire` page** (nav: after Train). It uses the Coach filters (account, speed, rated, range), but the **default range is `all`** (openings need sample size).
   - One card per repertoire: name, games that entered it (n), score, and the status split ("followed to the end 31% · you left 22% · opponent left 47%"), with a link to the explorer.
   - **"Where opponents take you out of book"**: the top 8 off-book opponent moves by count. Columns: the line (SAN with move numbers, up to the deviation), their move, games, your score, and an **Explore →** link to that position. This is the prep to-do list.
   - **"Where you leave your own book"**: the top 8 user deviations by count. Columns: the line, your move vs the book move(s), games, your score, and an Explore link.
   - **"Never in book"**: the count of games per color whose `repertoireId` is null, with their most common first 2 moves (top 5).
6. **Explorer `/repertoire/[slug]?path=<SAN path>`** (the path is space-separated SAN; an invalid path falls back to the tree root)
   - A read-only board oriented to the user's color, showing the current node's position. Breadcrumb: the SAN line, each move clickable. The root-path moves are shown but greyed out.
   - **User to move:** "Your move: **Nf6**", with the user's win % after it (from `eval`, user POV, rounded) and the node's note if any. Clicking the move goes there.
   - **Opponent to move:** a list of the book replies. Each row shows SAN, your win % after it, a **"Punish!"** badge when `punish`, and *your games* through it (n · score), sorted by n desc. Below that, **"Off-book here"**: moves your real opponents played at this position that the book doesn't cover (SAN, n, score).
   - The 5 most recent games through this position, each linking to `/games/{id}?ply={ply at this position}`.
   - A green arrow on the board for the book move (user to move), or for the most-played book reply (opponent to move).
7. **Game page banner (`/games/[id]`)**, one line above the board:
   - `user-left`: "**You left your book** at 6.Bd3 (book: 6.d4) — White: Ponziani. Explore →". Append the move's judgement and win % drop when the game is analyzed ("mistake, −14%").
   - `opponent-left`: "**Your opponent left your book** at 4...a6: no prepared answer here. Explore →"
   - `book-end`: "Followed your book to the end (move 8)."
   - `game-ended`: "Game ended inside your book."
   - Root-only games (`repertoireId` null) get no banner.
   The banner's ply links jump the review board (`?ply=`).

## Scope: do not
- No engine runs; evals come from the tree files. No edits to the tree files or `build.ts`. No new dependencies.
- No repertoire editing UI, no drills (that's T009b), and no score by rating band (that's T010).

## Tests
- `match.test.ts` (tiny hand-made trees):
  - The book-end, user-left (with `bookSans`), opponent-left at ply 1 (1.c4 against a Black user → `repertoireId` null), and game-ended statuses.
  - A **transposition** reaches the same canonical node.
  - Check marks in SAN don't matter.
  - Two trees of one color share root-path positions, and `repertoireId` picks the deeper tree.
- `bookStats`/`topDeviations`: counts, scores, and top-N ordering.
- Server: import is idempotent (row counts identical after two imports), import clears the match cache, and `ensureGameRepertoire` only computes missing rows.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0.
2. Migration 0007 applied to the dev DB (`.backup` first). `npm run repertoire:import` twice → identical row counts (report them).
3. `/repertoire`, `/repertoire/black-vs-e4`, `/repertoire/black-vs-e4?path=e4 e5 Nf3 Nf6 Bc4 Nc6 Ng5 Bc5` (URL-encoded), and `/games/<id>` → 200. Report the cold and warm `/repertoire` load times.
4. **Real-data section:**
   - The repertoire cards (n, score, status split).
   - Both deviation tables as rendered.
   - The "Never in book" counts.
   - The banners of 5 games you pick: 2 user-left, 2 opponent-left, 1 book-end, with their game ids so Claude can verify them by hand.

## Report
`handoffs/reports/T008-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
