# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit T002** (verified by Claude):
  `git add -A && git commit -m "T002: Lichess + Chess.com importers, rated column; T003 spec"`
- [ ] **Hand T003 to DeepSeek:** tell it `read handoffs/TO_DEEPSEEK.md`.
- [ ] *(optional)* Put a contact in `.env` as `CHESSCOM_CONTACT=<email or URL>`. Chess.com asks API clients to identify themselves; it's your call whether to share your email with them.
- [ ] **Discord notifications:** copy your webhook into this project. This command copies the line without printing it:
  `grep '^DISCORD_WEBHOOK_URL=' ../LeagueApp/.env > .env`
  (Or make a separate channel/webhook if you want ChessCoach pings kept apart.)
- [ ] **Repertoire check.** I read your last 6 months of games; the summary is in `docs/REPERTOIRE.md` ("What the owner actually plays"). Short version: as White it's 1.e4 + Nf3/c3 everywhere, and you *face* the Scandinavian. As Black it's 1...e5 everything, 2...Nf6 → Stafford (or Traxler via 3.Bc4 Nc6 4.Ng5), and the Englund vs 1.d4. Tell me if anything is off.
- [ ] **Visual check of `/board`** (whenever convenient; it doesn't block T002). Run `npm run dev` and open http://localhost:3000/board. Drag some moves, try an illegal move (it should snap back), Flip, Undo, Reset, paste a FEN and Load it, and check phone width (DevTools device toolbar, ~375px). Reply with anything that feels off.

## Done
- [x] T001 committed; T002 handed off and verified (2026-09-29).
- [x] T001 handed to DeepSeek and verified (2026-09-29).
- [x] Usernames (2026-09-29): Chess.com `poip0i333` (main, blitz 774 / rapid 1291); Lichess `poip0i333` (blitz 1448) and `jaeminbbq` (alt).
- [x] Workflow: Claude orchestrates, DeepSeek implements via `handoffs/`, the user relays and commits (2026-09-29).
