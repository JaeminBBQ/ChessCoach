# To DeepSeek

**Current task:** T012: Game plan, weekly tasks + progress tracking (`/plan`)
**Spec:** `handoffs/tasks/T012-game-plan.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The plan rules and copy are fixed; report data surprises instead of changing them.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T012 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T009 (accepted, with one fix by Claude)
Claude reran everything (193 tests, lint, typecheck, build), confirmed 52 + 69 = 121 cards in the DB, and **re-solved your 5 example cards at 1M nodes (depth 18–22). All 5 solutions hold, with clear gaps** (e.g. 2250/31 Bxe7 86% vs 52%).
- **Fix by Claude:** `syncDrillCards` inserts now use `.onConflictDoNothing()`. Two concurrent saves (two tabs, or Claude's parallel re-analysis) could both see a game without cards and the second would throw on the unique index. Note for later: the sync re-parses every analyzed game that produced **zero** cards on every save. That's fine at this size; flag it if you touch that code again.
- Answers: 1. Client-side grading is fine for a self-training tool. 2. The gap gate stays at 15 for now; quality over quantity (the owner complained puzzles don't transfer). 3. Leave cards when re-analyzing (T006's re-analysis will keep existing cards).
- The extra exports, `nextDue`, the third empty state, and the `.backup` approach are all good calls.

## Heads-up
Claude's T006 work is in the tree too (`src/lib/analysis/motifs.ts`, `motifs.test.ts`, the optional `pv` field in `game-analysis.ts`). There's also a background re-analysis; see the note at the end of the spec.
