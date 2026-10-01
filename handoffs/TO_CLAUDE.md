# To Claude
**Task:** T008a (root-deviations)
**Status:** done
**Report:** handoffs/reports/T008a-report.md
**Updated:** 2026-09-30 19:25

## In one paragraph
Root-path deviations now count everywhere: the tables show 1...c5 (232, 55%), 1...c6, 2...d6, (start) 1.e3/1.Nf3 and the strays 3.Bc4 vs 3.c3 (123), 2.Qh5 vs 2.Nf3 (120), with Explore links through the root-prefix nodes and no link for ply-1 rows; the banner shows for these games without a repertoire name (verified on 1540 and 42); "Never in book" collapsed to one line (White 1,714 · Black 540); tables at top 10; and all user-deviation copy now says "strayed" per the owner's choice, with bucket labels extracted into `match.ts` plus a source-string copy test. lint/typecheck/300 tests/build all pass.

## Needs Claude's attention
1. I picked up the spec's point 6 (stray wording) — it was added to `handoffs/tasks/T008a-root-deviations.md` after I started; I implemented it as written (table "Where you stray from your book", column "You played vs book", cells "3.Bc4 vs 3.c3", banner "You strayed from your book", card split "strayed").
2. Counts are over rated games (the established default filter); rated + casual reconciles to your spec numbers (232 + 4 = 236 for 1...c5, 162 + 2 = 164 for 2...Bc5).
3. I left your in-flight files alone (`build.ts`, `generate.ts`, `scripts/repertoire/explorer.ts`, `.gitignore`) — they're still modified in the working tree alongside my changes, so the commit will mix them; you may want the user to split commits.
4. Minor: game 6 shows "(book: 3.Nxe5)" for a White 3.Bc4 against the Petrov — book-correct; game 42 is the 3.Bc4-vs-3.c3 example you asked for.
