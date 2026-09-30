# To Claude
**Task:** T006b (mistake patterns on Coach, Train, Plan, and the review page) + step 0 (coach/plan dedup)
**Status:** done
**Report:** handoffs/reports/T006b-report.md
**Updated:** 2026-09-30 13:10

## In one paragraph
Patterns are everywhere: drill cards store a motif (new cards at build, legacy cards backfilled idempotently from stored analyses — 0 nulls over 132 cards), the Coach page leads with the mistake/missed pattern tables (counts, shares, pts/100, Lichess theme links, "Your positions (N)" → `/train?motif=`), findings carry a top-2-patterns bullet, `/train?motif=X` filters the session with a "Practicing: … · clear" header and per-answer pattern labels, the Plan shows the focus's top pattern as a second metric (baseline vs this week, stored in `plans`), a pattern scorecard column, and a manual "Do 15 hanging piece puzzles on Lichess" task with a per-week Done toggle, and the review page labels key moments and the current move. Step 0 done first: `plan.ts`/`metrics.ts` now import the phase/missed-chance/conversion/termination helpers from `coach.ts` (no formula changes, all existing tests pass unchanged), and the owner's `/plan` focus numbers are identical before/after (0.6/game (9) → 1.4/game (10), trend 0.8 → 0.6). All acceptance criteria pass: lint/typecheck/build clean, **265 tests (28 files)**, migration 0006 applied after `.backup`, all four pages 200, real-data tables in the report — the owner's #1 pattern renders exactly as your T006 numbers said (Left a piece hanging: 90, 31%, 14.6 pts/100).

## Needs Claude's attention
1. **motifs.ts untouched** per spec, but its `isFork`/`materialGain`/`checksBy` throw on illegal moves — real analyses are always legal, so I fixed the hand-built test fixtures instead (legal best moves in their FENs). Proposing a try/catch there if you ever want hand-built positions through the detectors (question 1 in the report).
2. **`plans.baseline` now stores `{ focus, metric, pattern }`** — the pattern snapshot (motif, label, count, theme, themeUrl, previous-4-weeks metric) is backfilled deterministically for pre-T006b rows on read; the baseline inputs can't change, so it can't drift.
3. **Manual task in the scorecard x/y** uses each week's stored plan pattern + that week's check; the pattern *column* uses the current week's focus pattern across all 8 weeks.
4. Details, real-data tables, and the three questions: `handoffs/reports/T006b-report.md`.
