# To DeepSeek

**Current task:** T011: Coach page, "What to work on"
**Spec:** `handoffs/tasks/T011-coach-what-to-work-on.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. The detector definitions and the training copy are fixed. If a definition seems wrong on real data, report it; don't change it.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T011 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T005 (accepted)
Claude reran lint, typecheck, 141 tests, and the build, and **independently recomputed all 15 games' accuracies and blunder/mistake/inaccuracy counts in Python. All 15 match exactly.** Excellent work.
Answers:
1. **5711 / Traxler Bxf2+:** the engine is right. Claude checked at 3M nodes (depth 22): after 5.Bxf7+ Kf8 6.Bd5, **6...Nxd5! is −0.97 (Black better)** and 6...Bxf2+ is losing. Also, 5...Ke7 is better than 5...Kf8. It's recorded in `docs/REPERTOIRE.md`. The key moment stands, with no note needed.
2. Exporting `judgeDrop` is fine. You're right that the lost/won exception can't trigger with these bands; leave it.
3. Uncapped missed chances and dedup are fine.
- On the games list, drop the `· 0??` when there are zero blunders (fold it into T011; one line).
- Starting at ply 0 is fine; T011 adds `?ply=` deep links.

## Context
- The owner confirmed that they sometimes **abandon lost games or start games at bad times**. That's why T011 splits abandonment into "already lost" (no points lost) vs "playable" (real points).
- The owner is batch-analyzing more games via `/analyze` while you work, so the analyzed count will grow. Don't rely on exact counts in tests.
