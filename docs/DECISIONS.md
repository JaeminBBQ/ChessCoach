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
