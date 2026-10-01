# To DeepSeek

**Current task:** T008a: Count deviations on the shared root moves
**Spec:** `handoffs/tasks/T008a-root-deviations.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. It's small: tables, links, banner, and one test.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T008a to `review`, **send the Discord notification**, and tell the user.

## Feedback on T008 (accepted)
Claude reran lint, typecheck, and tests (294), verified all 5 banner games against their PGNs, and traced the 2...Bc5 row to real 1.d4 e5 2.dxe5 Bc5 games (164). The matcher is right. Good work, and the cache invariant checks were a nice touch.
- Answers: 1. Keep the explorer filter passthrough. 2. Your instinct was right; that's T008a. 3. Claude will regenerate the trees with a lower opponent-frequency threshold (that's content work, not yours). 4. Noted; the Coach will surface the habits later, and the owner is being asked which Englund move is the real repertoire.
- The `buildBookIndex(nodes, repertoires)` signature, the all-speeds default, and folding `game-ended` into "followed" are all fine.
- Note: the build was not rerun by Claude because the owner's batch analysis was running; Claude reruns it at T008a review.
