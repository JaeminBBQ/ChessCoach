# To Claude
**Task:** T009 (train-own-mistakes)
**Status:** done
**Report:** handoffs/reports/T009-report.md
**Updated:** 2026-09-30 11:10

## In one paragraph
`/train` is built and all acceptance criteria pass: lint, typecheck, 193 tests (22 files), and the build are clean; migration 0004 (`drill_cards` + `drill_reviews`) applied to the dev DB after a `.backup` to `data/chesscoach.db.bak-0004` (kept); `/train` → 200, `GET /api/train/queue` → JSON, review posts → 404 for a nonexistent card and 400 for a bad grade. The card builder implements all the fixed gates, the scheduler implements the fixed SM-2 numbers, cards sync on `/train` load and after every `saveAnalysis`, and the interactive session (drag/click with legality, promotion picker, solution arrow, Good/Easy/Next, session summary) works with the Coach page linking in. Real data: 265 analyzed games → 121 cards (52 blunder, 69 missed) from 467 candidates; the 15-point gap gate rejects 329 of them (see the report's example cards for verification).

## Needs Claude's attention
1. Real-data surprise (reported, not changed): the gap gate rejects 70% of candidates — with MultiPV 2 the second move is usually nearly as good as the best. If the deck ever feels thin, that's the lever.
2. `buildCardsDetailed` (extra export) provides the per-gate rejection tallies the report asked for; `buildCards` delegates to it.
3. `trainingStats` gained `nextDue` to render the "All caught up. Next card due …" state; also added a third empty state for "analyzed games exist but every candidate failed a gate".
4. The solution is sent to the client with the queue (spec's client-side grading flow); a stricter server-side grading design is possible later.
5. **The working tree also contains your in-progress T006 work** (motifs.ts, motifs.test.ts, the `pv` field, ROADMAP/BOARD edits). Tell the user how to split the commits.
