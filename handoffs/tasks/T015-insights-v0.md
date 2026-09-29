# T015: Insights v0 (coaching stats from imported games, no engine)

**Owner:** DeepSeek · **Depends on:** T003 · **Size:** medium

## Goal
An `/insights` page that answers "where do my results come from?" using only data we already store. The owner has 5,712 real games in the dev DB (Chess.com blitz is the main one). These stats become the first input to the weakness profile (T011), so the aggregation logic must be pure and tested.

## Read first
- `DEEPSEEK.md`, `docs/PRODUCT.md` (pillar 2), `docs/REPERTOIRE.md` (why openings are grouped by moves, not names)
- `src/lib/server/games.ts` (filters, user scoping), `src/app/games/page.tsx` (filter UI pattern to reuse)

## Scope: do

### 1. Pure module: `src/lib/analysis/insights.ts` (no DB, no React)
Input: an array of `InsightGame` = `{ playedAt, userColor, result, termination, speed, rated, userRating, opponentRating, accountId, pgn }`, sorted or unsorted.
- `firstMoves(pgn: string, plies: number): string[]`: SAN tokens of the first N plies from the PGN movetext. Strip headers, `{…}` comments, `(…)` variations, `$n` NAGs, move numbers (`1.`, `1...`), and the result token. **No chess.js** here (it's too slow for thousands of games); this is tokenization only. Test it on real fixture PGNs from both platforms (they have `{[%clk …]}` comments).
- `scoreOf(games)`: `{ n, wins, losses, draws, score }`, where `score = (wins + 0.5*draws)/n` (0 when n = 0).
- `byOpening(games, plies)`: groups by the user's color + the first `plies` SAN moves. Returns rows `{ color, moves: string[], ...scoreOf }` sorted by n desc. Also add `byOpeningTree`: for a given color and move prefix, the children one ply deeper with their scores. This powers drill-down.
- `byTermination(games)`: separately for wins and for losses, the count and share per `termination` code.
- `byRatingDiff(games)`: bands of `opponentRating - userRating`: `< -200`, `-200..-101`, `-100..-26`, `-25..25`, `26..100`, `101..200`, `> 200`, each with `scoreOf`. Skip games missing either rating.
- `sessions(games, gapMinutes = 20)`: split chronologically into sessions (a new session starts after a gap > `gapMinutes`). Return:
  - `byGameIndex`: `scoreOf` for game #1, #2, #3, #4–6, and #7+ within a session
  - `afterResult`: `scoreOf` for games played right after a win, a loss, and a draw (same session only)
  - `sessionCount`, `avgGamesPerSession`
- `ratingSeries(games)`: for each (accountId, speed), points `{ t, rating }` using the user's rating in each **rated** game, downsampled to at most 200 points (keep the last game of each bucket).
- `byColor(games)`: `scoreOf` for white and for black.

### 2. Server query: `src/lib/server/insights.ts`
`loadInsightGames(db, userId, filters)`, where filters are `accountId?`, `speed?`, `rated?` (default **true**), and `range` (`90d` | `1y` | `all`, default `1y`). Select only the columns `InsightGame` needs, scoped by `userId`.

### 3. Page: `/insights` (Server Component, plus client bits only where needed)
Add "Insights" to the nav. The filter bar has account, speed (default: the user's most-played speed in the range), rated (default on), and range, all driven by URL params like `/games`.

Sections, in this order, each with a one-line plain-English takeaway computed from the numbers (e.g. "You score 38% in the game right after a loss vs 51% after a win."). Keep takeaways factual and computed, never generic advice:
1. **Summary strip:** games, score %, and score as white vs as black.
2. **Rating trend:** a hand-rolled inline SVG line chart (no chart library), one line per account+speed in the filter. Axes show dates and ratings; tooltips aren't required.
3. **Openings:** a table of `byOpening` at 6 plies for the most common lines (top 15 per color). Show the moves as `1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6`, plus n, W/L/D, and score % with a small bar. Clicking a row drills down one ply at a time via `byOpeningTree` (URL param `line=`). Show a breadcrumb to go back up.
4. **How games end:** two small tables (your wins / your losses) of termination shares. Highlight `abandoned` and `timeout` rows in losses.
5. **Opponent strength:** the rating-diff bands with score % bars.
6. **Sessions and tilt:** score by game index in the session, and score after win/loss/draw, as bars.

Use Tailwind only. The page must work at 375px wide, with no page-level horizontal scroll (tables may scroll inside their own container). Show score % bars as simple divs. Render colors for good/bad scores accessibly (use text labels as well as color).

### 4. Tests
- `insights.test.ts`: every function, on small synthetic arrays with hand-computed expectations. Include session splitting across the gap boundary, the rating-diff band edges (exactly −200, −25, 25, 200), and `firstMoves` on both fixture platforms' real PGNs (`test/fixtures/`), checking the first 6 plies exactly.
- A performance guard: `byOpening` + `sessions` + `byTermination` on 6,000 synthetic games finishes in < 500 ms.

## Scope: do not
- No engine, no new tables or migrations, no new dependencies, no LLM text.
- Don't change the importers or the sync.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0 (report the test count).
2. With `npm run dev` running against the real dev DB (`data/chesscoach.db` has 5,712 games; **don't delete or move it**): `curl -s -o /dev/null -w "%{time_total} %{http_code}" "localhost:3000/insights?range=all"` → `200` in under 3s on a warm second request. Report both timings.
3. `curl -s "localhost:3000/insights?range=all&speed=blitz&rated=1" | grep -o "1.e4 e5 2.Nf3 Nf6"` → at least one match. This is the owner's most common Black line, so it must appear in the opening table.
4. `grep -rn "from 'chess.js'" src/lib/analysis/insights.ts` → nothing.
5. **Stop your dev server when you're done** (`kill` the `next dev` you started). A leftover server from T003 held a stale DB handle. Before starting, check with `lsof -i :3000`. If a server is already running, use it, and don't kill a server you didn't start.

## Report
`handoffs/reports/T015-report.md`. Include the **takeaway sentences the page generated for the owner's real data** (range=all, blitz, rated), so Claude can sanity-check them against the database. Then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
