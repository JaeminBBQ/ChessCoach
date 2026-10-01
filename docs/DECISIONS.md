# Decision Log

Append-only. When a decision changes, add a new entry that supersedes the old one.

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-09-29 | Orchestration: Claude plans and reviews, DeepSeek implements via `handoffs/` md files, the user relays and runs all commits | User's chosen workflow (same as LeagueApp) |
| D2 | 2026-09-29 | Stack: Next.js App Router + TypeScript + Tailwind, npm, Vitest | Interactive board needs a JS UI; one repo for UI + API; implementer-friendly |
| D3 | 2026-09-29 | chess.js for rules; react-chessboard for the board (not chessground) | Permissive licenses keep the app bundle free of GPL |
| D4 | 2026-09-29 | Stockfish runs client-side as a WASM Web Worker, shipped as an unmodified separate asset with a source link | Zero server engine cost per user; GPL compliance by aggregation |
| D5 | 2026-09-29 | SQLite + Drizzle now; Postgres at the first multi-user deploy | Zero-ops locally; the migration path is mechanical |
| D6 | 2026-09-29 | Multi-user schema from day one (`userId` everywhere); auth deferred (Lichess OAuth PKCE is the planned first login) | The owner wants it to scale to other users later |
| D7 | 2026-09-29 | Fair play: finished games only; no live-game assistance of any kind | Protects users' accounts on Lichess and Chess.com |
| D8 | 2026-09-29 | LLM explains engine output and never produces evals itself | Accuracy; LLMs are unreliable at calculation |
| D9 | 2026-09-29 | Working name "ChessCoach" (package `chesscoach`) until the owner picks a name | Placeholder |
| D10 | 2026-09-29 | One user can link several accounts per platform (owner has 2 Lichess accounts); stats aggregate across them, filterable per account | Owner has an alt account; common for other users too |
| D11 | 2026-09-29 | Sync runs in-process in the background with a per-platform mutex and in-memory status; becomes a persistent job queue at M5 | Simple now; the mutex enforces API etiquette; the queue is needed only when many users sync |
| D12 | 2026-09-29 | Games carry `accountId` (cascade on unlink) in addition to `userId` | Per-account cursors and filters (owner has 2 Lichess accounts) |
| D13 | 2026-09-29 | Importers silently skip games they can't normalize (variants, custom starts, unknown speed, user not a player) | One odd game shouldn't abort a sync |
| D14 | 2026-09-29 | Vendor only Stockfish 19 lite-single (`.js` + 1.8 MB `.wasm`) into `public/engine/` instead of the npm package | The npm package is 200 MB with 94 MB builds; lite-single needs no cross-origin isolation headers and is far stronger than needed |
| D15 | 2026-09-29 | Analysis = every position at 150k nodes, MultiPV 2, evals stored in White POV as JSON per game; the server validates FENs before saving | Deterministic effort; the second-best line enables only-move/missed-win detection later; browser results can't corrupt data |
| D16 | 2026-09-30 | Analyses store each engine move's principal variation (12 plies, optional field); the owner's 265 games were re-analyzed in Node to add it | Needed to recognize multi-move tactics (material along the line, checks) |
| D17 | 2026-09-30 | Mistake patterns = rule-based tags from the engine reply/line (hanging piece, combination, fork, allowed mate, king attack; missed variants), mapped to Lichess puzzle themes; unrecognized = 'other' | Explains 62% of mistakes on real data with no extra engine work; transparent and testable |
| D18 | 2026-09-30 | Train shows the move the user played (prompt + red arrow) before the attempt | Owner feedback: seeing your own move is the point of own-game puzzles |
| D19 | 2026-09-30 | Repertoire trees are generated content (`content/repertoire/<set>/*.json`, checked in) from a hand-written spec (forced gambit/trap moves) + engine choices + the owner's own game frequencies; opponent replies = engine top 2 + anything faced ≥ 10 times | Engine truth for every move, the owner's real openings, and no hand-typed lines that could be wrong; regenerable per tree |
| D20 | 2026-09-30 | A finding's "top pattern" (Plan second metric, Lichess puzzle task) is the most common *named* motif; `other` never wins | "Other" names nothing to practice; it's still shown honestly in the Coach tables and "Mostly:" bullets |
| D21 | 2026-09-30 | Repertoire trees are imported into per-user DB rows (`repertoires`, `repertoire_nodes`); games match the book by position (fenKey) over the union of a color's trees, cached per game in `game_repertoire` and cleared on re-import; stats are computed live from games, not from the generation-time `freq` | Multi-user rows, transpositions count, fast pages, and stats that follow new games |
