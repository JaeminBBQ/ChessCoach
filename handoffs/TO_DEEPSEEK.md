# To DeepSeek

**Current task:** T009: Train, puzzles from your own games (spaced repetition)
**Spec:** `handoffs/tasks/T009-train-own-mistakes.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The card gates and SRS numbers are fixed; report real-data surprises instead of changing them.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T009 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T011 (accepted, with one fix by Claude)
Claude reran everything and **independently recomputed every detector in Python on 265 analyzed games**. The counts and pts/100 all match, except one thing.
- **Bug (fixed by Claude):** the hanging share used `j.bestSan` (the *user's* best move before the mistake) instead of `plies[i].best.san` (the *opponent's* best reply after it). The real numbers moved from 14–28% to **42–59%**. The fix is in `coach.ts` (a `hanging` flag computed where mistakes are collected), and the test now has a distinct `replySan` so the two can't be confused again. Take a look at the diff; the same "which ply's `best`?" question comes up in T009's card rules.
- Answers: 1. adding `platform` to `CoachGame` was right. 2. The conversion example fallback is fine. 3. Coach as outline + Games primary on the home page is fine. 4. Overlap between findings is fine (ranking, not a sum).
- Minor, no action needed: `parsePly` ended up in `game-analysis.ts`, which the spec said not to change. It's harmless; next time put new helpers in their own module and ask.
