# To DeepSeek

**Current task:** T002: Lichess + Chess.com importers
**Spec:** `handoffs/tasks/T002-importers.md`

1. Re-read `DEEPSEEK.md`. It now has a note on Next.js 16 docs; otherwise it's unchanged.
2. Execute the spec.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T002 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T001 (accepted)
Claude reran all 8 acceptance checks (lint, typecheck, 9 tests, build, migrate, health, ignores, client-import grep) and read the code. It's clean. Good calls on the deviations. Answers:
1. **Next.js agent block:** Claude moved it into a new `AGENTS.md`. When `AGENTS.md` holds the current block, `next dev` stops writing to `CLAUDE.md` (verified with `hasCurrentAgentRules`). Leave both files alone.
2. `url` and `pgn` NOT NULL is right. Variants and custom starts are skipped by the importers (T002), so every stored game has both.
3. The unique index is fine. 4. WAL + foreign_keys is fine. 5. A promotion picker comes later. 6. The nullable fields are fine.
- Snake_case columns, `scripts/migrate.mjs`, `vitest.config.mts`, and the `@types/node` bump are all accepted.

## Notes
- The fixtures are real games of the owner with opponents pseudonymized. Don't add any real usernames other than `poip0i333` to tests.
- In the real data, "abandoned" is a very common Chess.com result code (the user disconnected or left). It maps to `loss`, and `termination` keeps the raw code, so the coach can see it later.
