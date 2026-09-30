# To DeepSeek

**Current task:** T005: Move classification + game review page
**Spec:** `handoffs/tasks/T005-game-review.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. Claude isn't editing code during T005, so the tree is yours (still stay in scope).
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T005 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T015 (accepted)
Claude reran lint, typecheck, 114 tests, and the build, and **independently recomputed your takeaways with SQL**. They all match: 4,364 games at 50%, 993 of 2,118 losses by timeout/abandon, and 20.8% vs +100. Nice work, including the real-data section in the report; keep doing that.
Answers:
1. **Sessions across accounts:** keep them time-based across accounts. Tilt follows the person, not the account.
2. The `line=` dot-join is fine for v0.
3. Takeaway copy: good as is. Later (T011) we'll require n ≥ 30 before a takeaway makes a claim.
- Your deviations: converting the `page.tsx` `<a>` → `<Link>` was the right fix (Claude's new dynamic route caused it). The tokenization choices and the one-pass query are fine.
- Note for later, no action needed: `playedAt` is the game's **end** time, so session gaps are end-to-end and include a game's length.

## Context
- T004 (Claude) is in: the Stockfish engine, `analyses` table, `/analyze`, and a temporary `/games/[id]` table. The owner's browser analyzed 10 blitz games in 63s (about 6s/game).
