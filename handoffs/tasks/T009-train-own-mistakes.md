# T009: Train: puzzles from your own games (spaced repetition)

**Owner:** DeepSeek (Claude wrote the card rules and scheduling) · **Depends on:** T011 · **Size:** large

## Goal
The Coach page (T011) shows the owner's two biggest costs: **middlegame mistakes (59% leave something hanging)** and **missed chances** (an opponent blunder goes unpunished). Train both with puzzles cut from the owner's **own** analyzed games, scheduled with spaced repetition so they come back until they're learned. Repertoire drills come later (T009b); this task covers own-game positions only.

## Read first
- `DEEPSEEK.md`, `CLAUDE.md` hard rules (engine truth: solutions come only from stored analyses)
- `src/lib/analysis/classify.ts`, `src/lib/analysis/coach.ts` (the missed-chance rule), `src/lib/analysis/game-analysis.ts` (`best` / `second` per position; MultiPV 2)
- `src/components/analysis/game-review.tsx` (board usage and react-chessboard v5 options)

## Card rules: `src/lib/training/cards.ts` (pure)
A card is a position where **the user is to move**, taken from `plies[i-1]` for a user move `i`, plus the engine's answer.
- **Kinds:**
  - `missed`: a user ply matching the T011 missed-chance rule (the opponent's previous move dropped ≥ 20, and the user's reply wasn't best and dropped ≥ 10). Prompt: "Your opponent just made a mistake. Find the move that punishes it."
  - `blunder`: a user move judged `mistake` or `blunder` that isn't already a `missed` card. Prompt: "Find a better move than the one you played."
- **Fair-puzzle gates** (all must hold, or no card is made):
  - `plies[i-1].best` and `plies[i-1].second` both exist (MultiPV 2 found two moves)
  - **Only-move-ish:** the user's win % after `best` minus after `second` is ≥ 15. Without a clear best move, it's not a fair puzzle.
  - `blunder` cards: the user's win % after `best` is ≥ 40 (don't train "find the least-bad move in a lost position").
  - `missed` cards: the user's win % after `best` is ≥ 60 (there really was something to punish).
  - The position isn't terminal, and `i > 6` (skip the first 3 moves, which are opening noise).
- **Card fields:** `gameId, ply` (the user's move index `i`; the position is `plies[i-1].fen`), `kind, fen, solutionUci, solutionSan, solutionWin` (user POV), `playedSan, playedWin` (the user's actual move and the win % after it), and `lastMoveUci` (the opponent's move that led to the position, for highlighting).
- **Accepted answers:** only `solutionUci`. The gate guarantees the second-best move is clearly worse.
- `buildCards(game: { id; userColor }, analysis): CardDraft[]`.

## Scheduling: `src/lib/training/srs.ts` (pure)
Simplified SM-2 with three grades.
- The state is `{ ease = 2.5, intervalDays = 0, reps = 0, lapses = 0, due }`.
- **`again`** (wrong answer): `reps = 0`, `lapses += 1`, `ease = max(1.3, ease − 0.2)`, `intervalDays = 0`, and `due = now + 10 minutes`.
- **`good`** (right answer): `intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : round(intervalDays × ease)`, `reps += 1`, and `due = now + intervalDays days`.
- **`easy`** (right, and the user taps Easy): like `good`, but the interval is multiplied by 1.3 and `ease += 0.15`.
- **Queue:** due cards (due ≤ now), oldest due first, plus **new** cards (never reviewed) up to **10 new per day** (counted from reviews since local midnight, passed in as a parameter), newest game first. The session cap is 20 cards.

## Schema (migration `0004_*`)
`drill_cards`: `id`, `userId` (FK users), `gameId` (FK games, cascade), `ply`, `kind`, `fen`, `solutionUci`, `solutionSan`, `solutionWin` (real), `playedSan`, `playedWin` (real), `lastMoveUci` (nullable), `ease` (real), `intervalDays` (real), `reps`, `lapses`, `due` (ms), `lastReviewedAt` (nullable ms), `createdAt`. Add a unique index on `(gameId, ply)`.
`drill_reviews`: `id`, `userId`, `cardId` (FK cascade), `grade`, `correct` (bool), `reviewedAt`. This is history, kept for the future progress chart.

## Server: `src/lib/server/training.ts`
- `syncDrillCards(db, userId)`: builds cards for every analyzed game of the user that has none yet (idempotent via the unique index; new cards get `due = createdAt`). Call it when `/train` loads and after `saveAnalysis` succeeds.
- `trainingQueue(db, userId, now, newToday)`, `reviewCard(db, userId, cardId, grade, correct, now)`, and `trainingStats(db, userId, now)` → `{ due, new, learned (reps ≥ 2), total, reviewedToday, accuracy7d }`. All scoped by `userId`.
- API routes: `GET /api/train/queue` → the cards; `POST /api/train/cards/[id]/review` with `{ grade, correct }` → 404 for others' cards and 400 for a bad grade.

## Page: `/train`
- Nav: **Train** after Coach. The home page gets a Train link.
- **Header stats:** `{due} due · {new} new · {learned} learned · {accuracy7d}% right (7 days)`.
- **Session:** a Start button loads the queue, then one card at a time:
  - The board shows the card's FEN, oriented to the user's color, with the opponent's last move highlighted and the kind's prompt above it. For `blunder` cards, don't reveal the played move until after the attempt.
  - The user moves by drag or click; only legal moves are allowed (`tryMove`).
  - **Correct** (uci = solution): a green message, "Correct: {solutionSan} (win chance {solutionWin}%)". Then show `Good` (default) and `Easy` buttons.
  - **Wrong:** a red message, then show the solution as an arrow and the text "Best was {solutionSan} ({solutionWin}%). In the game you played {playedSan} ({playedWin}%)." There's one `Next` button (grade `again`).
  - Every card has a "See it in the game ↗" link (`/games/{gameId}?ply={ply-1}`).
  - Progress is `3 / 20`. At the end: "Session done: 14 of 20 right." plus a link back to Coach.
- **Empty states:** no analyzed games → link to `/analyze`; nothing due → "All caught up. Next card due {relative time}."
- On the Coach page, add a line under the `mistakes-*` and `missed-chances` cards: "Train these positions →" linking to `/train`.
- Works at 375px (the board fills the width).

## Tests
- `cards.test.ts`: each gate on hand-built analyses (missing second, gap 14.9 vs 15, blunder floor 39.9 vs 40, missed floor 59.9 vs 60, ply ≤ 6 skipped, terminal skipped), `missed` taking precedence over `blunder` for the same ply, and Black-POV conversion. Plus **one real-engine case**: reuse `createNodeEngine`, analyze the Scholar's-mate PGN, and check that Black's `3...Nf6??` produces a `blunder` card only if the gates hold (assert whatever the gates imply, and explain it in a comment).
- `srs.test.ts`: the interval sequence good→good→good = 1, 3, round(3 × 2.5) = 8 days; `again` resets and lowers ease with a 1.3 floor; `easy` multiplies by 1.3 and raises ease; queue ordering, the new-per-day cap, and the session cap.
- `training.test.ts` (server): sync is idempotent, cascade deletes with the game, other users' cards are invisible and give 404, and review writes history + a new schedule.

## Scope: do not
- No repertoire drills, no LLM text, no new dependencies, no changes to the analysis/classification formulas.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0. Report the test count.
2. `npm run db:migrate` on the dev DB applies `0004` cleanly (**back up `data/chesscoach.db` with `cp` first**, and never delete it).
3. Dev server (reuse a running one): `/train` → 200; `GET /api/train/queue` → JSON; posting a review for a nonexistent card → 404.
4. **Real-data section in the report:** the number of cards generated from the owner's analyzed games, by kind; the gate rejection counts (how many candidates each gate removed); and 5 example cards (gameId, ply, fen, solutionSan, solutionWin, playedSan, playedWin). Claude will verify examples with the engine.

## Report
`handoffs/reports/T009-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
