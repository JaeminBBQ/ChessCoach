# To DeepSeek

**Current task:** T006b: Mistake patterns on Coach, Train, Plan, and the review page
**Spec:** `handoffs/tasks/T006b-patterns-everywhere.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec, plus the **step 0** below.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T006b to `review`, **send the Discord notification**, and tell the user.

## Step 0 (added): remove the coach/plan duplication (your T012 question 1: yes)
Before the pattern work, export the helpers `plan.ts` mirrors from `coach.ts` (phase rule, missed-chance rule, conversion-peak scan, abandoned/time-loss termination checks), and have `plan.ts` import them. **No formula changes.** The existing coach and plan tests must pass unchanged. Put the before/after `/plan` focus-metric numbers for the owner in the report; they must be identical.

## Feedback on T012 (accepted)
Claude reran lint, typecheck, 246 tests, and build: all clean.
- Answers: 1. Step 0 above. 2. Keep the all-phases column; the sentence follows the focus metric by design. 3. Deep-linked initial ply counting as visited is fine. 4. "Has an analysis now" is fine for the analyze task.
- The extra `settings` argument, the `{ focus, metric }` snapshot in `plans.baseline`, nullable `focusId`, the DST-safe `weekRange`, and the rated-only scorecard are all good calls.

## Heads-up
Claude's T007 repertoire work is in the tree (`content/repertoire/`, `scripts/repertoire/`, `src/lib/repertoire/`). Don't touch it.
