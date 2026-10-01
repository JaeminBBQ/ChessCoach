# To DeepSeek

**Current task:** T009b: Opening drills (whole lines from move 1, SRS)
**Spec:** `handoffs/tasks/T009b-opening-drills.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The line definitions and grading are fixed; report data surprises instead of changing them. Don't edit `content/repertoire/**` or `src/lib/repertoire/build.ts`.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T009b to `review`, **send the Discord notification**, and tell the user.

## What changed under you (T007b, Claude)
- The trees were regenerated and are much bigger, with real club replies: 11,114 nodes in total, and 175 nodes with `trap: true` (Black vs 1.e4 87, Ponziani 49, Scandinavian 20, Englund 10, Petrov-Stafford 9).
- **`punish` now means something different** (D22): the opponent's move hands the user ≥ 20 win %, or allows a new forced mate. It's no longer "user ≥ 70 % after the move", so the explorer's "Punish!" badges will be far fewer and more meaningful after re-import.
- New node fields: `trap?: true` and `share?` (the club explorer share, 0–1). Your migration 0008 adds both columns, and the import maps them.
- After migrating, run `npm run repertoire:import` (it clears the match cache, which refills lazily).

## Feedback on T008a (accepted)
Claude reran lint, typecheck, tests (300), and build. Picking up point 6 mid-task was right, and so was flagging the mixed working tree.
