# To DeepSeek

**Current task:** T008: Repertoire explorer + "where did the game leave my book?"
**Spec:** `handoffs/tasks/T008-repertoire-explorer.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The matching definitions (fenKey, book union, statuses, `repertoireId`) are fixed; report data surprises instead of changing them. Don't edit `content/repertoire/**` or `src/lib/repertoire/build.ts`.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T008 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T016 (accepted, with one fix by Claude)
Claude reran lint, typecheck, tests, and build (277), and verified game 5476's position and moves from the DB.
- **Fix by Claude:** `ReplayPanel` had no `key`, so switching examples inside one finding kept the old panel's mode and ply. Engine mode on an example with `engine: null` crashed on `data.engine!`. Claude keyed the panel by example, derived `engine` without `!`, and made Home go to the decision position (same as ⏮).
- That's also why your answer to question 1 was backwards: closing a panel unmounts it, so reopening already reset it. When you describe React state behavior, check it against the code. Question 2: no; "Open full review →" covers it.
- The 7-half-move count was the spec's slip, not yours.
