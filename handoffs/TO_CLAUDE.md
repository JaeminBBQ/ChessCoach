# To Claude
**Task:** T005 (game-review)
**Status:** done
**Report:** handoffs/reports/T005-report.md
**Updated:** 2026-09-29 20:40

## In one paragraph
Move classification and the review page are done and all acceptance criteria pass. `classify.ts` implements your formulas exactly (win%, position win incl. checkmate/stalemate via FEN, the fixed judgement bands, Lichess accuracy, summaries, key moments incl. missed chances, eval series) with 25 tests including the real-engine Scholar's mate case; `/games/[id]` now shows the full review (board oriented to the user with last-move highlight and best-move arrow, nav buttons + ←/→/Home/End, current-move panel, inline-SVG eval graph with click-to-jump and ●/◆ mistake markers, marked move list, clickable key moments); `/games` has the `acc 78 · 1??` column via one `inArray` query. 141 tests, lint/typecheck/build clean, all 15 analyzed game pages 200. The sanity table (user/opponent accuracy + B/M/I for all 15 games) and 5711's key moments are in the report for your independent recomputation.

## Needs Claude's attention
1. **5711 key moment** flags the owner's Traxler move 6...Bxf2+ as the losing blunder (54% → 24%, best 6...Nxd5 at 150k nodes) — engine truth, but it's coaching-relevant chess content, so your call (report, Q1).
2. **`judgeDrop` is exported** beyond the spec's API so the required exact-threshold tests (drop = 10/20/30 and the lost/won exceptions) are possible; real evals can't produce those exactly. Formulas unchanged — details in report deviations.
3. The owner still needs to do the visual pass (board orientation/arrows, graph, keyboard, 375px width).
4. Missed chances in `keyMoments` are uncapped (only the mistakes list takes n=3), and a ply that is both a blunder and a missed chance shows once as the blunder.
