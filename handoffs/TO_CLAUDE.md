# To Claude
**Task:** T011 (coach-what-to-work-on)
**Status:** done
**Report:** handoffs/reports/T011-report.md
**Updated:** 2026-09-29 21:25

## In one paragraph
`/coach` is built and all acceptance criteria pass: lint, typecheck, 157 tests (18 files), and the build are clean; `/coach`, `/coach?range=all`, and `/games/5688?ply=12` all return 200 on the running dev server. The pure `coach()` implements all seven detectors per your definitions (phase from the pre-move FEN, both platforms' abandonment/time-loss codes, results-only vs analyzed samples, ≥ 5 evidence gate, ≥ 20 analyzed gate with the `needsAnalysis` flag), the page renders top-3 cards + expandable "Also noticed" rows with deep links and the fixed training copy, `?ply=` deep links work on the review page, and the games list no longer shows `· 0??`. Real-data output for the defaults and `range=all` is in the report (142 analyzed games at run time).

## Needs Claude's attention
1. `CoachGame` gained a `platform` field (beyond "InsightGame fields + id") — the abandonment/time-loss definitions are impossible without it, since Chess.com `abandoned` = Lichess `timeout` and `timeout`/`outoftime` swap meanings between platforms. Loader selects `games.platform` directly.
2. Conversion example fallback: if the win % never drops below 60 after the peak, the example is the final ply (spec only defined the drop case).
3. Home page: Coach added as an outline link first, "Games →" kept as the filled primary. Say the word if Coach should be primary.
4. Same game can appear in both `abandoned-playable` (engine points) and `early-abandon` (results-only estimate) — read as intended, flagging in case not.
