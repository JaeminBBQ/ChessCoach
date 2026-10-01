# T009b: Opening drills: play your book lines and traps from memory (SRS)

**Owner:** DeepSeek (Claude mined the traps in T007b) · **Depends on:** T007b, T008a · **Size:** large

## Goal
The owner's choice (2026-09-30): the book is the trap repertoire (Englund 2...Nc6 with the ...Qb4+ trap; the Ponziani 3.c3; Stafford and Traxler). Their habits are **strays** to drill away, not alternatives: 2...Bc5 in the Englund (164 games), 3.Bc4 instead of 3.c3 (123), 2.Qh5 (120). They want to *learn all the traps and play the line through instead of improvising early*.

So the drill unit is a **whole line played from move 1**. The app plays the opponent's moves, and the owner must find every one of their own book moves. Each line is scheduled with spaced repetition. Three kinds of line:
- **Trap**: an opponent mistake that club players really make, plus its refutation.
- **Stray fix**: a position where the owner habitually leaves the book.
- **Main line**: the most-reached lines of each tree.

## Read first
- `DEEPSEEK.md`, `docs/REPERTOIRE.md` ("Generated trees" + T007b notes), `docs/DECISIONS.md` D19–D21
- The tree JSON now has, on opponent nodes, **`trap?: true`** (a popular punishable move) and **`share?`** (the club explorer share). A trap's refutation continues 6 plies past it on a single line.
- `src/lib/server/repertoire.ts` (import, match cache), `src/lib/repertoire/match.ts` (`bookStats`, `topDeviations`)
- `src/lib/training/srs.ts` (`applyReview`, `buildQueue`), `src/lib/server/training.ts`, `src/components/training/trainer.tsx` (board input: drag + click, promotion)
- `src/lib/plan/tasks/*` (the T012 task registry)

## Definitions (use exactly these)
- **Line** = a SAN list from the start position, root path included, ending at a tree node. The user's moves are the plies of the user's color.
- **Trap line:** for each node with `trap: true`, the path to that node, then repeatedly its **first child in id order** until a leaf. `kind = 'trap'`, `trapPly` = the trap node's ply (its path length).
- **Stray line:** group the user's `user-left` matches (all games, all speeds, rated or not) by position + move, and keep groups with **n ≥ 5**.
  - The line is the path to the stray position (the canonical node; the start position for ply-1 strays), then the **book move** (the first of `bookSans` that is a user move in the book), then the child with the most games through it (`bookStats`; ties → lowest id). Stop after **4 more user moves** or at a leaf.
  - `kind = 'stray'`, `strayPly` = the book move's ply, `straySan` = the move the user played instead, `strayCount` = n.
- **Main line:** per repertoire, the leaves with the most games through them (`bookStats` n ≥ 5), top 8. `kind = 'main'`.
- **Dedup:** drop a line whose SAN list is a prefix of another card's line of the same user and color. Kind priority is trap > stray > main.
- **Grading:** 0 wrong attempts across the whole line → `good`; 1 or more → `again`. Use `applyReview` unchanged.

## Scope: do
1. **Schema + migration (0008)**
   - `repertoire_nodes`: add `trap` (bool, default false) and `share` (real, nullable). `importRepertoireSet` maps both.
   - `line_cards`: id, userId, repertoireId (cascade), color, kind (`trap`|`stray`|`main`), sans (JSON), endPath (the last tree node's path), trapPly, strayPly, straySan, strayCount (nullable), the SRS fields as in `drill_cards` (ease, intervalDays, reps, lapses, due, lastReviewedAt), createdAt. `unique(userId, kind, endPath)`.
   - `line_reviews`: id, userId, cardId (cascade), mistakes (int), grade, reviewedAt.
2. **`syncLineCards(db, userId)`**: computes the wanted cards from the current nodes + match cache (fill it first with `ensureGameRepertoire`).
   - Inserts missing cards. Refreshes `strayCount` on existing stray cards.
   - Deletes cards whose `endPath` is no longer a node. Losing their SRS state is fine.
   - Idempotent, using `onConflictDoNothing` like T009. It runs on Train page load in openings mode, and after `importRepertoireSet`.
3. **Queue:** reuse `buildQueue`, but with its own new-per-day cap of **5 lines** and the session cap of 10. Order new cards **trap → stray (by strayCount desc) → main**, instead of "newest game first".
4. **`/train?mode=openings`**: a "Positions | Openings" switch at the top of `/train`. Positions mode is today's trainer, unchanged.
   - Card header by kind:
     - "Trap line · Black: Englund Gambit"
     - "Fix a stray · you played **3.Bc4** here 123 times (book: 3.c3)"
     - "Main line · White: Ponziani"
   - The board is oriented to the user's color. Opponent moves auto-play with a ~400 ms delay, and the user plays their own moves by drag or click (reuse the trainer's input and promotion code).
   - **Wrong move:** the piece snaps back with a red flash, and a green arrow shows the book move. The user must then play it to continue. Count the mistake.
   - **When the opponent plays the trap move** (the ply = `trapPly`), show a badge: "**Trap!** Punish it." When the line reaches `strayPly`, show "This is where you usually play {straySan}."
   - **End of line:** "Clean!" or "N mistakes", the user's win % at the end (from the end node's eval), "Explore this line →" (to the explorer at `endPath`), and Next. Grading is automatic (no again/good/easy buttons).
   - Header stats: "Openings: X lines learned (last review good) · Y due".
5. **Plan task (registry): "Drill {n} opening lines"**, auto-tracked from `line_reviews` in the week. Add the setting `openingLinesPerWeek` to `user_settings` (default 20, editable in Adjust plan). Link it to `/train?mode=openings`.
6. **The stray metric, so we can measure:** `/repertoire` cards get "Strayed in the last 30 days: N of M games" next to the all-time split.

## Scope: do not
- No engine runs, no tree edits, no changes to the matcher or `content/**`. No new dependencies.
- Positions mode (T009) is unchanged apart from the mode switch.

## Tests
- Line building: a trap line follows first children to a leaf; a stray line takes the book move and stops after 4 user moves; main lines are top 8 by n; prefix dedup respects kind priority.
- `syncLineCards`: idempotent; refreshes the stray count; deletes cards whose `endPath` vanished.
- Queue: the new cap of 5 per day and the trap → stray → main order.
- Grading: 0 mistakes → good, ≥ 1 → again. `line_reviews` is written.
- Plan task: counts this week's line reviews against the setting.

## Acceptance criteria
1. lint / typecheck / test / build → exit 0.
2. Migration 0008 applied (`.backup` first), `npm run repertoire:import` rerun, `/train?mode=openings` → 200.
3. **Real-data section:**
   - Card counts by kind and repertoire.
   - The first 10 cards of the owner's first session (kind, header, full SAN line).
   - All Englund trap lines as SAN.
   - The stray cards with their counts.

## Report
`handoffs/reports/T009b-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
