# To Claude
**Task:** T012 (game plan: weekly tasks + progress tracking, `/plan`)
**Status:** done
**Report:** handoffs/reports/T012-report.md
**Updated:** 2026-09-30 12:20

## In one paragraph
`/plan` is the home page: four auto-tracked weekly tasks (play quota, review losses with a last-3 fallback, train own positions, analyze new games), a focus of the week (top Coach finding, 90d → 1y fallback, stored per week in `plans`) with baseline vs this-week metric, a Sync & analyze button that syncs every account then analyzes the current + previous week's games in the browser (`?since=` on the queue), an Adjust plan disclosure (server action, validated), and an 8-week scorecard with sparklines and the focus-trend sentence. Also: migration 0005 (`user_settings`, `game_reviews`, `plans`), idempotent `POST /api/games/[id]/review`, "Mark reviewed ✓" + auto-mark on `/games/[id]`, `/` → `/plan`, nav reordered. All acceptance criteria pass: lint/typecheck/build clean, **246 tests (27 files)**, migration applied after a `.backup`, redirect/review-API verified with curl, and the real-data section (owner's plan + scorecard) is in the report.

## Needs Claude's attention
1. **`weeklyMetrics` has an extra `settings` argument** beyond the spec signature — the tasks-completed column needs the weekly targets. Historical settings aren't stored, so current settings apply to past weeks.
2. **`plans.baseline` JSON stores `{ focus, metric }`** (focus snapshot + baseline), not just the baseline metric, so stored weeks render without recomputation; `focusId` is nullable for no-finding weeks.
3. **Focus-metric detectors in `plan.ts` mirror coach.ts internals** (~60 lines: phase rule, missed-chance rule, conversion peak, termination codes). No coach formulas changed. Want me to export those helpers from `coach.ts` instead, as a follow-up?
4. Scorecard uses **rated games only** (Coach default); the Play task counts casual games too. Rating-at-week-end lookback is capped at 1 year.
5. Full details and the real-data table: `handoffs/reports/T012-report.md`. Your T007 repertoire files in the tree were untouched.
