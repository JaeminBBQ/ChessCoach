# T011: Coach page: "What to work on"

**Owner:** DeepSeek (Claude wrote the detector definitions and the coaching copy) · **Depends on:** T005, T015 · **Size:** large

## Goal
The owner's feedback: *Insights "needs work on pointing out what I need to work on."* Build `/coach`, which ranks the owner's weaknesses by how many **expected points per 100 games** each one costs. Each weakness comes with evidence, links to the owner's own example positions, and a concrete training action. The owner also confirmed they sometimes **abandon games when things go badly, or start games at bad times**, so abandonment gets split into "left a lost game" (harmless, effectively resigning) and "left a playable game" (real points lost).

## Read first
- `DEEPSEEK.md`, `CLAUDE.md` hard rules (engine truth: all numbers come from stored analyses or game results)
- `src/lib/analysis/classify.ts` (your T005 work), `src/lib/analysis/insights.ts` (T015), `src/lib/analysis/game-analysis.ts`
- `docs/PRODUCT.md` pillars 2–3

## Definitions (use exactly these)
- **User win % at a position**: `positionWin` from `classify.ts`, converted to the user's POV.
- **Phase of a move:** decided from the position *before* the move (`plies[i-1].fen`):
  - `opening` if `i ≤ 20` (moves 1–10)
  - else `endgame` if the number of N, B, R, Q on the board (both colors, kings and pawns excluded) is ≤ 6
  - else `middlegame`
- **Points lost by a move** = `drop / 100` (a drop in win % is a drop in expected score).
- **Rate:** `pointsPer100 = points / sampleGames * 100`, where `sampleGames` is the number of **analyzed** games in the filter for engine-based detectors, and **all** games in the filter for results-only detectors. Each finding stores which kind of sample it used.
- **Abandonment:**
  - Chess.com: a loss with `termination === 'abandoned'`
  - Lichess: a loss with `termination === 'timeout'` (Lichess's status when a player leaves and the opponent claims the win). Lichess `outoftime` is a normal flag, **not** abandonment.
- **Time loss:**
  - Chess.com: a loss with `termination === 'timeout'`
  - Lichess: a loss with `termination === 'outoftime'`
- **User moves in a game** = the number of plies made by the user's color (from `firstMoves`-style tokenization of the PGN, all plies).

## Detectors: `src/lib/analysis/coach.ts` (pure)
Input: `{ games: CoachGame[] }`, where `CoachGame` = the `InsightGame` fields + `id`, plus `analysis: GameAnalysis | null`. Each detector returns zero or more `Finding`:
```ts
interface Finding {
  id: string                // e.g. 'mistakes-middlegame', 'opening-line:black:e4.e5.Nf3.Nf6.d4.exd4'
  title: string
  pointsPer100: number
  sample: { kind: 'analyzed' | 'all'; games: number }
  headline: string          // one computed, factual sentence
  evidence: string[]        // 1–3 computed bullets
  examples: { gameId: number; ply: number; label: string }[]  // up to 3, worst first
  training: string          // fixed copy from the table below
}
```
1. **`mistakes-opening` / `mistakes-middlegame` / `mistakes-endgame`**: user moves judged `mistake` or `blunder`, grouped by phase. Points are the sum of their drops / 100.
   - Evidence: count, per-game rate, and the **hanging share**: the fraction where the opponent's best reply is a capture (`plies[i].best.san` contains `x`). Phrase it as "In N% of them, the opponent's best reply was a capture: something was left hanging."
   - Examples: the 3 biggest drops, with labels like `14...Qd7?? (62% → 18%)`.
2. **`missed-chances`**: user plies where the opponent's previous move had `drop ≥ 20` and the user's reply wasn't `best` and dropped ≥ 10. Points = the sum of the user's drops / 100. Examples: the largest.
3. **`conversion`**: analyzed games where the user's win % was ≥ 85 at any non-terminal position after ply 10, and the result isn't a win. Points = the sum of `1 − score` (loss 1, draw 0.5).
   - Evidence: "N of the M games where you reached a winning position (≥ 85%) weren't won."
   - Examples: the ply where the win % first dropped below 60 after the peak, for up to 3 games.
4. **`abandoned-playable`** (analyzed): abandonment losses where the user's win % at the **final** position is ≥ 30. Points = the sum of `winPct / 100`.
   - Evidence also reports how many abandonment losses were already lost (< 30), labeled "effectively resigned, no points lost".
   - Examples: the final ply.
5. **`early-abandon`** (all games): abandonment losses with ≤ 10 user moves. Points = `0.5` each (an estimate, since an early position is roughly equal). Evidence says it's an estimate. The example ply is the last one.
6. **`time-losses-ok-position`** (analyzed): time losses where the user's win % at the final position is ≥ 50. Points = the sum of `winPct / 100`. Evidence also gives the total time losses across **all** games in the filter.
7. **`opening-line`** (all games): `byOpening(games, 6)`. For lines with n ≥ 15 and score < 0.42, points = `(0.5 − score) × n`. Emit at most 2, the worst by points. The title uses the moves (`As Black: 1.e4 e5 2.Nf3 Nf6 3.d4 exd4`). Examples: the 3 most recent losses in the line (ply = the last ply of the line, 6).

**Ranking and gating:** sort by `pointsPer100` desc. Drop findings whose evidence count is < 5 (fewer than 5 moves or games behind them). Engine-based detectors require ≥ 20 analyzed games in the filter; when there are fewer, `coach()` returns a flag so the page shows the prompt below. The export is `coach(games): { findings: Finding[]; analyzedGames: number; totalGames: number; needsAnalysis: boolean }`.

## Training copy (fixed; use verbatim as `training`)
| id | training |
|---|---|
| mistakes-opening | Your early mistakes cost the most. For moves 1–10, before each move ask: what did their last move attack, and is anything of mine loose? Check the opening lines on the Insights page for where your games go wrong. |
| mistakes-middlegame | Build a blunder check: before every move, ask "What does their last move attack?" and "After my move, what is left undefended?" Do 15 minutes of rated puzzles a day; tactics are pattern recognition. |
| mistakes-endgame | With few pieces left, precision beats speed. Spend a few seconds more per move, activate your king, and study basic endgames: king and pawn, rook behind the passed pawn, opposition. |
| missed-chances | When your opponent's move looks odd, stop and check every check, capture, and threat for you before continuing your plan. Many of your best chances came right after their mistakes. |
| conversion | When you're winning: trade pieces (not pawns), stop their counterplay before attacking, and use your clock; there's no rush when you're ahead. |
| abandoned-playable | You left games you could still save or win. Only start a game when you have time to finish it, and when things go badly, play on while the position is still holdable. Blitz opponents at your level blunder back often. |
| early-abandon | Several games ended almost before they started. Only start a game when you can finish it; if you might be interrupted, pick a shorter time control or play a daily game instead. |
| time-losses-ok-position | You lose on time in positions that were fine. Aim to keep a third of your clock at move 20, and try 3+2 or 5+3 (increment) for a while so a good position isn't lost to the clock. |
| opening-line | Your results in this line are well below 50%. Open it on the Insights page to see which reply hurts most, and replay your losses in it from the review page. |

## Page: `/coach`
- Nav: add **Coach** as the first item after the logo (before Games). Update the home page links as well.
- Filters (URL params, same pattern as Insights): account, speed (default: most-played in range), rated (default on), range (`90d` | `1y` | `all`, default `1y`).
- **Header:** "Based on {total} {speed} games ({analyzed} analyzed with Stockfish), {range label}."
- **If `needsAnalysis`:** a callout, "Analyze at least 20 games to unlock move-level coaching. [Analyze games →](/analyze)". Results-only findings (early-abandon, opening-line) still show.
- **Top 3 findings** as cards, each with: the title, a pill `−{pointsPer100.toFixed(1)} pts / 100 games`, the headline, evidence bullets, example links (`/games/{id}?ply={ply}`), and a "How to train" box with the training copy.
- **Also noticed:** the remaining findings as compact rows (title + pill + headline), expandable to the full card (`<details>`).
- If nothing passes the gates: "No clear weaknesses yet. Analyze more games."
- Works at 375px. No chart library.

## Deep links: `/games/[id]?ply=N`
The review page opens at ply `N` when the param is valid (0..last), and otherwise at 0. This is a small change in `GameReview` and the page.

## Tests
- `coach.test.ts`: each detector on hand-built `CoachGame`s with tiny `GameAnalysis` objects:
  - phase boundaries (ply 20 vs 21; 6 vs 7 pieces)
  - hanging share
  - the missed-chance rule
  - conversion with a win (not counted) and with a draw (0.5)
  - abandonment on both platforms' codes (Lichess `outoftime` is **not** abandonment)
  - early-abandon at exactly 10 vs 11 user moves
  - opening-line gating (n = 14 vs 15; score 0.42 vs 0.41)
  - ranking order, the evidence < 5 gate, and the `needsAnalysis` gate at 19 vs 20 analyzed games
- A server loader test (`src/lib/server/coach.ts`: `loadCoachGames(db, userId, filters)` joins analyses via a left join and is scoped by `userId`), in the same style as `insights.test.ts`.
- `?ply=` parsing: a pure helper `parsePly(param, lastPly)` with tests.

## Scope: do not
- No schema changes, no new dependencies, no LLM text, and no changes to the classification formulas.
- Don't auto-run analysis. The owner runs `/analyze` themselves.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0. Report the test count.
2. Dev server (reuse a running one): `/coach` and `/coach?range=all` → 200; `/games/<analyzed id>?ply=12` → 200.
3. **Real-data section in the report:** the full list of findings `/coach` produces for the owner's defaults (and for `range=all`): id, pts/100, sample, headline, and evidence. The owner is analyzing more games in parallel, so report the analyzed count you saw. Claude will recompute several of them with SQL/Python.

## Report
`handoffs/reports/T011-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
