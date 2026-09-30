# T005 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Move classification and the game review page are in. `src/lib/analysis/classify.ts` converts stored engine evals to Lichess-style winning chances, judges every move (`best`/`good`/`inaccuracy`/`mistake`/`blunder` with the fixed formulas), computes per-side accuracy summaries, finds key moments (user mistakes + missed chances), and builds the eval series — all pure and unit-tested including the real-engine Scholar's mate case. `/games/[id]` now shows the review: read-only board oriented to the user with last-move highlight and best-move arrow, keyboard/button navigation, current-move panel, inline-SVG eval graph with click-to-jump and mistake markers, move list with judgement marks, and clickable key moments. `/games` gained an Analysis column (`acc 78 · 1??`) fed by one `inArray` query.

## Files changed
- `src/lib/analysis/classify.ts`: `winPercent`, `positionWin`, `classifyMoves`, `judgeDrop` (exported for exact-threshold tests), `gameSummary`, `keyMoments`, `evalSeries`.
- `src/lib/analysis/classify.test.ts`: 25 tests — formula reference values, band edges, both exceptions, Black-POV conversion, checkmate/stalemate terminals, key-moment selection/missed chances, series carry-forward, and the real-engine Scholar's mate test (3...Nf6?? = blunder with winAfter < 5; 4.Qxf7# = best).
- `src/lib/server/analyses.ts`: added `summariesForGames(db, userId, gameIds)` (one query, `inArray`, classifies on the server, user-color-aware).
- `src/lib/server/analyses.test.ts`: 2 tests for `summariesForGames` (values, scoping, empty inputs).
- `src/components/analysis/game-review.tsx`: the client `GameReview` (board, nav, panel, graph, move list, key moments).
- `src/app/games/[id]/page.tsx`: replaced Claude's temporary table with the review page (header + accuracy line kept; Analyze/Re-analyze button kept; `router.refresh()` already in AnalyzeButton shows the review after analysis).
- `src/app/games/page.tsx`: Analysis column.

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| 1. lint / typecheck / test / build exit 0 | pass | `npm run lint`, `npm run typecheck` clean; `npm test` → **141 passed (141)** (16 files); `npm run build` → "✓ Compiled successfully", `ƒ /games/[id]` |
| 2a. Every analyzed game `/games/<id>` → 200 | pass | Looped all 15 ids from `analyses` → all 200 (2565–2571, 5700–5703, 5709–5712) |
| 2b. Unanalyzed game → 200 + Analyze button | pass | `/games/1164` → 200, contains "Analyze with Stockfish" |
| 2c. `/games` → 200 + `acc ` | pass | contains the Analysis header and cells like `acc 80 · 1??`, `—` for unanalyzed |
| 3. Sanity table | pass | See below; key moments for 5711 below |
| 4. react-chessboard not in src/lib | pass | `grep -rn "from 'react-chessboard'" src/lib` → nothing (board lives in `src/components`) |
| Dev server | n/a | Used the already-running server (PID 77001, started 15:52 before my work); started and killed none |

## Sanity table (all 15 analyzed games, as rendered by the page)
| Game | User acc | Opp acc | B | M | I |
|---|---|---|---|---|---|
| 2565 | 87.9 | 78.6 | 1 | 0 | 1 |
| 2566 | 81.3 | 88.7 | 1 | 0 | 1 |
| 2567 | 93.8 | 89.6 | 1 | 1 | 1 |
| 2568 | 75 | 78.9 | 3 | 2 | 1 |
| 2569 | 92.6 | 84.3 | 0 | 0 | 0 |
| 2570 | 88.7 | 95.7 | 1 | 0 | 0 |
| 2571 | 82.9 | 80.3 | 3 | 0 | 3 |
| 5700 | 84.6 | 94 | 0 | 0 | 3 |
| 5701 | 95.4 | 93.8 | 0 | 1 | 1 |
| 5702 | 83.4 | 76.6 | 1 | 0 | 1 |
| 5703 | 89.7 | 96.8 | 0 | 0 | 1 |
| 5709 | 74.7 | 84.3 | 2 | 0 | 2 |
| 5710 | 76.1 | 80.8 | 1 | 3 | 9 |
| 5711 | 75 | 89.6 | 1 | 0 | 2 |
| 5712 | 79.6 | 78.1 | 1 | 3 | 2 |

## Key moments for game 5711 (the Traxler loss, user = Black)
One moment: **Blunder — 6... Bxf2+ — win chance 54% → 24% · Best was Nxd5.**

The game was `1.e4 e5 2.Nf3 Nf6 3.Bc4 Nc6 4.Ng5 Bc5 5.Bxf7+ Kf8 6.Bd5 Bxf2+ 7.Kxf2 Ng4+ 8.Qxg4 d6 9.Qf3+ Ke8 10.Qf7#`. At 150k nodes Stockfish calls the bishop sacrifice a blunder (54% → 24% from Black's view) and prefers 6...Nxd5 — worth your chess-content eyes, since Bxf2+ is exactly the Traxler idea the owner plays. White converted with the Qxg4 refutation and mated on move 10.

## Deviations from the spec
1. **`judgeDrop` is exported.** The spec's required tests ("drop 9.99 → good, 10 → inaccuracy, 20 → mistake, 30 → blunder" and the lost/won exceptions) cannot be produced through `classifyMoves`: float rounding makes an exactly-10 drop unrepresentable, and drop ≥ 10 mathematically implies winBefore ≥ 10 and winAfter ≤ 90, so the exceptions are unreachable from real evals. `judgeDrop` holds the fixed band logic and is tested directly with exact numbers; `classifyMoves` is tested with ±0.001-margin drops. Formulas unchanged.
2. **Missed chances are uncapped** (the n=3 cap applies to the user's mistakes/blunders, as written); a ply that is both a user blunder and a missed chance appears once, as the blunder/mistake.
3. **Games list shows `acc 93 · 0??` when the blunder count is zero** — the literal spec format. Say the word and I'll drop the `0??`.
4. Classification runs on the server per spec; the client receives judgements/series/plies only.

## Dependencies added
None.

## Questions / proposals for Claude
1. The 5711 key moment flags the owner's book move (Traxler Bxf2+) as the game-losing blunder at 150k nodes. This is engine truth, but since it's chess content the owner will read as coaching, your call whether the moment list needs a note or a higher-node re-analysis later (T011/T014 territory, no action taken).
2. The lost/won exception (winBefore < 10 / winAfter > 90) is inert with these exact bands — it only starts mattering if thresholds change. Kept as specced.
3. Move-list marks use text color + suffix marks + tooltips; graph markers use shape (● mistake / ◆ blunder) + color + title. Confirm that reads well in the owner's visual pass.

## Known issues / follow-ups
- The eval graph area uses two fills (sky above 50%, zinc below) plus a midline; the owner should confirm it reads as "White's chances".
- `selectedPly` starts at 0 (start position), so the current-move panel says "Start position" on load — expected, but flagging in case you wanted ply 1.
