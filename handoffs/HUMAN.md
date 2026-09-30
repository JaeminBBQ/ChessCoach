# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit T004, then T015** (both verified by Claude; two commits keep history clean). Run them in order:
  `git add public/engine src/lib/engine src/lib/analysis/game-analysis.ts src/lib/analysis/game-analysis.test.ts src/lib/server/analyses.ts src/lib/server/analyses.test.ts src/app/analyze src/app/api/games src/app/api/analysis "src/app/games/[id]" src/app/games/page.tsx src/components/analysis src/lib/db/schema.ts drizzle eslint.config.mjs CLAUDE.md docs && git commit -m "T004: Stockfish WASM engine, game analysis, analyses table, /analyze"`
  `git add -A && git commit -m "T015: insights page; T005 spec" && git push`
- [ ] **Hand T005 to DeepSeek:** tell it `read handoffs/TO_DEEPSEEK.md`.
- [ ] **Question: abandonment.** In the last year, 103 of your 197 rated blitz losses on Chess.com ended by *abandonment*, and 51 more on time. What usually happens: do you close the tab or stop moving when a game is lost (basically resigning), or is it disconnects or leaving mid-game for other reasons? It changes what the coach should tell you, and T011 can check it with the engine (was the position already lost when you left?).
- [ ] **Look at `/insights`**: http://localhost:3000/insights. Does anything look wrong or surprising?
- [ ] **Look at your real data** (a dev server is running): http://localhost:3000/games and http://localhost:3000/accounts. Try the filters and the Sync button, and check phone width. Also check `/board` if you haven't yet. Reply with anything off.
- [ ] *(optional)* Put a contact in `.env` as `CHESSCOM_CONTACT=<email or URL>`. Chess.com asks API clients to identify themselves; it's your call whether to share your email with them.
- [ ] **Repertoire check.** I read your last 6 months of games; the summary is in `docs/REPERTOIRE.md` ("What the owner actually plays"). Short version: as White it's 1.e4 + Nf3/c3 everywhere, and you *face* the Scandinavian. As Black it's 1...e5 everything, 2...Nf6 → Stafford (or Traxler via 3.Bc4 Nc6 4.Ng5), and the Englund vs 1.d4. Tell me if anything is off.
- [ ] **Visual check of `/board`** (whenever convenient; it doesn't block T002). Run `npm run dev` and open http://localhost:3000/board. Drag some moves, try an illegal move (it should snap back), Flip, Undo, Reset, paste a FEN and Load it, and check phone width (DevTools device toolbar, ~375px). Reply with anything that feels off.

## Done
- [x] Discord webhook: same as LeagueApp; the test ping works (2026-09-29).
- [x] T004 browser check: 10 blitz games analyzed in 63s; the game page shows the table (2026-09-29).
- [x] T003 committed; T015 handed to DeepSeek (2026-09-29).
- [x] T002 committed; T003 verified + first live sync: 5,712 games, matching the Chess.com and Lichess official counts exactly (2026-09-29).
- [x] T001 committed; T002 handed off and verified (2026-09-29).
- [x] T001 handed to DeepSeek and verified (2026-09-29).
- [x] Usernames (2026-09-29): Chess.com `poip0i333` (main, blitz 774 / rapid 1291); Lichess `poip0i333` (blitz 1448) and `jaeminbbq` (alt).
- [x] Workflow: Claude orchestrates, DeepSeek implements via `handoffs/`, the user relays and commits (2026-09-29).
