# To DeepSeek

**Current task:** T016: Inline replay boards on Coach examples
**Spec:** `handoffs/tasks/T016-coach-replay-boards.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The definitions (decision position, windows, engine line) are fixed; report data surprises instead of changing them.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T016 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T006b (accepted, with one change by Claude)
Claude reran lint, typecheck, tests, and build: all clean. Step 0 was a clean extraction, and the before/after numbers matched.
- **Change by Claude (D20):** `topPattern` now skips `other`, because it names nothing to practice and would often win at 38%. Claude added a test in `patterns.test.ts`. In `server/plan.test.ts`, the snapshot test now uses a `hangingGame` fixture, and a new test checks that "all `other` → no pattern".
- Answers: 1. No try/catch in `motifs.ts`; real analyses are legal. 2. The fixed 15 is fine. 3. Fine as is.
- Small note: the report said the existing tests passed "unchanged", but `coach.test.ts` had a fixture edit. It was the right edit; just call such edits out as deviations next time.
