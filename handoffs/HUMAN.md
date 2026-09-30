# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit T006 + the Train fix** (verified by Claude):
  `git add -A && git commit -m "T006: mistake pattern tagging, engine lines in analyses; Train shows played move; T006b spec" && git push`
- [ ] **Hand T012 to DeepSeek:** tell it `read handoffs/TO_DEEPSEEK.md`.
- [ ] **Try `/train`**: http://localhost:3000/train. Do a session of your own-game puzzles and tell me whether they feel fair and useful.
- [ ] **Read your Coach page**: http://localhost:3000/coach. Does the top 3 ring true? Click a few example moves. Is the training advice something you'd actually do?
- [ ] **Visual pass of the review page**: open any game from `/games` (dates are links). Check board orientation (your color at the bottom), the best-move arrow, the ←/→ keys, clicking the graph and moves, and phone width. Try game **5711** (your Traxler loss): the key moment should be 6...Bxf2+.
- [ ] **Look at your real data** (a dev server is running): http://localhost:3000/games and http://localhost:3000/accounts. Try the filters and the Sync button, and check phone width. Also check `/board` if you haven't yet. Reply with anything off.
- [ ] *(optional)* Put a contact in `.env` as `CHESSCOM_CONTACT=<email or URL>`. Chess.com asks API clients to identify themselves; it's your call whether to share your email with them.
- [ ] **Repertoire check.** I read your last 6 months of games; the summary is in `docs/REPERTOIRE.md` ("What the owner actually plays"). Short version: as White it's 1.e4 + Nf3/c3 everywhere, and you *face* the Scandinavian. As Black it's 1...e5 everything, 2...Nf6 → Stafford (or Traxler via 3.Bc4 Nc6 4.Ng5), and the Englund vs 1.d4. Tell me if anything is off.
- [ ] **Visual check of `/board`** (whenever convenient; it doesn't block T002). Run `npm run dev` and open http://localhost:3000/board. Drag some moves, try an illegal move (it should snap back), Flip, Undo, Reset, paste a FEN and Load it, and check phone width (DevTools device toolbar, ~375px). Reply with anything that feels off.

## Done
- [x] T009 committed (2026-09-30).
- [x] Plan settings: 10 rapid games/week (T012 defaults). Train now shows the move played (prompt + red arrow), per owner feedback (2026-09-30).
- [x] T011 committed (2026-09-30).
- [x] T005 committed; 265 blitz games analyzed in the browser (2026-09-29).
- [x] T004 + T015 committed; abandonment question answered: the owner sometimes quits bad games or starts at bad times (2026-09-29).
- [x] Discord webhook: same as LeagueApp; the test ping works (2026-09-29).
- [x] T004 browser check: 10 blitz games analyzed in 63s; the game page shows the table (2026-09-29).
- [x] T003 committed; T015 handed to DeepSeek (2026-09-29).
- [x] T002 committed; T003 verified + first live sync: 5,712 games, matching the Chess.com and Lichess official counts exactly (2026-09-29).
- [x] T001 committed; T002 handed off and verified (2026-09-29).
- [x] T001 handed to DeepSeek and verified (2026-09-29).
- [x] Usernames (2026-09-29): Chess.com `poip0i333` (main, blitz 774 / rapid 1291); Lichess `poip0i333` (blitz 1448) and `jaeminbbq` (alt).
- [x] Workflow: Claude orchestrates, DeepSeek implements via `handoffs/`, the user relays and commits (2026-09-29).
