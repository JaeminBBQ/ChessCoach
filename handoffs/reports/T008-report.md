# T008 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Imported Claude's repertoire trees into per-user DB rows (migration 0007: `repertoires`, `repertoire_nodes`, `game_repertoire`), built a pure fenKey-based matcher that finds where each game left the book (with transposition support), a lazy per-game match cache, a `/repertoire` page with per-repertoire cards, the two deviation tables and the "Never in book" counts, a click-through explorer at `/repertoire/[slug]?path=…` with evals, Punish! badges and live game stats, and the one-line book banner on every game page. All acceptance criteria pass.

## Files changed
- `src/lib/db/schema.ts`, `drizzle/0007_medical_dreadnoughts.sql` (+meta snapshot): the three new tables with the exact constraints from the spec (unique(userId, slug), unique(repertoireId, path), index(userId, fenKey), gameId PK cascade, repertoireId set-null).
- `src/lib/repertoire/match.ts` (+test): pure matcher — `buildBookIndex`, `matchGame`, `bookStats`, `topDeviations`, `formatLine`, `moveNo`, `nodeWin`, `fenKey`.
- `src/lib/server/repertoire.ts` (+test): `importRepertoireSet`, `ensureGameRepertoire`, `ensureGameMatch`, `getNodePath`, list/get/load helpers.
- `scripts/repertoire/import.run.ts` + `package.json`: `npm run repertoire:import`; `content:repertoire` now filters on `shard` so generation and import never run each other.
- `src/app/repertoire/page.tsx`: cards, deviation tables, never-in-book, Coach-style filters (default range/speed `all`).
- `src/app/repertoire/[slug]/page.tsx` + `src/components/repertoire/explorer-board.tsx`: the explorer (breadcrumb with greyed root moves, book replies with win % + Punish!, off-book here, your games, green arrow board).
- `src/app/games/[id]/page.tsx`: the book banner (one line above the board, ply links and Explore →, judgement + win-% drop when analyzed).
- `src/app/layout.tsx`: Repertoire nav link after Train.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | `npm run lint`, `npm run typecheck` clean; `npm test`: 31 files, 294 tests; `npm run build` compiled, routes `/repertoire` + `/repertoire/[slug]` present |
| Migration 0007 on dev DB, import twice → identical counts | pass | Backed up `data/chesscoach.db` → `chesscoach.db.bak-0007`, then `npm run db:migrate`. Two `npm run repertoire:import` runs: **5 repertoires, 2,403 nodes both times** (Englund 340, black-vs-e4 1,096, Ponziani 465, vs-Petrov 215, vs-Scandinavian 287 — tree nodes + root-prefix nodes) |
| The four URLs return 200 | pass | `/repertoire`, `/repertoire/black-vs-e4`, `/repertoire/black-vs-e4?path=e4%20e5%20Nf3%20Nf6%20Bc4%20Nc6%20Ng5%20Bc5`, `/games/1` all 200 (dev server). Invalid `?path=` falls back to the tree root (200); unknown slug 404 |
| Cold / warm `/repertoire` times | pass | **Cold 2.11 s** (fills the cache for the 5,623 rated games; the casual view adds 0.11 s for the last 89 → ~2.2 s over all 5,712). **Warm 0.37 s.** All 5,712 cache rows pass invariant checks (deviation ply = positions length + 1; leftSan = the game's actual move; non-null repertoireId ⟹ past that tree's root) |
| Repertoire cards | pass | Englund 604 games · 50% (followed 5 / you left 66 / opponent left 29) · black-vs-e4 1,680 · 49% (3/61/36) · Ponziani 624 · 50% (6/59/35) · vs-Petrov 125 · 52% (2/66/33) · vs-Scandinavian 336 · 57% (1/49/50) |
| Both deviation tables | pass | Opponent top rows: Englund Qb4+ line then **6.Nc3 — 17 games, 53%** (verified in SQL); 3.d3 Nc6 4.Be2 13 games 38%; 3.Bc4 Nc6 4.d4 11 games 36%; Englund 4.e3 9 games 44%; Scandinavian Qa5 4...c5 9 games 61%; Qe6+ 4...Nf6 9 games 56%; 2.Bc4 Nf6 3.d4 9 games 44%; Ponziani 5...dxc3 9 games 56%. User top rows: Englund 2...Bc5 (book 2...Nc6) **162 games, 44%**; 2...Nc6 (book 2...Nf6) 107 games 49%; 3.Nc3 3...Bc5 (book 3...Nc6) 53 games 51%; 5.cxd4 (book 5.e5) 52 games 48%; 4...Bc5 (book 4...Bd6) 50 games 46%; 3...Bc5 (book 3...Nc6, 3...Nxe4) 42 games 48%; 5.d5 (book 5.Bd3) 36 games 42%; 5.e5 (book 5.d3) 36 games 42% |
| Never in book | pass | White: **1,714 games** — starts 1.e4 e5 (678), 1.e4 c5 (232), 1.e4 c6 (176), 1.e4 e6 (170), 1.e4 d6 (121). Black: **540 games** — 1.d4 d5 (98), 1.e3 e5 (67), 1.c4 e5 (49), 1.e4 d5 (40), 1.g3 e5 (34) |
| Five banners | pass | user-left: **1539** "You left your book at 6.cxd4 (book: 6.Qe2) — White: Ponziani · best" and **1542** "at 6.Nc3 (book: 6.d3) — White: against the Petrov and the Stafford · good". opponent-left: **1541** "Your opponent left your book at 5.Re1: no prepared answer here. Explore →" and **1545** "at 3.d4". book-end: **2479** "Followed your book to the end (move 10)." All analyzed; judgements show. Game 1539 hand-verified: the game plays 11.cxd4, the tree has only Qe2 there. Unanalyzed deviations show no judgement; root-only games (e.g. 1540, 1...c5) correctly get no banner |

## Deviations from the spec
1. `buildBookIndex(nodes, repertoires)` takes the repertoire roots as a second argument: "past the root path" for `repertoireId` can't be derived from nodes alone (root-prefix and terminal body nodes both have eval null).
2. The explorer accepts the same filter params (account/speed/rated/range, default range all) and carries them through every link, so its "games here" numbers match the filtered `/repertoire` view the user came from. The spec only required filters on `/repertoire`; easy to drop if unwanted.
3. `/repertoire` defaults speed to **all speeds** (Coach defaults to most-played) — openings need sample size; the spec only pinned the range default.
4. `bookStats` off-book moves include the follow-up move of book-end games ("by whom" in the spec); the explorer's "Off-book here" section shows opponent moves only, per its UI copy.
5. The card's "followed to the end" bucket includes `game-ended` matches (the game ended still inside the book — no third exit bucket in the spec's split).
6. The deviation table's "line" is the canonical node's book path, so transposed games group into one row; the move column numbers it from that line (`6.Nc3`).
7. Re-import does not remove repertoires whose tree files disappeared from the set dir (not asked for).
8. `formatLine` uses standard `1. e4 e5 2. Nf3 Nc6` notation.

## Dependencies added
None.

## Questions / proposals for Claude
1. Confirm explorer filter passthrough (deviation 2) — drop if you want the explorer unfiltered.
2. Root-only `user-left`/`opponent-left` games (e.g. 1.c4 vs the black book, 1...c5 vs the white book) get no banner and land in "Never in book". Is that the reading you want, or should they show a banner without an Explore link?
3. The Traxler position shows 4 off-book opponent moves (O-O 2 games 100%!, b4, d3, f3) — worth adding to the tree as branches next regeneration?
4. Real-data check: the user plays 2...Bc5 vs 1.d4 162 times (book says 2...Nc6) and 2...Nc6 vs 1.e4 e5 2.Nf3 107 times (book says 2...Nf6). Big habitual deviations the coach should surface.

## Known issues / follow-ups
None. The user should do the visual pass on the explorer board (green arrow, orientation) and the banner.
