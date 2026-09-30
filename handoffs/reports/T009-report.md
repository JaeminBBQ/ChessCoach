# T009 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built `/train`: puzzles cut from the owner's own analyzed games, scheduled with simplified SM-2. The pure card builder (`src/lib/training/cards.ts`) turns missed-chance and blunder plies into cards with the fixed fair-puzzle gates (ply > 6, non-terminal, MultiPV-2 both present, best ≥ second + 15 win %, solution floor 60/40 by kind, missed takes precedence). The pure scheduler (`src/lib/training/srs.ts`) implements again/good/easy with the fixed numbers and the queue rules (due first, ≤ 10 new/day, 20-card session). Migration 0004 adds `drill_cards` + `drill_reviews`; the server layer syncs cards (on `/train` load and after every `saveAnalysis`), serves the queue, records reviews, and computes header stats. The page runs an interactive session (drag/click moves, legality via chess.js, promotion picker, solution arrow after a wrong answer, Good/Easy/Next grading, "see it in the game" links, session summary), with the Coach page linking "Train these positions →" from the mistakes and missed-chances cards.

## Files changed
- `src/lib/training/cards.ts` (new): `buildCards(game, analysis)` + `buildCardsDetailed` (adds per-gate rejection tallies, used for the real-data report).
- `src/lib/training/cards.test.ts` (new): every gate on hand-built analyses (missing second, gap 14.9 vs 15, blunder floor 39.9 vs 40, missed floor 59.9 vs 60, ply 6 vs 7, terminal, missed-over-blunder precedence, Black-POV fields) + one real-engine Scholar's-mate case.
- `src/lib/training/srs.ts` (new): `applyReview` (1 → 3 → round(interval × ease) days; again = reset, ease −0.2 floored at 1.3, +10 min; easy = good × 1.3, ease +0.15) and `buildQueue` (due oldest-first, new newest-game-first, 10 − newToday cap, 20-card session cap).
- `src/lib/training/srs.test.ts` (new): the interval sequences, again/easy rules, queue ordering, both caps.
- `src/lib/db/schema.ts`: `drill_cards` (unique (gameId, ply), FK cascade on game) and `drill_reviews` (FK cascade on card); `cardKinds` and `grades` enums.
- `drizzle/0004_cynical_invisible_woman.sql` + meta (generated): the two tables.
- `src/lib/server/training.ts` (new): `syncDrillCards` (idempotent, left-join games-without-cards), `newCardsToday` (cards whose first review is since local midnight), `trainingQueue`, `reviewCard` (400 bad grade, 404 others' cards), `trainingStats` (+ `nextDue` for the "All caught up" state), `currentTimeMs` (purity-friendly clock for server components).
- `src/lib/server/training.test.ts` (new): sync idempotency + a third game appearing, cascade delete, cross-user invisibility/404, review writing history + the new schedule, queue order + new-today counting, stats.
- `src/lib/server/analyses.ts`: `saveAnalysis` now calls `syncDrillCards` (cards appear as the owner's batch analyzes).
- `src/app/api/train/queue/route.ts`, `src/app/api/train/cards/[id]/review/route.ts` (new): GET queue; POST review with 400/404 handling.
- `src/app/train/page.tsx` (new): stats header, sync on load, empty states (no analyses → /analyze; gates rejected everything; all caught up with the next due time).
- `src/components/training/trainer.tsx` (new, client): Start → queue fetch → one card at a time (board oriented to the FEN's side to move, opponent's last move highlighted, kind prompt, drag/click with chess.js legality, promotion picker, correct → Good/Easy, wrong → solution arrow + "Best was… In the game you played…" + Next, progress x/20, session summary).
- `src/app/coach/page.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`: "Train these positions →" under mistakes-*/missed-chances cards; Train nav after Coach; home Train link.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | `npm run lint` clean; `npm run typecheck` clean; `npm test` → **193 passed (22 files)**; `npm run build` clean with `/train`, `/api/train/queue`, `/api/train/cards/[id]/review` in the route map |
| `npm run db:migrate` applies 0004 cleanly (backup first) | pass | Backed up with `sqlite3 data/chesscoach.db ".backup data/chesscoach.db.bak-0004"` (21.7 MB, kept at `data/chesscoach.db.bak-0004`, never deleted — `.backup` instead of `cp` because the dev server holds the DB open under WAL and a raw copy could miss uncheckpointed frames). `npm run db:migrate` → "Migrations applied"; `drill_cards` + `drill_reviews` present |
| Dev server URLs | pass | `/train` → 200 (header: `0 due · 121 new · 0 learned · 0% right (7 days)`, Start button); `GET /api/train/queue` → JSON cards; `POST /api/train/cards/999999/review` → 404; `POST` with `grade: "bogus"` → 400 |
| Real-data section | pass | Below (265 analyzed games at run time) |

## Real-data section (265 analyzed games)

Card generation over all the owner's analyses (computed with `buildCardsDetailed`, then verified against the DB after `/train` synced — **121 cards: 52 blunder + 69 missed**, exactly matching):

**Gate tallies:** 467 candidates (missed or mistake/blunder plies) →
- skippedEarlyPly: 2
- skippedTerminal: 0
- skippedMissingEngine: 0
- **skippedGap: 329** (70% of candidates — the best move beats the second by less than 15 win %)
- **skippedSolutionFloor: 15**
- accepted: 121

The gap gate is doing most of the filtering — with MultiPV 2 the second-best move is usually nearly as good, so the "only-move-ish" bar is strict. Reported as data; gates unchanged per instructions.

**5 example cards** (gameId, ply, fen, solutionSan, solutionWin, playedSan, playedWin — all user POV):

| gameId | ply | kind | fen | solution | played |
|---|---|---|---|---|---|
| 2249 | 66 | missed | `8/p2R3p/6p1/4Qp2/3Pp1kP/4PqP1/P4P2/6K1 b - - 4 33` | Kh3 (100%) | Qd1+ (10.3%) |
| 2250 | 31 | missed | `r3kb1r/2p1nppp/3p4/p2P2B1/2bN4/8/P4PPP/RN2R1K1 w kq - 1 16` | Bxe7 (86.2%) | Nc6 (29.9%) |
| 2567 | 25 | missed | `rn1q2k1/pp1brppp/5n2/1NPp4/5Q2/5N2/PPP2PPP/2KR1B1R w - - 1 13` | Nc7 (80.8%) | c4 (43.1%) |
| 2568 | 28 | missed | `rnb2rk1/1pq2ppp/p7/3pn2Q/3N4/P1PBP1P1/1B3P1P/R4RK1 b - - 2 14` | Nxd3 (90.2%) | g6 (60.8%) |
| 2568 | 44 | blunder | `r1b2rk1/1p5p/p4ppQ/3p4/3N4/P1q1P1P1/2R2P1P/5RK1 b - - 1 22` | Qa5 (47.6%) | Qxa3 (22.8%) |

(2249/66 is the same position as T011's top missed-chance example `33...Qd1+??` — the Coach and Train data agree.)

## Deviations from the spec
1. **`buildCardsDetailed` extra export** — the report needs per-gate rejection counts, which `buildCards` doesn't surface; it returns the same cards plus a tally and `buildCards` delegates to it.
2. **`trainingStats` gained `nextDue`** — the "All caught up. Next card due {relative time}." empty state needs the earliest future due time; without it that sentence can't be rendered server-side.
3. **Third empty state** — when games are analyzed but every candidate fails a gate, the page says "No trainable positions yet — the fair-puzzle gates rejected every candidate." (spec only defined the no-analyses and nothing-due states).
4. **New-cards-today counting** — a card is "introduced today" when its *first* review row is since local midnight (`MIN(reviewed_at)` per card), which is robust across re-reviews and lapses.
5. **Dev DB backup** — used sqlite3 `.backup` instead of `cp` (atomic under WAL while the dev server holds the connection); backup kept at `data/chesscoach.db.bak-0004`.
6. **Queue response shape** — the route returns the card rows (including scheduling fields); the client needs `solutionUci` to grade answers per the spec's client-side flow.

## Dependencies added
None.

## Questions / proposals for Claude
1. The solution (uci/san/win) is sent to the client with the queue, so a determined user can read it before moving — this follows the spec's flow (client compares `uci === solution` and posts `correct`). If that's a concern later, the server could grade the attempt instead.
2. skippedGap = 329 of 467 candidates: the 15-point gap gate is very selective with MultiPV 2. Fine per the fixed rules, but if you ever want more cards, this is the lever.
3. T009 cards are built once per game; if an analysis is later re-run with a bigger node budget, existing cards keep the old positions (unique index skips them). Say the word if re-analysis should rebuild a game's cards.

## Known issues / follow-ups
- **The working tree also contains Claude's in-progress T006 work** (`src/lib/analysis/motifs.ts`, `motifs.test.ts`, the `pv` field in `game-analysis.ts`, plus edits to `docs/ROADMAP.md` and `handoffs/BOARD.md`). The user's commit command should keep T009 and T006 separate if desired — ask Claude about the intended commit split.
- The owner was batch-analyzing during the run; new analyses feed cards automatically via the `saveAnalysis` hook and the next `/train` load.
