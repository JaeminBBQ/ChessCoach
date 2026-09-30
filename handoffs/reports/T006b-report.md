# T006b Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Put Claude's mistake-pattern detector everywhere: drill cards store their motif (new cards at build time, legacy cards backfilled from stored analyses, idempotently), the Coach page leads with "Your mistake patterns" tables (mistakes and missed chances, with counts/shares/pts-100, Lichess theme links, and "Your positions (N)" links into `/train?motif=`), mistakes-*/missed-chances findings carry a top-2-patterns evidence bullet, `/train?motif=X` filters the session (same due/new rules and daily cap) with a "Practicing: … · clear" header and a pattern line after each answer, the Plan shows a second focus metric for the focus's top pattern (baseline vs this week, stored per week in `plans`), a "Hanging pieces/game"-style scorecard column, and a manual "Do 15 {theme} puzzles on Lichess" task with a per-week Done toggle, and the review page labels key moments and the current move with their pattern. Step 0 (Claude's T012 question 1) is also done: `plan.ts`/`metrics.ts` now import the phase rule, missed-chance rule, conversion-peak scan, and termination checks from `coach.ts`; the owner's `/plan` focus numbers are identical before and after.

## Step 0: coach/plan dedup (before/after numbers)
Exported from `coach.ts` (no formula changes): `phaseAt`, `isMissedChance`, `winningPeak`, `isAbandonedLoss`, `isTimeLoss`, `userMoveCount`. `plan.ts` and `metrics.ts` import them; their local mirrors are gone, and `conversionOf` now uses `winningPeak`. All existing coach/plan/metrics tests pass unchanged.
- **Before:** baseline 0.6/game (9 games) → this week 1.4/game (10 games); trend "0.8 → 0.6".
- **After:** identical (0.6/game (9) → 1.4/game (10); trend 0.8 → 0.6).

## Files changed
- `drizzle/0006_lyrical_spot.sql`, `src/lib/db/schema.ts`: `drill_cards.motif` (nullable text); new `plan_task_checks` table (userId, weekStart, taskId, unique per triple).
- `src/lib/analysis/patterns.ts` (+ test): pure pattern tables (`mistakePatterns`, `patternTakeaway`), `patternCounts`/`topPattern` for findings and the Plan, `MOTIF_METRIC_LABEL` for column names.
- `src/lib/analysis/coach.ts` (+ test): step-0 exports; mistakes/missed now carry their motif; top-2-patterns evidence bullet in `mistakes-*` and `missed-chances` findings.
- `src/lib/training/cards.ts` (+ test): `CardDraft.motif` from `missedMotif`/`mistakeMotif`.
- `src/lib/server/training.ts` (+ test): motif on inserts; idempotent null-motif backfill in `syncDrillCards`; `trainingQueue(…, motif?)`; `motifCardCounts`.
- `src/app/api/train/queue/route.ts`, `src/app/train/page.tsx`, `src/components/training/trainer.tsx`: `?motif=` (validated against `MOTIF_LABEL`, 400 on unknown), "Practicing: … · clear" header, pattern line after the answer.
- `src/app/coach/page.tsx`: "Your mistake patterns" section above the findings (takeaway sentence + two tables with theme/"Your positions (N)" links; theme link hidden for `other`, positions link hidden at N=0).
- `src/lib/plan/*`: `patternFocusMetric`; `PlanActivity.pattern`/`manualChecks`; `manual` flag on tasks (complete = done > 0); new `lichessPuzzlesTask` registry provider (hidden without a themed top pattern).
- `src/lib/plan/metrics.ts` (+ test): pattern column (`patternPerGame`, null when no data), per-week manual task from that week's stored plan pattern + its check.
- `src/lib/server/plan.ts` (+ test): pattern snapshot in `plans.baseline` (`{ focus, metric, pattern }`) with a deterministic backfill for pre-T006b rows; `toggleTaskCheck`, `taskChecksForWeek`, `listTaskChecks`, `listPlanPatterns`.
- `src/app/plan/{page,actions}.tsx`, `src/components/plan/plan-task-check.tsx`, `src/components/plan/scorecard.tsx`: FocusCard second metric (same ≥5-analyzed gate), manual Done toggle (server action), pattern scorecard column.
- `src/app/games/[id]/page.tsx`, `src/components/analysis/game-review.tsx`: `motifLabels` map → "Blunder · Left a piece hanging" in key moments and the current-move panel.
- `src/lib/server/analyses.ts`: unchanged (T012's `since` still in place).

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| lint / typecheck / test / build → exit 0 | pass | all clean; **265 tests / 28 files** (up from 246) |
| Migration 0006 applies (`.backup` first); after `/train` loads once, `group by motif` has no nulls | pass | `.bak-0006` (23.8 MB) → `db:migrate` → `/train` 200 → **0 nulls** over 132 cards |
| `/coach`, `/train?motif=hangingPiece`, `/plan`, `/games/<analyzed id>` → 200 | pass | all 200 (game 2247); `/train?motif` shows "Practicing: Left a piece hanging · clear" |
| Real-data section: pattern tables (defaults and `range=all`) + card counts per motif | pass | see below |

## Real-data section (owner)
**`/coach` — Your mistake patterns** (identical for defaults and `range=all`):
```
Your most expensive pattern is Left a piece hanging: 90 mistakes, 14.6 points per 100 games.
Mistake patterns:  Other (positional or deeper tactic)   111  38%  12.5  Your positions (58) →
                  Left a piece hanging                   90   31%  14.6  Lichess puzzles ↗ · Your positions (14) →
                  Lost material to a combination         38   13%   5.5  Lichess puzzles ↗ · Your positions (4) →
                  Walked into a fork                     19    7%   2.7  Lichess puzzles ↗ · Your positions (1) →
                  Allowed a mate                         18    6%   4.1  Lichess puzzles ↗ · Your positions (5) →
                  Let their pieces attack your king      14    5%   1.8  Lichess puzzles ↗ · Your positions (2) →
Missed-chance patterns:  Other (positional…) 82 50% 9.7 · Missed a combination 29 18% 4.1 · Missed a free piece 22 13% 3.8 · Missed a fork 14 8% 1.7 · …
```
(The #1 numbers match the spec's T006 stats exactly: 90 mistakes, 31%, 14.6 pts/100.)

**Drill cards per motif:** other 58 · missedMaterial 14 · missedFreePiece 14 · hangingPiece 14 · missedFork 10 · missedKingAttack 6 · allowedMate 5 · missedMate 4 · lostMaterial 4 · kingAttack 2 · fork 1 (132 total, 0 null).

**`/plan`:** focus "Mistakes in the middlegame" now shows *Top pattern: Left a piece hanging — 0.1/game (9 games) → 0.2/game (10 games)* (backfilled into the existing plans row), the task list ends with *○ Do 15 hanging piece puzzles on Lichess · Mark done · Lichess theme*, and the scorecard gained a **Hanging pieces/game** column (0.20 for the current week; tasks now x/5 with the manual task).

**`/games/2247`:** the key-moment row for its mistake carries "Other (positional or deeper tactic)".

## Deviations from the spec
1. **`motifs.ts` untouched**, but its `isFork`/`materialGain`/`checksBy` throw on illegal moves. Real analyses always have legal best moves, so this only bit the hand-built fixtures; I made the fixture best moves legal in their FENs (cards.test SCHOLAR_FEN, coach.test Kg1 for the tiny endgame FEN) instead of touching the module.
2. **Pattern snapshot shape**: `plans.baseline` now stores `{ focus, metric, pattern }` where `pattern = { motif, label, count, theme, themeUrl, metric }` — the metric is the pattern baseline over the previous 4 weeks (same gates as the main focus metric). Pre-T006b rows are backfilled deterministically on read (the previous-4-weeks pool can't change), so the backfill can't drift.
3. **Manual task in the scorecard**: the x/y for past weeks includes the Lichess task only when that week has a stored plan with a pattern, and its done comes from that week's `plan_task_checks` row. The pattern **column** uses the current week's focus pattern across all 8 weeks.
4. **Top-pattern selection** ties broken by first-seen (a tie is unlikely; counts differ in practice). `topPattern` returns the theme via `lichessTheme`; a top pattern of `other` yields no theme → no Lichess task (nothing to link).
5. The takeaway sentence compares across both tables by pts/100 and says "mistakes" vs "missed chances" accordingly.
6. Unknown `/train?motif=` values: the page silently ignores them (renders the normal page); the API returns 400.

## Dependencies added
None.

## Questions / proposals for Claude
1. `isFork` (and friends) in `motifs.ts` throw on illegal moves. On real data the engine's best move is always legal, so it's moot — but if you ever feed hand-built positions through the detectors again, a try/catch returning `false` there would be kinder. Say the word and I'll add it (that's a change to motifs.ts, so I left it out).
2. The `lichessPuzzlesTask` is always "Do 15 …" — the count is fixed, not a setting. Easy to add `lichessPuzzlesPerWeek` to `user_settings` if you want it adjustable.
3. The missed-chance patterns table includes `other` at 50% — the theme link is hidden there as specced, so half the missed chances have no practice link. If you want the "Your positions" link to count for `other` too it already does.

## Known issues / follow-ups
- Cards are only backfilled/created when `syncDrillCards` runs (Train page load, or an analysis save) — same as before T006b; 0 nulls after one `/train` load as the acceptance requires.
- Claude's T007 repertoire files in the tree were untouched.
