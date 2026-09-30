# T015 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built `/insights`: a pure aggregation module (`src/lib/analysis/insights.ts`) covering first-move tokenization, scores, opening grouping + drill-down, terminations, rating-diff bands, sessions/tilt, rating series, and per-color scores; a user-scoped server query with filters and date ranges; and a Server Component page with a hand-rolled inline-SVG rating chart, per-color opening tables that drill down one ply via `line=`/`color=` URL params with a breadcrumb, termination share tables (time/abandon losses highlighted), rating-diff bands, and session/tilt bars. Every section shows a computed, factual one-line takeaway (marked `data-takeaway` in the HTML).

## Files changed
- `src/lib/analysis/insights.ts`: pure aggregations, no DB/React/chess.js.
- `src/lib/analysis/insights.test.ts`: 29 unit tests incl. real PGN fixtures from both platforms, band-edge tests, session-gap tests, downsample test, and a 6,000-game performance guard.
- `src/lib/server/insights.ts`: `loadInsightGames(db, userId, filters)` — account/speed/rated/range filters, `userId`-scoped, selects only `InsightGame` columns.
- `src/lib/server/insights.test.ts`: filter, range-boundary, column-shape, and cross-user scoping tests.
- `src/app/insights/page.tsx`: the page (filters as URL params like `/games`, sections in spec order).
- `src/app/layout.tsx`: "Insights" nav link.
- `src/app/page.tsx`: deviation — see below.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| 1. lint / typecheck / test / build exit 0 | pass | `npm run lint` (no output), `npm run typecheck` (no output), `npm test` → **114 passed (114)** (15 files), `npm run build` → "✓ Compiled successfully", route table lists `ƒ /insights` |
| 2. `/insights?range=all` 200 < 3s warm | pass | `curl -w "%{time_total} %{http_code}"` → first **1.019852 200** (cold, includes route compile), second **0.296075 200** (warm) |
| 3. `1.e4 e5 2.Nf3 Nf6` appears on range=all blitz rated | pass | `curl -s "...?range=all&speed=blitz&rated=1" \| grep -o "1.e4 e5 2.Nf3 Nf6"` → 3 matches (top line in the As Black table) |
| 4. no chess.js in insights.ts | pass | `grep -rn "from 'chess.js'" src/lib/analysis/insights.ts` → no output (exit 1) |
| 5. no leftover dev server from me | pass | I never started one. Used the already-running server (PID 77001, started 15:52, before my work) per criterion 5; did not kill it. |

## Deviations from the spec
1. **`src/app/page.tsx` (home): swapped `<a href>` for `<Link>` on all three internal links.** Outside the listed files, but necessary for criterion 1: Claude's T004 route `src/app/games/[id]/` made `@next/next/no-html-link-for-pages` flag the home page's `<a href="/games">` (the rule's dynamic-route regex `^/games/(…)$` matches the bare path; it did not match before the dynamic route existed, which is why lint was green at T003). I converted all three home links, not just `/games`, so any future dynamic sibling route can't trip the same rule. Easy to revert if Claude prefers otherwise.
2. **`byOpening` skips games that ended before the requested ply** (they never reached the line), and `firstMoves` strips trailing `+ # ! ?` marks so `Nc7+` and `Nc7` group as one line. Both are tokenization choices; flagging in case Claude wants raw-SAN grouping instead.
3. **The page runs one DB pass for the filtered range** (all speeds) and filters the default speed in memory — a second pass would re-pull the large `pgn` column.
4. Sessions are **time-based across accounts** (spec was silent); games on two accounts inside 20 minutes count as one session.

## Dependencies added
None.

## Questions / proposals for Claude
1. Should sessions split per account? (Deviation 4.)
2. `line=` joins moves with dots; SAN tokens never contain dots in practice, but a PGN "e.p." suffix would break parsing. I left it — fine for v0?
3. Takeaway copy is strictly computed and factual, as specced. Happy to tune phrasing (e.g. only speak about buckets with n ≥ 30) once you see the real-data sentences below.
4. The working tree currently mixes my T015 files with your uncommitted T004 work (engine, analyze, migration 0003, games/[id], etc.). I did not touch any T004 file; when you review T015, the diff will include both.

## Known issues / follow-ups
- A garbage `line=` param renders a breadcrumb like "1.garbage" with an empty drill table — cosmetic, 200.
- Chess.com loss terminations like `timevsinsufficient` match the time-highlight regex, `resigned` does not (Chess.com stores the user's own result code, so a loss by the user's resignation shows `resigned`; `checkmated` = loss by mate). Noted in case the loss table looks surprising.

## Real-data takeaways (range=all, speed=blitz, rated — 4,364 games)
These are the exact `data-takeaway` sentences the page generated; sanity-check them against the DB:

- Summary: **You score 50% over 4364 games: 52% as White and 48% as Black.**
- Rating trend: **Chess.com poip0i333 · blitz: 385 → 774 (+389).**
- Openings: **Among lines with at least 5 games, your best is 1.e4 e5 2.d4 exd4 3.Qxd4 Nc6 as Black (72% over 39 games) and your weakest is 1.e4 e5 2.Nf3 Nf6 3.d4 exd4 as Black (36% over 25 games).**
- How games end: **47% of your losses end by timeout or abandonment (993 of 2118).**
- Opponent strength: **You score 21% against opponents rated 100+ points higher (204 games) and 81% against opponents rated 100+ points lower (212 games).**
- Sessions: **You score 50% in the first game of a session (2586 games), 51% right after a win (932 games), 49% right after a loss (804 games), 56% right after a draw (42 games).** Caption: 2586 sessions · 1.7 games per session on average.
- Drill-down on the owner's Petrov move order (line `e4.e5.Nf3.Nf6`, as Black): **In 1.e4 e5 2.Nf3 Nf6 you score 48% (341W 364L 17D over 722 games).** Its children by frequency: 3.Nxe5 (Stafford), 3.Nc3, 3.Bc4, 3.d3, 3.d4, 3.c3, 3.Bd3, … — matches the repertoire doc's known replies.

For comparison, the default view (last year, rated, blitz — 418 games): 51% score, blitz 661 → 774 (+113), 78% of losses by time/abandon.
