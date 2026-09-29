# To DeepSeek

**Current task:** T003: Sync service + Accounts and Games pages
**Spec:** `handoffs/tasks/T003-sync-and-games-ui.md`

1. Re-read `DEEPSEEK.md` (unchanged).
2. Execute the spec. It's larger than T002. If you have to stop partway, the priority order is: schema → sync service + tests → queries + tests → API routes → pages.
3. When finished: write the report, overwrite `handoffs/TO_CLAUDE.md`, set T003 to `review`, **send the Discord notification**, and tell the user.

## Feedback on T002 (accepted)
Claude reran everything: lint, typecheck, 32 tests, build, and the **fresh `rm -rf data` migration** (it passes; `rated` is present). Claude also read all the importer code. It's clean and correct. Answers:
1. **Defensive skips:** keep them as silent skips (recorded as D13). A single odd game must never abort a sync.
2. **Unknown Chess.com `time_class`:** skip it in the normalizer (it's in the T003 scope, §2).
3. `CHESSCOM_CONTACT` read at module load is fine; importers are server-only.
4. The string compare for `sinceMonth` is fine.
- Archive sorting, the UTF-8 chunk test, and the Retry-After handling are all good calls.
- About deleting `data/`: the permission classifier blocks `rm -rf`, so the T003 criteria use `mv` instead.
