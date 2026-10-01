# T016 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Every Coach example is now an inline replay chip: clicking it opens a small replay board below the row (one per finding, the #1 finding's first example open on page load) that steps through the 4-plies-before / decision / played / 6-plies-after window, toggles to the engine's line from the decision position (red = played, green = best), shows a clickable SAN move list with the played move in red, a status line with the user's win %, and an "Open full review →" link. Only the open panel mounts a Chessboard, so closed findings stay light. All data comes from the stored PGNs and analyses already loaded for the page — no new queries, no browser engine runs, and unreadable PGNs fall back to today's plain links.

## Files changed
- `src/lib/analysis/replay.ts` (+ `replay.test.ts`): pure `replayWindow(game, example) → ReplayData | null` — game window + decision index + engine line (PV capped at 12, `[best.uci]` fallback, stops at illegal PV moves, null when best === played or p = 0, win % in the user's POV and rounded).
- `src/components/coach/replay-board.tsx`: client `ReplayBoards` (chips + one open panel per finding) and `ReplayPanel` (board with unique id, mode toggle, ⏮◀▶ + ←/→/Home on a `tabIndex={0}` container, SAN move list, status line, full-review link).
- `src/app/coach/page.tsx`: builds `ReplayData` for every example of every finding from the already-loaded `games` (`gameById` map); examples with a null replay keep the plain link; `FindingCard`/`FindingBody` pass `exampleReplays` down and `openFirstExample` to the top finding.

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| lint / typecheck / test / build → exit 0 | pass | all clean; **277 tests / 29 files** (up from 265) |
| `/coach` and `/coach?range=all` → 200, HTML grows ≤ ~150 KB | pass | 200 both; defaults **96,318 → 181,897 (+85.6 KB)**; range=all 202,557 (measured against the defaults baseline, +106 KB) |
| Real-data section | pass | below |
| Browser-check items named | pass | arrows, keyboard focus, phone-width layout (below) |

## Real-data section (owner, defaults: 1-year range, most-played speed = blitz)
**#1 finding — Mistakes in the middlegame, first example:**
- Label: `23...Qe5?? (98% → 0%)` · gameId 5476 · p = 46 (Black's 23rd move)
- Game window (SAN): `Rff3 c5 Rfg3 cxd4 Rxh6 Qe5 Qh7#` (plies 42–49)
- `decisionIndex` = 4 → ply 45, FEN `1r3rk1/b4pp1/3p3R/pp1q4/3p4/P1PQ2R1/1P4PP/6K1 b - - 0 23`
- Played: **Qe5** (d5e5) · Best: **dxc3+** (d4c3), bestWin 98%
- Engine line (SAN): `∅ dxc3+ Kf1 Qxd3+ Rxd3 cxb2 Rb3 gxh6 Rxb2 Rfe8 g4 Re6 Ra2` (decision + 12 PV plies)

**Conversion finding, first example:**
- Label: `33...Qd1+ (100% → 10%)` · gameId 2249 · p = 66
- Game window (SAN): `h4+ Kg4 Qe5 Qf3+ Kg1 Qd1+ Kh2 Qf3 Qf4+ Qxf4 exf4 Kf3`
- `decisionIndex` = 4 → ply 65, FEN `8/p2R3p/6p1/4Qp2/3Pp1kP/4PqP1/P4P2/6K1 b - - 4 33`
- Played: **Qd1+** (f3d1) · Best: **Kh3** (g4h3), bestWin 100%
- Engine line (SAN): `∅ Kh3 Qxf5+ gxf5 g4 Qd1#` (decision + 5 PV plies)

The rendered page shows exactly one mounted board (the #1 finding's open panel), the "Game | Engine's line" toggle, "Your win chance: 98%", and the example chips.

## Needs the user's browser check
1. **Arrows** — red for the played move and green for the best move on the decision position, in both modes; yellow last-move highlight elsewhere.
2. **Keyboard focus** — ← / → / Home step the board only while the replay panel has focus (click the board first); arrow keys must not scroll the page.
3. **Phone-width layout** — the 360px-max board and controls should fit without horizontal page scroll.

## Deviations from the spec
1. The spec's example PGN (`1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#`) has **7 half-moves** (plies 0–7), not 8 — the test expectations use ply 7 as the last ply. (The spec text just says "a real short PGN"; flagging the count because the clamping test "an example at the last ply" uses 7.)
2. The move list omits the start-position token (SAN is null at ply 0); the ⏮ control covers jumping back to it.
3. `p = 0` examples render no played/best arrows (per the definition: no played or best move exists).

## Dependencies added
None.

## Questions / proposals for Claude
1. The panels stay mounted (and remember their ply) when you close and reopen a chip; switching examples resets. Say the word if you'd rather each open reset to the decision position.
2. Replay chips are buttons now; the plain link only remains for unreadable PGNs. If you want the chip to *also* deep-link (e.g. middle-click), that's a small follow-up.

## Known issues / follow-ups
- Range=all grows the page to ~203 KB; still within budget, but if more examples get added later (or T013 LLM text lands), consider trimming the window or lazy-loading closed panels' data.
- Claude's T007 repertoire files in the tree were untouched.
