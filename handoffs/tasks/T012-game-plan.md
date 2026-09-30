# T012: Game plan: weekly tasks + progress tracking (`/plan`)

**Owner:** DeepSeek (Claude wrote the plan rules and copy) · **Depends on:** T009, T011 · **Size:** large

## Goal
In the owner's words: *"I'd like the coach to have a game plan… I do puzzles often but it doesn't affect my actual elo… (play x games) (review this) (do notations) (opening test), keep track of my improvements."*

`/plan` becomes the home page. It gives a **weekly plan** of concrete, auto-tracked tasks built from the owner's Coach findings, a **focus habit** for the week with the metric that should move, a **Sync & analyze** button so tracking needs no manual steps, and a **weekly scorecard** that shows whether the numbers are improving.

**Why the plan looks like this (the copy should reflect it):** the owner's points go to *noticing* errors (hanging pieces, unpunished opponent blunders, not converting), not to missing knowledge. Puzzles alone don't transfer because a puzzle announces that there's a tactic. So the plan (1) moves play to slower games where a blunder check fits, (2) makes reviewing your own losses routine, (3) uses puzzles from the owner's *own* positions, and (4) measures mistakes per game week over week.

## Read first
- `DEEPSEEK.md`, `CLAUDE.md` hard rules
- `src/lib/analysis/coach.ts` (findings), `src/lib/server/training.ts` (drill reviews), `src/components/analysis/use-analyzer.ts` + `batch-analyzer.tsx`, `src/lib/server/sync.ts` + the sync API
- The current nav/layout and home page

## Schema (migration `0005_*`)
- `user_settings`: `userId` (PK, FK users), `timezone` (text, default `'America/Los_Angeles'`), `weeklyGames` (int, default 10), `planSpeed` (text, default `'rapid'`), `puzzlesPerWeek` (int, default 50), `updatedAt`. Create it lazily with the defaults on first read.
- `game_reviews`: `id`, `userId`, `gameId` (FK games, cascade), `reviewedAt`, unique (`gameId`).

## Weeks: `src/lib/plan/week.ts` (pure)
- `weekStart(ms, timeZone)`: the epoch ms of **Monday 00:00** in that time zone. Implement with `Intl.DateTimeFormat(..., { timeZone })` parts, with no dependencies. Handle DST, and test a week that contains the US DST switch (2026-11-01).
- `weekRange(ms, tz)` → `{ start, end }` (end = next Monday 00:00), and `lastNWeeks(now, tz, n)`.

## Plan rules: `src/lib/plan/plan.ts` (pure)
`buildPlan({ settings, findings, week activity })` returns a focus + tasks. Every task has `{ id, title, why, target, done, unit, links[] }`, and `done` is computed from data (no manual checkboxes).
1. **Play:** `Play {weeklyGames} {planSpeed} games` (for rapid, suggest "10+0 or 15+10"). Done = this week's games with `speed === planSpeed`, all accounts. Why: "Slower games leave time for a blunder check before every move. That's where your points go."
2. **Review your losses:** target = this week's losses, any speed, minimum 1 (if there are none, the target is "your last 3 games"). Done = those games with a `game_reviews` row. Links go to each unreviewed game (`/games/{id}`). Why: "Replaying your own mistakes transfers to your games far better than generic puzzles."
3. **Train your own positions:** `Solve {puzzlesPerWeek} puzzles from your games`. Done = `drill_reviews` this week. Link: `/train`. Why: "These are positions you actually got wrong."
4. **Analyze your new games:** shown only while unanalyzed games from this week exist. Target = the number of this week's games; done = analyzed ones. The action is the Sync & analyze button.
5. **Extensibility:** tasks come from a registry of task providers. Later tasks (notation, T017; opening test, T009b) register themselves. Build the registry so adding a task is one file.

**Focus of the week:** the top Coach finding from the **last 90 days** (fall back to 1 year if it has fewer than 20 analyzed games), with its `training` copy as the habit. **Focus metric** by finding id:
- `mistakes-*`: user mistakes+blunders per analyzed game in that phase
- `missed-chances`: missed chances per analyzed game
- `conversion`: the share of winning positions (≥ 85%) not won
- `abandoned-playable` / `early-abandon` / `time-losses-ok-position`: the count per 10 games
- `opening-line`: the score in that line

Show **baseline** (the previous 4 weeks) vs **this week**, with sample sizes. Show "not enough games yet" when this week has fewer than 5 analyzed games. The focus is fixed per week once computed (store it in a `plans` row: `userId`, `weekStart`, `focusId`, `baseline` JSON, unique (`userId`, `weekStart`)), so it doesn't flip mid-week.

## Review tracking
On `/games/[id]`, add a **"Mark reviewed ✓"** button (it shows "Reviewed {date}" once done). Also **auto-mark** when the user has visited every key-moment ply, or reached the last ply when there are no key moments. Add `POST /api/games/[id]/review`.

## Sync & analyze (top of `/plan`)
One button, with an optional auto-run once per page load if the last sync was more than 30 minutes ago:
1. Start a sync for every linked account (existing API) and poll until all are done.
2. Then fetch unanalyzed games from the **current week and the previous one** (add a `since` param to `GET /api/analysis/queue`) and analyze them in the browser with `useAnalyzer`, showing progress: "Analyzing 3 of 7…".
3. Refresh the page data at the end.

## Weekly scorecard (below the tasks)
A table of the **last 8 weeks** (newest first), from pure `weeklyMetrics(games, analyses, reviews, drillReviews, tz)`:

Week · games (by speed) · score % · rating at week end (planSpeed and the most-played speed) · analyzed · **mistakes/game** · **missed chances/game** · **conversion %** · puzzles solved · reviews done · plan tasks completed (x/y, current and past weeks from stored plans).

Metrics without enough data show `—`, with a tooltip giving the sample. Add a small inline-SVG sparkline per metric column header (no library). Put one sentence above the table, computed: "Mistakes per game: 1.2 → 0.9 over the last 4 weeks vs the 4 before." Pick the focus metric.

## Settings
There's a small "Adjust plan" disclosure on `/plan` with `weeklyGames`, `planSpeed` (bullet/blitz/rapid/daily), `puzzlesPerWeek`, and `timezone` (select of common IANA zones plus the current value). It saves via a server action.

## Navigation
- `/` redirects to `/plan`. The nav order is: **Plan**, Coach, Train, Games, Insights, Analyze, Accounts, Board (keep what exists).

## Tests
- `week.test.ts`: Monday boundaries in LA/UTC/Tokyo, and the DST week.
- `plan.test.ts`: each task's target/done from synthetic activity, the loss-review fallback, analyze task visibility, focus selection with the 90-day→1-year fallback, and the registry.
- `metrics.test.ts`: `weeklyMetrics` on synthetic games+analyses across week edges.
- A server test: plan storage (focus fixed per week), reviews (idempotent, cascade), settings defaults, and user scoping.

## Scope: do not
- No notation trainer, no opening test (their tasks come later through the registry), no LLM text, no new dependencies.
- Don't change the classification or coach formulas.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0. Report the count.
2. Migration `0005` applies to the dev DB (back up with `sqlite3 … ".backup …"` first, like you did for T009).
3. `/` → redirect to `/plan`; `/plan` → 200; `POST /api/games/<id>/review` → 200 and is idempotent.
4. **Real-data section:** the owner's plan for the current week (focus + baseline, each task with target/done) and the 8-week scorecard rows as rendered.

**Note:** Claude is re-analyzing the owner's 265 games in the background (T006, `test/zz-reanalyze-*.run.ts` + `vitest.reanalyze.config.mts`, deleted when done). **Don't touch or run those files.** Your `npm test` doesn't include them.

## Report
`handoffs/reports/T012-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
