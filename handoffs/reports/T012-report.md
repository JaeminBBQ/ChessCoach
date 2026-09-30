# T012 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built the `/plan` home page: a weekly plan of four auto-tracked tasks (play, review losses, train own positions, analyze new games), a focus of the week with its metric (baseline vs this week, fixed per week via a `plans` row), a Sync & analyze button that syncs every account then analyzes this week's + last week's games in the browser, an "Adjust plan" disclosure saving via a server action, and an 8-week scorecard with sparklines and a focus-trend sentence. Added `user_settings`, `game_reviews`, and `plans` tables (migration 0005), a `POST /api/games/[id]/review` endpoint (idempotent), a "Mark reviewed ✓" button on `/games/[id]` with auto-mark when every key-moment ply is visited, and `?since=` on the analysis queue. `/` now redirects to `/plan` and the nav reads Plan · Coach · Train · Games · Insights · Analyze · Accounts · Board.

## Files changed
- `src/lib/db/schema.ts`, `drizzle/0005_overconfident_iron_patriot.sql`: `user_settings`, `game_reviews`, `plans` tables.
- `src/lib/plan/week.ts`: pure Monday-00:00 week math via `Intl` (DST-safe, no deps).
- `src/lib/plan/types.ts`, `src/lib/plan/tasks/*.ts`: task registry; each task is one file (`play`, `review`, `train`, `analyze`) + one line in `tasks/index.ts`.
- `src/lib/plan/plan.ts`: `buildPlan`, `pickFocus` (90d → 1y fallback), `focusMetric` per finding id, `focusTrendSentence`.
- `src/lib/plan/metrics.ts`: `weeklyMetrics` (8-week scorecard rows incl. per-week task completion).
- `src/lib/plan/{week,plan,metrics}.test.ts`: 33 pure tests.
- `src/lib/server/plan.ts` + `plan.test.ts`: settings (lazy defaults), reviews (idempotent, user-scoped, cascade), plan rows (focus fixed per week), drill-review queries.
- `src/app/plan/page.tsx`, `src/app/plan/actions.ts`: the page + settings server action (validated).
- `src/components/plan/{sync-analyze,adjust-plan,scorecard}.tsx`: Sync & analyze (auto-runs once per page load when the last sync is > 30 min old), the settings form, the scorecard table with inline-SVG sparklines.
- `src/components/review/review-panel.tsx`, `src/components/analysis/game-review.tsx`: Mark reviewed button + auto-mark (`onReviewComplete` fires once when every key-moment ply has been visited, or the last ply when there are none).
- `src/app/api/games/[id]/review/route.ts`: idempotent review POST.
- `src/app/api/analysis/queue/route.ts`, `src/lib/server/analyses.ts`: `?since=` filter (+ test).
- `src/app/page.tsx` (redirect to `/plan`), `src/app/layout.tsx` (nav order), `src/app/games/[id]/page.tsx` (ReviewPanel).
- `src/lib/analysis/coach.ts` (`opponentName` added to `CoachGame`), `src/lib/server/coach.ts` (selects it), `coach.test.ts` fixture: additive, no formula changes.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0 | pass | lint: clean · typecheck: clean · **246 tests / 27 files passed** (up from 193) · build: compiled, 14/14 pages |
| Migration 0005 applies to the dev DB (backed up first) | pass | `sqlite3 data/chesscoach.db ".backup data/chesscoach.db.bak-0005"` (23.8 MB) → `npm run db:migrate` → `game_reviews`, `plans`, `user_settings` present |
| `/` → redirect to `/plan`; `/plan` → 200; `POST /api/games/<id>/review` → 200 and idempotent | pass | `/` → **307** → `/plan`; `/plan` → **200**; first POST → `{"reviewedAt":1790795325909}` 200, second POST → **same timestamp** 200, unknown id → 404 (test review row deleted afterwards — real data left clean) |
| Real-data section: owner's plan + 8-week scorecard as rendered | pass | see below |

## Real-data section (owner, week of 2026-09-28, America/Los_Angeles)
```
Focus of the week: Mistakes in the middlegame
  Habit: Build a blunder check: before every move, ask "What does their last move
  attack?" ... Do 15 minutes of rated puzzles a day.
  Previous 4 weeks: 0.6/game (9 games) → This week: 1.4/game (10 games)

○ Play 10 rapid games          0/10 games
○ Review your losses           0/10 games   (10 opponent links)
○ Solve 50 puzzles from your games   7/50 puzzles
○ Analyze your new games      10/15 games  (5 left — matches ?since queue: [5708, 5707, 5706, 5705, 5704])

Weekly scorecard: "Mistakes per game: 0.8 → 0.6 over the last 4 weeks vs the 4 before."
Week      Games              Score  Rating (rapid · most-played)  An.  Mist/g  Missed  Conv   Pz  Rev  Tasks
Sep 28    10 blitz · 5 daily  30%   1291 rapid · 1146 blitz       10   2.10    1.10    33%   7    0    0/4
Sep 21    3 blitz             67%   1291 rapid · 800 blitz        3    1.00    0.33    0%   0    0    0/3
Sep 14    2 blitz             50%   1291 rapid · 792 blitz        2    0.50    0.00    0%   0    0    0/3
Sep 7     —                   —     1291 rapid                   0    —       —       —     0    0    0/3
Aug 31    4 blitz · 4 daily   75%   1291 rapid · 793 blitz        4    2.25    0.25    50%   0    0    0/4
Aug 24    23 blitz · 3 rapid  50%   1291 rapid · 792 blitz        23   1.00    0.26    33%   0    0    0/4
… (8 rows total, newest first)
```

## Deviations from the spec
1. **`weeklyMetrics` takes one extra argument** — `settings` — beyond the spec's `(games, analyses, reviews, drillReviews, tz)`. The "plan tasks completed (x/y)" column needs the weekly targets (`weeklyGames`, `planSpeed`, `puzzlesPerWeek`), and historical settings aren't stored, so the current settings are applied to all 8 weeks (documented in the code). Past-week task completion is recomputed from activity data; the only thing the `plans` row stores is the focus, per the spec's schema.
2. **`plans.baseline` JSON stores a bit more than the baseline metric**: `{ focus: { id, title, habit }, metric }`, so a stored week renders without recomputing findings (and the title/habit can't drift mid-week either). `focusId` is duplicated in its own column per the spec, and it's **nullable** (a week can have no findings — that state is also fixed per week).
3. **Focus-metric detectors in `plan.ts` mirror `coach.ts` internals** (phase rule, missed-chance rule, conversion peak, termination codes) because coach.ts keeps them private. No formula was changed or duplicated *in* coach.ts; see Questions #1.
4. **Scorecard uses rated games only**, matching the Coach/Insights default (casual games are noise for coaching stats). The Play task counts all games at the plan speed, rated or not, per the spec's wording.
5. `plans` has an auto-increment `id` and `createdAt` (not in the spec's column list) — standard for the codebase's tables.
6. The spec's `weekRange` end is next Monday 00:00 (not start + 7 absolute days): a naive +7d lands one hour before Monday across a DST fall-back; the DST week spans 169 h and is tested (2026-11-01).
7. Rating at week end uses the latest rated game of that speed **within the last year** (the page loads 1y of games for the focus anyway); older lookback would show —.

## Dependencies added
None.

## Questions / proposals for Claude
1. The focus-metric detectors duplicate ~60 lines of coach.ts internals. Cleaner: export `phaseAt`, `isAbandonedLoss`, `isTimeLoss`, and the conversion-reached scan from `coach.ts` and have `plan.ts` import them. I didn't touch coach.ts beyond `opponentName` to keep the "don't change the coach" scope strict — happy to do the refactor as a follow-up.
2. The scorecard's "mistakes/game" column is all-phases, while the trend sentence uses the focus metric (e.g. middlegame-only for the current focus), so the numbers differ by design ("pick the focus metric"). Flagging in case you'd rather the column and sentence always agree.
3. The auto-mark triggers on visiting every key-moment ply **or** the last ply when there are no key moments; the deep-linked initial ply counts as visited. Say the word if you want interaction-only counting.
4. The analyze task's `done` uses "has an analysis now" for past weeks (as-of semantics would need `analyses.createdAt`); reviews and drill reviews use their timestamps. Fine at this scale — flagging per your T009 note pattern.

## Known issues / follow-ups
- Sync & analyze auto-run happens on a full page load; `router.refresh()` doesn't re-trigger it (component state persists), which matches "once per page load".
- Claude's T007 repertoire work (`content/`, `scripts/repertoire/`, `src/lib/repertoire/`, `vitest.content.config.mts`, the `content:repertoire` npm script) was already in the working tree; untouched by this task.
- The re-analysis files (`test/zz-reanalyze-*.run.ts`, `vitest.reanalyze.config.mts`) are gone as promised; `npm test` never saw them. 265/265 analyses present in the dev DB.
