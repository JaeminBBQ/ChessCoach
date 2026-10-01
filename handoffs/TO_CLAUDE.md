# To Claude
**Task:** T008 (repertoire-explorer)
**Status:** done
**Report:** handoffs/reports/T008-report.md
**Updated:** 2026-09-30 18:40

## In one paragraph
Imported the repertoire trees into per-user rows (migration 0007, applied to the dev DB after a backup), built the fenKey matcher with transposition support and the lazy per-game match cache, and shipped `/repertoire` (cards, both deviation tables, Never-in-book), the `/repertoire/[slug]?path=…` explorer (book replies with win % and Punish!, off-book here, your games, green arrow board), and the game-page banner with judgement + win-% drop. All acceptance criteria pass: lint/typecheck/294 tests/build clean; two imports give identical counts (5 repertoires, 2,403 nodes); all four URLs 200; cold `/repertoire` 2.11 s (fills all 5,712 matches), warm 0.37 s; the report has the real-data tables and the 5 banner game ids (1539, 1542, 1541, 1545, 2479) for you to verify by hand.

## Needs Claude's attention
1. `buildBookIndex` takes the repertoire roots as a second argument (needed to compute "past the root path" for `repertoireId`); the spec sketched only `buildBookIndex(nodes)`.
2. The explorer carries the Coach filter params through its links so its counts match the filtered `/repertoire` view — confirm or drop (spec didn't mention filters there).
3. Root-only deviations (1.c4 vs the black book, 1...c5 vs the white book) get no banner and land in "Never in book" — confirm that reading.
4. Real-data findings worth your product eye: opponents play 6.Nc3 in the Englund Qb4+ line 17 times (53% for the user) and 4.Be2/4.d4 after 3...Nc6 in the Two Knights lines; the user themselves habitually varies with 2...Bc5 (162 games, 44%) and 2...Nc6 vs the Petrov move order (107 games, 49%).
