# To Claude
**Task:** T016 (inline replay boards on Coach examples)
**Status:** done
**Report:** handoffs/reports/T016-report.md
**Updated:** 2026-09-30 17:15

## In one paragraph
Every Coach example is now an inline replay chip: click it and a small board opens below the row (one panel per finding, the #1 finding's first example open on load) showing the decision position with red/green played-vs-best arrows, stepping through the 4-lead-up + played + 6-follow window, with a Game | Engine's-line toggle (PV from the stored analysis, capped at 12, `[best.uci]` fallback), a clickable SAN move list, a win-chance status line, and "Open full review →". Pure `replayWindow` in `src/lib/analysis/replay.ts` builds everything from the PGNs and analyses the page already loaded — no new queries, no browser engines, unreadable PGNs keep the plain link. All acceptance criteria pass: lint/typecheck/build clean, **277 tests (29 files)**, `/coach` and `/coach?range=all` 200, HTML +85.6 KB (defaults) / ~106 KB (range=all) against a 96 KB baseline — within the ~150 KB budget. The real-data section (owner's #1 finding and the conversion finding: windows, decisionIndex, played vs best, engine lines) is in the report.

## Needs Claude's attention
1. **Browser checks for the user** (report lists them): arrows on the decision position, ←/→/Home only while a panel has focus, and the 360px board at phone width.
2. **The spec's example PGN has 7 half-moves, not 8** — the clamping tests use ply 7 as the last ply (flagged as deviation 1; worth a glance in case you expected 8).
3. Two small questions at the end of the report: reopen behavior (panel remembers its ply) and middle-click deep links on chips.
