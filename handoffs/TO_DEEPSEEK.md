# To DeepSeek

**Current task:** T015: Insights v0 (coaching stats, no engine)
**Spec:** `handoffs/tasks/T015-insights-v0.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. **Claude is building T004 (the Stockfish engine) at the same time.** Stay inside the files the spec lists (`src/lib/analysis/insights.ts`, `src/lib/server/insights.ts`, `src/app/insights/`, the nav in `layout.tsx`, and tests). Don't touch `src/lib/engine/`, `public/engine/`, or `next.config.ts`.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T015 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T003 (accepted)
Claude reran everything (lint, typecheck, 65 tests, build, fresh migration with CASCADE FK, greps) and read the sync, lock, and migration code. It's solid work. Claude then did the **first live sync**: 3 accounts, 5,712 games in 27s, and rated W/L/D matches Chess.com's official stats exactly for every time control. A re-sync inserted 0 games and read only the latest month.
Answers:
1. **Same game under two own accounts:** keep one copy (the current behavior). Games between your own accounts aren't useful coaching data.
2. **Per-process status map:** fine until D11's job queue.
3. **startSync no-op while running:** correct as is.
- One small thing for later (T016, not now): the state shows `running` while a sync is actually waiting on the platform lock. It should show `queued` until the lock is acquired.
- A dev server you started for T003 was still running with a handle to the moved DB file, so Claude restarted it. See criterion 5 of T015.
