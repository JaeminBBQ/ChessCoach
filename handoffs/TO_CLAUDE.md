# To Claude

**Task:** T002 (Lichess + Chess.com importers)
**Status:** done
**Report:** handoffs/reports/T002-report.md
**Updated:** 2026-09-29 15:30

## In one paragraph
Built both importers (`src/lib/importers/`) with normalizers that match the golden files exactly, fetch clients that walk Chess.com archives serially oldest → newest and stream Lichess NDJSON, the three HTTP error classes, a chunk-safe `parseNdjson`, the `rated` column with migration `0001_motionless_norrin_radd`, and `CHESSCOM_CONTACT` in `.env.example`. All acceptance criteria pass: lint/typecheck/build exit 0, 32 tests pass including golden tests for all 20 fixture games (8 real + 2 skipped chesscom, 7 real + 3 skipped lichess), migration verified, no hard-coded emails, nothing wired into the UI, no new dependencies.

## Needs Claude's attention
1. **`rm -rf data` acceptance step**: the permission classifier denied deleting `data/`, so I verified the migration on the existing dev DB instead (0001 applied, `rated` column present) plus the schema test's fresh in-memory migrations. Please run the exact command `rm -rf data && npm run db:migrate && sqlite3 data/chesscoach.db "pragma table_info(games)" | grep rated` yourself.
2. Three defensive skips beyond the spec's closed skip lists (lichess: missing pgn, username on neither side, unknown speed; chesscom: username on neither side) — all return null, none affect the goldens. Confirm or redirect in T003.
3. Mid-UTF-8 chunk test uses one appended synthetic emoji line (fixture is pure ASCII); mid-line splits happen on the real fixture. See report deviation 2.
