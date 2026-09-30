# T016: Inline replay boards on Coach examples

**Owner:** DeepSeek · **Depends on:** T011, T006b · **Size:** medium

## Goal
The owner's feedback (see → train → measure): the Coach says *what* goes wrong, but each example is a link that leaves the page. The owner wants to **see** the mistake in place. Turn every Coach example into a small replay board that opens inline. It steps through the moves that led up to the mistake, the mistake itself, and what followed, and it can switch to **the engine's line** from the same position. You never leave `/coach`.

## Read first
- `DEEPSEEK.md`
- `src/app/coach/page.tsx` (`FindingBody` renders `finding.examples` as links today)
- `src/lib/analysis/coach.ts` (`FindingExample`: `{ gameId, ply, label }`; `ply` is the position *after* the move the example is about)
- `src/lib/analysis/game-analysis.ts` (`PlyAnalysis`, `EngineMove.pv`, `replayPgn`), `src/lib/analysis/classify.ts` (`positionWin`)
- `src/components/analysis/game-review.tsx` and `src/components/training/trainer.tsx` for how we drive `react-chessboard` v5 (`options={{ ... }}`, arrows, squareStyles, `boardStyle`)
- Next.js 16 docs in `node_modules/next/dist/docs/` for passing props from a server component to a client component

## Definitions (use exactly these)
For an example at ply `p` in a game:
- **Decision position** = the position at ply `p − 1` (the position before the move). For `p = 0` the decision position is ply 0, and there's no "played" or "best" move.
- **Played move** = the move that leads to ply `p` (`positions[p].move`).
- **Best move** = `analysis.plies[p − 1].best`, when the game has an analysis and it's non-null.
- **Game window** = plies `max(0, p − 1 − 4)` through `min(last, p + 6)`: 4 plies of lead-up, the decision position, the played move, and 6 plies of what followed.
- **Engine line** = the decision position, then `best.pv` played out move by move (up to 12 plies). If `pv` is missing (older analyses), use `[best.uci]`. It's `null` when there's no best move, or when the best move equals the played move (then there's nothing to contrast).
- **Win %** of a position = `positionWin` from the stored analysis, converted to the user's POV and rounded. It's `null` without an analysis or for a terminal position with no eval. Engine-line positions don't carry a win %; show the best move's eval once, on the line's header, as the user's win %.

## Scope: do
1. **Pure builder: `src/lib/analysis/replay.ts`**
   ```ts
   export interface ReplayStep { ply: number; fen: string; san: string | null; uci: string | null; win: number | null }
   export interface ReplayData {
     gameId: number
     ply: number                 // the example's ply p
     userColor: 'white' | 'black'
     label: string               // the example label, unchanged
     game: ReplayStep[]          // the game window, in order
     decisionIndex: number       // index in `game` of the decision position
     engine: { steps: ReplayStep[]; bestSan: string; bestWin: number | null } | null
   }
   export function replayWindow(
     game: { id: number; pgn: string; userColor: 'white' | 'black'; analysis: GameAnalysis | null },
     example: { ply: number; label: string },
   ): ReplayData | null
   ```
   - Positions come from `replayPgn(game.pgn)` (this works for unanalyzed games too, e.g. `early-abandon` and `opening-line` examples). Clamp `p` into range. Return `null` when the PGN can't be read; don't throw.
   - Engine-line steps: `ply` counts on from the decision ply, `san` comes from chess.js, and `win` is `null`. Stop at the first illegal PV move (defensive; shouldn't happen).
2. **Server wiring (`/coach`).** For every example of every finding shown, build its `ReplayData` from the games already loaded for the page. **Don't add queries.** Pass the data to a client component. Examples whose builder returns `null` keep today's plain link.
3. **Client component: `src/components/coach/replay-board.tsx`**
   - The example labels stay as chips in the same row. Clicking a chip opens its replay panel below the row, and clicking it again closes it. **One panel open per finding.** On page load, only the **#1 finding's first example** is open.
   - Board: `react-chessboard`, oriented to the user's color, no dragging, max width 360px (full width on phones), a unique `id` per panel.
   - Opens on the **decision position**, with a **red arrow** for the played move and a **green arrow** for the best move (when an engine line exists). The same arrows show whenever the decision position is on screen, in either mode. Other positions get the last-move highlight (same yellow as game-review).
   - Mode toggle: **"Game"** | **"Engine's line"** (hide the toggle when `engine` is null). Switching modes resets to the decision position.
   - Controls: ⏮ (decision position) ◀ ▶, plus ← / → keys **only while the panel has focus**. The panel is a `tabIndex={0}` container with `onKeyDown`; no `window` listener, because several panels can be open on the page.
   - Under the board:
     - The move list of the current mode as clickable SAN tokens with move numbers (`14.` / `14...`). The current token is highlighted, and in Game mode the played move is colored red.
     - One status line: in Game mode, "Your win chance: 62%" (hide it when `win` is null). In Engine mode, "Engine: 15.Nd5 — your win chance 58%".
     - A link **"Open full review →"** to `/games/{gameId}?ply={ply}`.
4. **Keep it light:** only the open panels mount a `Chessboard`. Closed examples are plain chips.

## Scope: do not
- No changes to coach formulas, finding copy, or example selection. No new dependencies. No engine runs in the browser for this feature; everything comes from stored analyses.
- Don't add replay boards to the pattern tables. That's a follow-up.

## Tests (`src/lib/analysis/replay.test.ts`)
Use a real short PGN (e.g. `1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#`) and a hand-built analysis:
- Window clamping at both ends: an example at ply 1 starts at ply 0, and an example at the last ply ends at the last ply. `decisionIndex` points at ply `p − 1`.
- There's no analysis → every `win` is null and `engine` is null.
- The engine line from a `pv`: FENs are legal and SANs are correct, and it stops at an illegal PV move. A missing `pv` falls back to the single best move.
- `best.uci === played.uci` → `engine` is null.
- A win % converts to the user's POV for a Black user.
- An unreadable PGN → `null`.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → exit 0.
2. `/coach` and `/coach?range=all` → 200. Report the page's HTML size (`curl -s localhost:3000/coach | wc -c`) before and after, which should grow by at most ~150 KB.
3. **Real-data section:** for the owner's #1 finding (defaults), give the first example's label, its game window as SAN, where `decisionIndex` points, the played vs best move, and the engine line as SAN. Then do the same for one `conversion` or `opening-line` example (whichever exists).
4. Say in the report which parts need the user's browser check: arrows, keyboard focus, and the phone-width layout.

## Report
`handoffs/reports/T016-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
