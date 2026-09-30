# T011 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built `/coach`: a pure detector module (`src/lib/analysis/coach.ts`) that ranks the owner's weaknesses by expected points lost per 100 games — mistakes by phase (opening ≤ ply 20, then endgame when ≤ 6 non-king/pawn pieces), missed chances, conversion of ≥ 85% positions, abandonment split into "playable" (analyzed, real points) vs "already lost" (effectively resigned) vs "early" (results-only estimate), time losses in fine positions, and weak opening lines (n ≥ 15, score < 0.42, at most 2). Each finding carries a headline, computed evidence bullets, up to 3 example deep links (`/games/{id}?ply=N`), and the fixed training copy. The page shows the top 3 as cards and the rest as expandable rows, with the needsAnalysis callout under 20 analyzed games. Also added `?ply=` deep links to the game review and dropped the `· 0??` suffix on the games list (T005 feedback).

## Files changed
- `src/lib/analysis/coach.ts` (new): pure detectors — `coach(games)` → `{ findings, analyzedGames, totalGames, needsAnalysis }`; phase/win%/termination helpers; fixed training copy.
- `src/lib/analysis/coach.test.ts` (new): 11 tests with hand-built `CoachGame`s and tiny `GameAnalysis` objects (phase boundaries, hanging share, missed-chance rule, conversion, both platforms' abandonment codes, early-abandon at 10 vs 11 user moves, opening-line gating, ranking, evidence < 5 gate, needsAnalysis at 19 vs 20).
- `src/lib/server/coach.ts` (new): `loadCoachGames(db, userId, filters)` — left-joins `analyses` on gameId **and** userId, scoped by `userId`, same filters as `loadInsightGames`.
- `src/lib/server/coach.test.ts` (new): join correctness (incl. an analysis stored under a different owner not being attached), filters, per-user scoping.
- `src/app/coach/page.tsx` (new): page with Insights-style URL filters, header sentence, needsAnalysis callout, top-3 cards, "Also noticed" `<details>` rows.
- `src/lib/analysis/game-analysis.ts`: added `parsePly(param, lastPly)` (pure, clamped).
- `src/lib/analysis/game-analysis.test.ts`: `parsePly` tests.
- `src/lib/server/insights.ts`: exported `rangeStart` for reuse by the coach loader.
- `src/app/games/[id]/page.tsx` + `src/components/analysis/game-review.tsx`: `?ply=` opens the review at that ply (invalid → 0).
- `src/app/games/page.tsx`: `acc 78` without `· 0??` when a game has no blunders.
- `src/app/layout.tsx`, `src/app/page.tsx`: Coach nav item (first after the logo) and home link.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | `npm run lint` clean; `npm run typecheck` clean; `npm test` → **157 passed (18 files)**; `npm run build` clean, `/coach` listed as dynamic route |
| Dev server URLs 200 | pass | Reused the running dev server: `/coach` → 200, `/coach?range=all` → 200, `/games/5688?ply=12` → 200 (also checked invalid plys: `?ply=99999`, `?ply=abc` → 200, clamped to 0) |
| Real-data findings | pass | See below (run against the dev DB at 21:13; the owner was batch-analyzing, so counts grow) |

## Real-data findings

Run at 21:13 against `data/chesscoach.db` via the real `loadCoachGames` + `coach()` (rated games, most-played speed = blitz). **142 analyzed games** at run time (418 total in the 1y filter; 146 by the time of the final page check — the owner's parallel batch was running).

**Defaults: rated, last year, blitz — 418 games, 142 analyzed:**

| id | pts/100 | sample | headline | evidence |
|---|---|---|---|---|
| mistakes-middlegame | 30.1 | analyzed, 142 | 114 mistakes and blunders in the middlegame — 0.8 per game, worth 30.1 points per 100 games. | 114 mistakes and blunders in the middlegame over 142 analyzed games (0.8 per game). · Together they cost 30.1 points per 100 games. · In 26% of them, the opponent's best reply was a capture: something was left hanging. |
| missed-chances | 24.4 | analyzed, 142 | You let 89 chances to punish big opponent mistakes slip away — worth 24.4 points per 100 games. | 89 times your opponent's move dropped at least 20 win % and your reply gave most of it back (your own drop ≥ 10). · Those replies cost 24.4 points per 100 games. |
| conversion | 21.1 | analyzed, 142 | You reached a winning position (≥ 85%) in 94 games and failed to win 31 of them. | 31 of the 94 games where you reached a winning position (≥ 85%) weren't won. · That costs 21.1 points per 100 games. |
| mistakes-endgame | 17.1 | analyzed, 142 | 52 mistakes and blunders in the endgame — 0.4 per game, worth 17.1 points per 100 games. | 52 mistakes and blunders in the endgame over 142 analyzed games (0.4 per game). · Together they cost 17.1 points per 100 games. · In 19% of them, the opponent's best reply was a capture: something was left hanging. |
| mistakes-opening | 13.4 | analyzed, 142 | 53 mistakes and blunders in the opening — 0.4 per game, worth 13.4 points per 100 games. | 53 mistakes and blunders in the opening over 142 analyzed games (0.4 per game). · Together they cost 13.4 points per 100 games. · In 28% of them, the opponent's best reply was a capture: something was left hanging. |
| early-abandon | 3.2 | all, 418 | You abandoned 27 games within your first 10 moves. | 27 losses came from abandoning before your 11th move. · Estimated at 0.5 points each — an early position is roughly equal. |

Example links on the top findings, e.g. mistakes-middlegame: `/games/5556?ply=22` `11...Kh8?? (82% → 0%)`, `/games/5592?ply=28` `14...Bxf5?? (90% → 9%)`, `/games/5663?ply=29` `15.Qh5+?? (87% → 8%)`. (`abandoned-playable` and `time-losses-ok-position` did not pass their ≥ 5-game gates in this data.)

**Range = all, blitz — 4364 games, 142 analyzed:** identical engine findings (all analyses are within the last year); early-abandon grows to 178 games / 2.0 pts/100 (sample: all, 4364); two opening lines appear:

| id | pts/100 | sample | headline | evidence |
|---|---|---|---|---|
| opening-line:black:e4.e5.Nf3.Nf6.Bc4.Nc6 | 0.3 | all, 4364 | You score 38% in this line (40W 66L 0D over 106 games) — 13.0 expected points below a 50% line. | 38% score over 106 games (40W 66L 0D). · 0.3 points per 100 games below a 50% baseline. |
| opening-line:black:d4.e5.dxe5.Bc5.Nc3.d6 | 0.1 | all, 4364 | You score 21% in this line (4W 15L 0D over 19 games) — 5.5 expected points below a 50% line. | 21% score over 19 games (4W 15L 0D). · 0.1 points per 100 games below a 50% baseline. |

(The 106-game line is the Two Knights/Italian setup — note game 5711 from T005 is its most recent loss.)

## Deviations from the spec
1. **`CoachGame` includes `platform`** in addition to the InsightGame fields + `id` + `analysis`. The detector definitions require it: Chess.com stores `abandoned` where Lichess stores `timeout` for the same event, and `timeout` means time loss on Chess.com while `outoftime` does on Lichess. The loader selects `games.platform` directly (no extra join).
2. **Conversion example fallback:** when the win % never drops below 60 after the peak, the example is the final ply (spec only defines the "first drop below 60" case).
3. **Opening-line example label:** the spec left the label open; it shows the game date.
4. **Home page:** Coach was added as an outline link first; "Games →" stayed the filled primary. Say the word if Coach should be primary.

## Dependencies added
None.

## Questions / proposals for Claude
1. `abandoned-playable` and `early-abandon` can both fire for the same short analyzed game (the former is the engine-measured points, the latter the results-only estimate). I read the spec as intending that; flagging in case you want early-abandon to exclude analyzed abandonment games.
2. Should the points-per-100 denominators differ by sample kind as speced (engine: analyzed count; results-only: all games), the same raw total can rank differently between filters — e.g. early-abandon's 178 games in `range=all` score lower per-100 than 27 in `1y`. That's the spec's formula; no change made.

## Known issues / follow-ups
- The owner was batch-analyzing during the report run; the page's analyzed count is live and will keep rising.
