# T008a: Count deviations on the shared root moves (Sicilian, Caro-Kann, 3.Bc4…)

**Owner:** DeepSeek · **Depends on:** T008 · **Size:** small

## Why
T008 follows the spec exactly, but the spec had a gap (Claude's mistake, and your question 2). A deviation that happens before a tree's root path ends has `repertoireId = null`, so it's left out of both deviation tables and gets no banner. On real data these are the **biggest** findings:
- as White: 1...c5 (236 games), 1...c6 (176), 1...e6 (171), 2...d6 (153), and the owner's own 3.Bc4 instead of the Ponziani's 3.c3 (128) and 2.Qh5 (124);
- as Black: 1.d4 d5-type starts, and 1.c4 / 1.Nf3 / 1.e3.

Those games are exactly the prep to-do list, and today they're buried in "Never in book" grouped by their first 2 moves.

## Scope: do
1. **`topDeviations` counts every `user-left` / `opponent-left` match**, including `repertoireId = null` and `leftPly = 1`:
   - The position is `positions[leftPly − 2]`, or the start position when `leftPly = 1`, and the group key is that position + move.
   - The row's `line` is the canonical node's path, or `[]` for the start position, so the table shows "(start) 1.c4".
   - `repertoireId` on the row is the canonical node's repertoire, or `null` for the start position.
2. **Explore links** go to `/repertoire/{slug of the canonical node's repertoire}?path={canonical node path}`, i.e. the root-prefix nodes T008 already imports. There's no link for start-position rows.
3. **Game banner** also shows for root-path deviations, without the repertoire name: "**Your opponent left your book** at 1...c5: no prepared answer here." / "**You left your book** at 3.Bc4 (book: 3.c3)", plus judgement and drop when analyzed. The Explore link follows rule 2.
4. **Remove the "Never in book" first-moves tables.** Replace them with one line under the cards: "Games that left your book on the shared first moves: White 1,714 · Black 540", using the same rule as today (`repertoireId = null`).
5. Raise the deviation tables from top 8 to **top 10**.
6. **"Stray" wording (owner's choice, 2026-09-30).** The book is the owner's chosen repertoire, and leaving it is a *stray* to fix, not a style choice. Rename user deviations everywhere:
   - The table title becomes **"Where you stray from your book"**. Rename the column to "You played" vs "Book".
   - The banner becomes "**You strayed from your book** at 3.Bc4 (book: 3.c3)" (+ judgement/drop when analyzed).
   - Card split: "followed to the end 31% · strayed 22% · opponent left 47%".
   Opponent deviations keep their wording.

## Scope: do not
- No changes to the matcher (`matchGame`/`buildBookIndex`), the cache, or the schema.

## Tests
- The page/banner copy uses "strayed" for user deviations (a render or string test is enough).
- `topDeviations`: a root-path deviation (e.g. 1.e4 c5 against a White book whose trees start after 1.e4 e5) is counted with its line; a `leftPly = 1` deviation is counted with an empty line and `repertoireId` null.

## Acceptance criteria
1. lint / typecheck / test / build → exit 0.
2. `/repertoire` → 200. **Real-data section:** both tables as rendered (top 10), and the banners of game 1540 (1...c5) plus one 3.Bc4 game (give its id).

## Report
`handoffs/reports/T008a-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
