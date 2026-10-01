# T008a Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Deviations on the shared root moves now count everywhere: `topDeviations` includes `repertoireId = null` and `leftPly = 1` matches (position = the root-path node, or the start position for ply 1), the deviation tables link them into the explorer via the root-prefix nodes T008 already imports, and the game banner shows them without a repertoire name. The "Never in book" first-move tables became one line, the tables grew to top 10, and all user-deviation copy now says "strayed" (owner's choice). No matcher, cache, or schema changes.

## Files changed
- `src/lib/repertoire/match.ts`: `topDeviations` counts every deviation (canonicalId/repertoireId nullable, `line` `[]` for the start position); added `matchBucket` + `BUCKET_LABELS` for the card split.
- `src/lib/repertoire/match.test.ts`: root-path + start-position deviation tests; `src/lib/repertoire/copy.test.ts`: bucket labels + a source-string test that the page/banner copy says "strayed" (the spec allowed a string test).
- `src/lib/server/repertoire.ts`: `getNodePath` → `getNodeLine` (node's book path + its repertoire slug, so banner Explore links work for root-path positions).
- `src/app/repertoire/page.tsx`: top 10 tables; "(start)" line for ply-1 rows (no Explore link); user table "Where you stray from your book" / "You played vs Book" / "3.Bc4 vs 3.c3"; card split "strayed"; one-line "Games that left your book on the shared first moves: White 1,714 · Black 540".
- `src/app/games/[id]/page.tsx`: banner for root-path deviations ("You strayed from your book at 3.Bc4 (book: 3.c3)", "Your opponent left your book at 1...c5: no prepared answer here."), Explore link via the deviation position's node, no link for ply-1 rows; book-end/game-ended still require a repertoire.

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | All clean; `npm test`: 32 files, **300 tests** (3 new); build compiled |
| `/repertoire` → 200, both tables top 10 | pass | 200 in 0.44 s. Opponent top 10: 1...c5 **232** (55%), 1...c6 176 (52%), 1...e6 170 (51%), 2...d6 152 (47%), 1...d6 121 (49%), (start) 1.e3 77, (start) 1.Nf3 67, 1...Nc6 57, 1...b6 55, 1...g6 55. Stray top 10: 2...Bc5 vs 2...Nc6 **162** (44%), 3.Bc4 vs 3.c3 123 (52%), 2.Qh5 vs 2.Nf3 120 (61%), 2...Nc6 vs 2...Nf6 107, 1...d5 vs 1...e5 98, 3...Bc5 vs 3...Nc6 53, 5.cxd4 vs 5.e5 52, 4...Bc5 vs 4...Bd6 50, 3...Bc5 vs 3...Nc6/3...Nxe4 42, 1...d5 vs 1...e5 40. Card split now "followed to the end 5% · strayed 66% · opponent left 29%" (Englund) |
| Banners: 1540 + one 3.Bc4 game | pass | **1540**: "Your opponent left your book at 1...c5: no prepared answer here. Explore →" (Explore → `/repertoire/white-ponziani?path=e4`). **42**: "You strayed from your book at 3.Bc4 (book: 3.c3). Explore →" (Explore → `/repertoire/white-ponziani?path=e4 e5 Nf3 Nc6`, where the explorer shows "Your move: c3"). A ply-1 row game (game 2, 1.a3) shows the banner without an Explore link |

## Notes
- The page's default filter is rated (Coach semantics, confirmed in T008), so the top counts are over rated games: 232 for 1...c5 etc. Adding the casual view reconciles to the spec's all-games numbers (232 + 4 casual = 236; 162 + 2 = 164, matching the 164 Claude traced for 2...Bc5).
- The white root position explorer (`?path=e4`) is now effectively the prep dashboard: book replies e5/d5 plus every off-book opponent move with the user's score (c5 232 · c6 176 · e6 170 · d6 121 · Nc6 57 · Nf6 42 at 69% · f5 5 at 80% …).
- I did not touch Claude's in-flight tree-regeneration files (`build.ts`, `generate.ts`, `explorer.ts`, `.gitignore`, the task file).

## Dependencies added
None.

## Questions / proposals for Claude
1. Game 6's banner shows "(book: 3.Nxe5)" for a White 3.Bc4 against the Petrov — correct per the book, but visually the Ponziani 3.c3 example (game 42) is the headline case. No action needed unless you want different wording when the book move is a capture.
2. "Never in book" line: colors with zero games still show (e.g. "White 0 · Black 12" in the casual view). Say the word if you'd rather hide zeros.
3. The stray table's caption is "Habits to drill away — the book move is shown for comparison." — easy to reword if you have a preferred line.

## Known issues / follow-ups
None.
