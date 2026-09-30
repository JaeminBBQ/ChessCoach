# T005: Move classification + game review page

**Owner:** DeepSeek (Claude specified the formulas) · **Depends on:** T004, T015 · **Size:** medium-large

## Goal
Turn a stored engine analysis into a coach's review. Classify each move by how much it changed the mover's **winning chances** (not raw pawns: going from −9 to −25 loses nothing). Surface the few moments that decided the game, and give the owner a real review page on `/games/[id]`: board, move list with judgements, eval graph, and key moments.

## Read first
- `DEEPSEEK.md`, `CLAUDE.md` "Hard rules" (engine truth: every number here comes from the stored analysis)
- `src/lib/analysis/game-analysis.ts`: the `GameAnalysis` / `PlyAnalysis` shape. Evals are **White POV**; ply `i` (i ≥ 1) is the position after the i-th half-move; `plies[i-1].best` is the engine's best move in the position before move i.
- `src/app/games/[id]/page.tsx` (Claude's temporary table; you replace it), `src/components/analysis/*`
- `data/chesscoach.db` has 15 analyzed games (5 made in Node, 10 in the owner's browser) for manual checks. `sqlite3 data/chesscoach.db "select game_id from analyses"`.

## Scope: do

### 1. Pure module: `src/lib/analysis/classify.ts`
Formulas are fixed; use exactly these (they're the Lichess ones, so the numbers look familiar to players).
- `winPercent(score: Score): number` for White, 0–100:
  - cp: `50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)`, with cp clamped to ±1000 first
  - mate: `value > 0` → 100; `value < 0` → 0
- `positionWin(p: PlyAnalysis): number | null`, White's win % for the position:
  - `terminal === 'checkmate'`: the side to move is mated, so White's win % is 0 if White is to move and 100 if Black is (the FEN's side-to-move field tells you which)
  - `terminal === 'stalemate'`: 50. Otherwise `winPercent(eval)`, or null if eval is missing
- `classifyMoves(a: GameAnalysis): MoveJudgement[]`, one entry per ply `i` = 1..n:
  ```ts
  interface MoveJudgement {
    ply: number; color: 'white' | 'black'   // who made move i (odd ply = white)
    san: string; uci: string
    winBefore: number; winAfter: number     // from the MOVER's point of view (0–100)
    drop: number                            // max(0, winBefore - winAfter)
    judgement: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
    bestSan: string | null; bestWinAfter: number | null  // engine's move in the prior position, mover POV
    accuracy: number                        // 0–100, see below
  }
  ```
  - `winBefore` = `positionWin(plies[i-1])` and `winAfter` = `positionWin(plies[i])`, both converted to the mover's POV (Black's = 100 − White's).
  - Judgement:
    - `best` if the played uci equals `plies[i-1].best.uci`
    - else by `drop`: **≥ 30 blunder, ≥ 20 mistake, ≥ 10 inaccuracy**, else `good`
    - **Exception:** don't label a move worse than `good` when `winBefore < 10` or when `winAfter > 90`. The position was already lost, or it's still totally winning, and that's not what we coach.
  - Move accuracy: `clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669, 0, 100)`.
  - Skip plies where either win % is null (no judgement is emitted for that ply).
- `gameSummary(judgements, color)` → `{ accuracy (mean of that side's move accuracies, rounded to 1 decimal), best, good, inaccuracies, mistakes, blunders }`.
- `keyMoments(judgements, userColor, n = 3)`: the user's `n` biggest drops with judgement `mistake` or `blunder`, plus **missed chances**: plies where the *opponent's* previous move had `drop ≥ 20` and the user's reply was not `best` and itself dropped ≥ 10 (the user didn't punish). Return them sorted by ply as `{ ply, kind: 'blunder' | 'mistake' | 'missed', drop, san, bestSan, winBefore, winAfter }`.
- `evalSeries(a: GameAnalysis)` → `{ ply, whiteWin }[]` for the graph (null wins are carried forward from the previous point).

### 2. Tests: `classify.test.ts`
- `winPercent`: cp 0 → 50; cp 100 ≈ 59.1 (±0.1); cp −300 ≈ 24.9 (±0.1); cp 5000 = cp 1000 (clamped); mate ±.
- Build small `GameAnalysis` objects by hand to cover each judgement band exactly at the thresholds (drop 9.99 → good, 10 → inaccuracy, 20 → mistake, 30 → blunder), the `best` override, both lost/won exceptions, checkmate and stalemate terminals, and Black-POV conversion.
- `keyMoments`: one test for a user blunder and one for a missed chance.
- **Real-data test:** load the Scholar's-mate analysis produced by the real engine (reuse the `createNodeEngine` setup from `game-analysis.test.ts`). For Black's `3...Nf6??`, the judgement is `blunder` with winAfter < 5, and `4.Qxf7#` is `best`.

### 3. Review page: `/games/[id]` (replaces Claude's temporary table)
Server Component for data + one client component `GameReview` for interactivity. Classification runs on the server (pure functions over stored JSON), and the client gets judgements + series + plies.
- **Header** (keep the current one) plus, when analyzed: `Your accuracy 78.4 · Opponent 71.2 · You: 1 blunder, 2 mistakes, 3 inaccuracies`.
- **Not analyzed yet:** keep the Analyze button. After analysis, `router.refresh()` shows the review.
- **Layout:** board on the left and move list + panels on the right on desktop; stacked on mobile (board, then controls, current-move panel, graph, move list, key moments). It works at 375px with no page-level horizontal scroll.
- **Board:** react-chessboard, read-only, oriented to the **user's color**. It shows the position at the selected ply, the last move highlighted, and an arrow for the engine's best move **in the position before** the selected move when the played move wasn't `best` (react-chessboard v5 `arrows` option; check its API in `node_modules`).
- **Navigation:** buttons ⏮ ◀ ▶ ⏭, keyboard ←/→/Home/End (only while no input is focused), and clicking a move or a graph point.
- **Current-move panel:** for the selected ply, e.g. `12. Qf4?  Mistake · win chance 55% → 31% · Best was Qd3 (54%)`, using the mover's POV numbers. Say "You played" / "Opponent played" as appropriate. Show `Checkmate` / `Stalemate` at terminal positions.
- **Eval graph:** inline SVG (no library), White win % over plies (area above/below 50%), with a vertical marker at the current ply and dots at the user's mistakes/blunders (color **and** shape/label, not color alone). Clicking/tapping jumps to the nearest ply. It has a width of 100% and a fixed height of about 120px.
- **Move list:** numbered pairs (`12. Qf4? Nd4`), with suffix marks `?!` inaccuracy, `?` mistake, `??` blunder and colored text plus a tooltip with the judgement name. The selected move is highlighted and scrolled into view.
- **Key moments:** a list of `keyMoments` (up to 3 user mistakes + missed chances), each clickable to jump. If there are none: "No big mistakes in this game."
- Keep `<EngineCredit />` on the page.

### 4. Games list: analysis column
In `/games`, add a column **Analysis**: for analyzed games, `acc 78 · 1??` (user accuracy rounded + blunder count); otherwise `—`. Fetch the analyses for the 50 visible rows in one query (`inArray`) and classify them on the server. Put the helper in `src/lib/server/analyses.ts` as `summariesForGames(db, userId, gameIds): Map<gameId, { accuracy, blunders, mistakes }>` with a test.

## Scope: do not
- No new dependencies, no schema changes, no re-analysis logic changes, no LLM text.
- Don't change `game-analysis.ts`, the engine files, or `/analyze`. If you think something there is wrong, say so in the report.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0. Report the test count.
2. With the dev server (check `lsof -i :3000` first and reuse a running server; stop only one you started):
   - For every analyzed game, `/games/<id>` → 200. Loop over `sqlite3 data/chesscoach.db "select game_id from analyses"` with curl.
   - `/games/<an unanalyzed id>` → 200 and contains the Analyze button text.
   - `/games` → 200 and contains `acc ` at least once.
3. **Sanity table in the report:** for each of the 15 analyzed games, give user accuracy, opponent accuracy, and user blunders/mistakes/inaccuracies, plus the key-moment list for game **5711** (the owner's Traxler loss). Claude will recompute these independently.
4. `grep -rn "from 'react-chessboard'" src/lib` → nothing (the board stays in components).

The owner does the visual check (board orientation, arrows, graph, keyboard, phone width).

## Report
`handoffs/reports/T005-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
