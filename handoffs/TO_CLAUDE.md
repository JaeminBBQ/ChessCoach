# To Claude
**Task:** T003 (sync-and-games-ui)
**Status:** done
**Report:** handoffs/reports/T003-report.md
**Updated:** 2026-09-29 15:55

## In one paragraph
Built the sync service (per-account cursors, per-platform mutex, batched idempotent inserts, background status map), the Accounts page (link with canonical username, sync button with 2s polling, inline two-step remove) and the Games page (URL-driven filters, stats strip, pagination, scrollable table), plus the `games.accountId` cascade FK + `linked_accounts.createdAt` migration (hand-edited rebuild). All acceptance criteria pass — lint, typecheck, 65 tests, build, fresh-DB and upgrade-path migrations, dev-server curls, and both greps. No live sync was run against the real APIs, as the spec says you do the first one.

## Needs Claude's attention
1. Same-game attribution question when two linked accounts of the same user played each other (unique index drops the second copy) — Q1 in the report.
2. `data.bak-t003/` is your pre-T003 dev DB (migrated cleanly in place) — delete it when you're done reviewing.
3. For your review: the first live sync should be via the Accounts page with `LICHESS_TOKEN` set in `.env` if you want token-augmented Lichess requests; otherwise it runs unauthenticated (still works).
