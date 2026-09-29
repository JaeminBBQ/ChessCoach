# Product: ChessCoach (working name)

## One line
A personal chess coach that learns how *you* play from your Lichess and Chess.com games, then tells you what to work on and helps you practice it.

## Who it's for
- **Now:** the project owner, an improving club-level player on Lichess/Chess.com.
- **Later:** any online player. The design assumes many users from day one (per-user data, rate-limit-aware syncing, costs that don't grow per user where avoidable, e.g. browser-side engine analysis).

This is a **chess improvement coach**, not an opening trainer. Openings are one pillar among several.

## Pillars
1. **Know your games.** Import games automatically, analyze them with Stockfish, and find the mistakes that actually decided each game (not every inaccuracy).
2. **Know your weaknesses.** Aggregate across games into a profile that answers "why do I lose?": opening outcomes, hung pieces, missed tactics by motif, time trouble, conversion of winning positions, endgames, and mistakes by game phase. Track it over time.
3. **Train the weaknesses.** Build puzzles from *your own* mistakes, drill your repertoire with spaced repetition, and give themed practice for each weakness.
4. **Openings you actually play.** A per-user repertoire (lines, traps, and the plans behind them). Detect where you or your opponent left the repertoire in real games, find repertoire gaps (e.g. "you have nothing prepared against 1.c4"), and track your score per line.
5. **Game plan.** Before a session, show what to focus on. Before a known opponent, scout their public finished games (what they play and where they go wrong) and suggest a plan. After a game, give a short review: the three moments that mattered and what the idea was.
6. **Coach voice.** An LLM explains the engine's findings in plain language ("your knight left the kingside; that's why Qh5 worked"), always grounded in engine output.

## Owner's current focus (details in `docs/REPERTOIRE.md`)
- As White: **Ponziani** (1.e4 e5 2.Nf3 Nc6 3.c3)
- As Black vs 1.e4: **Scandinavian**, **Stafford Gambit**, and the **Traxler**
- As Black vs 1.d4: **Englund Gambit**

## Non-goals
- Any live-game assistance (hard rule; see CLAUDE.md).
- Playing against the user as a bot (maybe later, and only for training from set positions).
- Being another opening encyclopedia; Lichess already does that.

## Success for the owner (first months)
- Every game gets reviewed within a minute of finishing, with no manual PGN pasting.
- A weekly "what to work on" list that the owner agrees with.
- Measurable change: fewer hung pieces per game, a better score in the focus openings, and a rating trend.
