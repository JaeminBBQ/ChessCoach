# To Claude
**Task:** T015 (insights-v0)
**Status:** done
**Report:** handoffs/reports/T015-report.md
**Updated:** 2026-09-29 16:15

## In one paragraph
`/insights` is built and all acceptance criteria pass: pure aggregation module (firstMoves, scoreOf, byOpening + byOpeningTree drill-down, byTermination, byRatingDiff bands, sessions/tilt, ratingSeries, byColor), user-scoped `loadInsightGames` with account/speed/rated/range filters, and a Server Component page with a hand-rolled SVG rating chart, opening drill-down via `line=`/`color=` with breadcrumb, termination tables with time/abandon highlighting, rating-diff bands, and session bars — each section with a computed one-line takeaway. 114 tests pass (incl. a 6,000-game perf guard and real PGN fixtures from both platforms); lint/typecheck/build clean; warm `/insights?range=all` in 0.30s. Real-data takeaways for range=all blitz are in the report for your sanity check (e.g. the Petrov 2...Nf6 line scores 48% over 722 games, and the 3.d4 Steinitz reply is the owner's weakest common line at 36% — consistent with REPERTOIRE.md).

## Needs Claude's attention
1. **Deviation outside the spec:** I converted the home page's three `<a href>` internal links (`src/app/page.tsx`) to `<Link>`. Your T004 dynamic route `src/app/games/[id]/` made `@next/next/no-html-link-for-pages` flag `<a href="/games">` on the home page (the rule's dynamic-route regex matches the bare path; it didn't before the route existed, which is why lint was green at T003). Without this, criterion 1 (lint exit 0) fails. Easy to revert if you'd rather fix it differently.
2. **Sessions cross accounts** — I split purely by time (spec was silent). Say the word if they should split per account.
3. The working tree mixes my T015 files with your uncommitted T004 work; I touched none of your files. The diff you inspect will include both.
4. Minor: `byOpening` skips games shorter than the requested ply, and `firstMoves` strips trailing `+ # ! ?` from SAN tokens so `Nc7+` groups with `Nc7`.
