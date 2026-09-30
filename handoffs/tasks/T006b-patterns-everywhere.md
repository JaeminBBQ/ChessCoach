# T006b: Mistake patterns on Coach, Train, Plan, and the review page

**Owner:** DeepSeek (Claude built the pattern detector in T006) · **Depends on:** T012 · **Size:** medium

## Goal
Claude's `src/lib/analysis/motifs.ts` names the tactical pattern behind each user mistake and missed chance. On the owner's 265 analyzed games:
- **Mistakes (290):** left a piece hanging 31% (**14.6 pts/100 games, the #1 pattern**), other/positional 38%, lost material to a combination 13%, walked into a fork 7%, allowed a mate 6%, king attack 5%.
- **Missed chances (165):** a combination 18%, a free piece 13%, a fork 8%, a king attack 7%, a mate 4%, other 50%.

The owner asked for puzzles *by name, with links*, and for the coach to steer training at the most common mistakes. Put the patterns everywhere they help: the Coach breakdown with Lichess theme links, Train sessions filtered by pattern, the Plan's focus metric, and labels on the review page.

## Read first
- `DEEPSEEK.md`
- `src/lib/analysis/motifs.ts` + `motifs.test.ts` (the API: `mistakeMotif(a, i)`, `missedMotif(a, i)`, `MOTIF_LABEL`, `lichessTheme(Url)`). Mistakes use the reply at `plies[i]`; missed chances use the user's best move at `plies[i-1]`. Don't change this module; propose changes in the report.
- `src/lib/analysis/coach.ts`, `src/lib/training/cards.ts`, `src/lib/server/training.ts`, your T012 plan code.

## Scope: do
1. **Cards remember their pattern.** Migration: add `drill_cards.motif` (text, nullable). `buildCards` sets it: `missed` cards use `missedMotif`, and `blunder` cards use `mistakeMotif`. Backfill existing cards with a null motif (compute from the stored analysis) in `syncDrillCards`, once per card.
2. **Coach: "Your mistake patterns" section**, placed above the findings. It's a table over all analyzed user mistakes (excluding missed chances) in the current filter: pattern label, count, share %, and pts/100 games (the sum of drops / 100 / analyzed games × 100). Then two links per row: **"Lichess puzzles ↗"** (`lichessThemeUrl`; hide it for `other`) and **"Your positions (N) →"** (`/train?motif=<motif>`, where N is the number of drill cards with that motif; hide the link when N = 0). There's a second, smaller table for missed-chance patterns with the same columns. Add one computed takeaway sentence, e.g. "Your most expensive pattern is *Left a piece hanging*: 90 mistakes, 14.6 points per 100 games."
3. **Coach findings:** in `mistakes-*` and `missed-chances` findings, add an evidence bullet with the top 2 patterns inside that finding ("Mostly: left a piece hanging (41%), lost material to a combination (15%)").
4. **Train filter:** `/train?motif=X` limits the session queue to cards with that motif (same due/new rules, and the new-per-day cap still applies). The header shows "Practicing: Left a piece hanging · clear". Each card shows a small pattern label after the answer ("Pattern: fork").
5. **Plan:** when the week's focus is a `mistakes-*` or `missed-chances` finding, show a second focus metric for the **top pattern within it**, per analyzed game (baseline vs this week, same gates as the main metric). Add a **"Hanging pieces/game"** column to the 8-week scorecard. Add a plan task via the T012 registry: `Do 15 {Lichess theme name} puzzles on Lichess`, where the theme is the top pattern's (link: the theme URL). It **can't be auto-tracked**, so it's the only task with a manual "Done" toggle, stored per week.
6. **Review page:** key moments and the current-move panel show the pattern label for user mistakes and missed chances, e.g. "Blunder · Left a piece hanging".

## Tests
- `cards.test.ts`: the motif is set for both kinds (reuse the hand-built analyses and add a `pv` where needed).
- Coach: the pattern table math (counts, shares, pts/100) on synthetic games; links are hidden for `other` and for N = 0.
- Train: the queue filter by motif and backfill idempotence.
- Plan: top-pattern metric selection; the manual task toggles per week.

## Scope: do not
- No changes to `motifs.ts`, the classification formulas, or the card gates. No new dependencies.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0.
2. The migration applies to the dev DB (`.backup` first); after `/train` loads once, `select motif, count(*) from drill_cards group by motif` shows no nulls.
3. `/coach`, `/train?motif=hangingPiece`, `/plan`, and `/games/<analyzed id>` → 200.
4. **Real-data section:** the pattern tables as rendered for the owner (defaults and `range=all`), and the drill card counts per motif.

## Report
`handoffs/reports/T006b-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
