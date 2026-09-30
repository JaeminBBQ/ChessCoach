# Architecture

## Stack (see DECISIONS D2–D6)
| Concern | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript + Tailwind** | One codebase for UI and API routes; easy deploys; the interactive board needs a real JS UI |
| Chess rules | **chess.js** (BSD-2) | Legality, SAN/UCI, FEN/PGN |
| Board UI | **react-chessboard** (MIT) | Keeps GPL code out of our bundle (chessground is GPL) |
| Engine | **Stockfish WASM in a Web Worker** (GPLv3, shipped as a separate unmodified asset) | Analysis runs on the user's machine, so server cost doesn't scale with users |
| DB | **SQLite via Drizzle ORM** (better-sqlite3) now → Postgres when multi-user deploys | Zero-ops locally; Drizzle makes the later move mechanical |
| Tests | **Vitest** | Fast; TypeScript-native |
| LLM coach | **Claude API** (server route; later milestone) | Explains engine facts in plain language |

## Layout
```
src/
  app/                 routes (pages + /api/*)
  components/          React components (thin)
  lib/
    chess/             PURE: position helpers, PGN parsing, move trees
    analysis/          PURE: eval → mistake classification, phases, motifs, aggregation
    repertoire/        PURE: repertoire trees, deviation detection, SRS scheduling
    importers/         Lichess / Chess.com clients (fetch injected, so they're testable)
    engine/            browser-side Stockfish worker wrapper
    db/                Drizzle schema, client, migrations entry
    server/            server-only services (sync, LLM)
drizzle/               generated SQL migrations
test/fixtures/         recorded API responses and PGNs (no network in tests)
data/                  local SQLite db (gitignored)
public/engine/         vendored Stockfish WASM worker (GPLv3, unmodified)
```

## Data model (grows per task; `userId` on every user-owned row)
- `users`: id, displayName, createdAt
- `linked_accounts`: id, userId, platform (`lichess` | `chesscom`), username, createdAt, lastSyncedAt; unique (platform, username, userId)
- `games`: id, userId, accountId (→ linked_accounts, cascade), platform, externalId (unique per platform + userId), url, pgn, playedAt, timeControl, rated, speed (`bullet` | `blitz` | `rapid` | `classical` | `daily`), userColor, result (`win` | `loss` | `draw`), termination, userRating, opponentName, opponentRating, openingEco, openingName, importedAt
- `analyses`: id, userId, gameId (unique, cascade with the game), engine, nodes, version, data (JSON `GameAnalysis`), createdAt
- *(planned)* `moments`: gameId, ply, fen, played, best, evalBefore, evalAfter, class (`blunder` | `mistake` | `inaccuracy` | `missed_win`), phase, motifs[]
- *(planned)* `repertoire_nodes`: userId, color, parentId, fen, san, comment, isMainLine, tags (trap, plan)
- *(planned)* `drill_cards`: userId, kind (`own_mistake` | `repertoire`), fen, solution moves, SRS state (ease, interval, due)

## External APIs
**Lichess** (https://lichess.org/api)
- Games export: `GET /api/games/user/{username}` with `Accept: application/x-ndjson`. Parameters: `since`, `max`, `pgnInJson`, `opening`, `clocks`, `evals`, `finished=true`. It streams NDJSON.
- Cloud eval: `GET /api/cloud-eval?fen=` (cheap evals for common positions).
- Opening explorer: `explorer.lichess.ovh/{masters,lichess,player}`. **To verify:** whether it now requires an OAuth token.
- Tablebase: `tablebase.lichess.ovh/standard?fen=` (endgames with ≤7 pieces).
- OAuth2 PKCE (no client secret needed) for "Sign in with Lichess" later.
- Etiquette: one request at a time; on 429, wait ≥60s.

**Chess.com PubAPI** (https://api.chess.com/pub)
- `GET /player/{u}/games/archives` → a list of monthly URLs → `GET /player/{u}/games/{YYYY}/{MM}`.
- Read-only, no auth. Requests are serial with a descriptive User-Agent. Archive months that are already fully imported are immutable, so we never re-fetch them.

## Sync (T003)
- The Sync button starts an in-process background sync with live status. There's one sync per platform at a time (keyed mutex). The cursor is the latest `playedAt` per account: Chess.com re-reads that month; Lichess uses `since` = cursor − 3 days. Inserts are idempotent (`onConflictDoNothing`).
- `getCurrentUserId()` in `src/lib/server/session.ts` is the only no-auth seam; services always take `userId`.

## Engine + analysis (T004)
- **Engine:** Stockfish 19 lite single-threaded WASM, vendored unmodified in `public/engine/` (GPLv3; README has the source link and hashes). It doesn't need COOP/COEP headers. `ENGINE_ID` in `src/lib/engine/index.ts` identifies the build.
- **Layers:**
  - `engine/uci.ts`: pure UCI parsing and score helpers.
  - `engine/uci-engine.ts`: a `UciEngine` over any `UciTransport` (handshake, one search at a time, MultiPV).
  - `engine/browser.ts` (Web Worker) and `engine/node.ts` (in-process, for tests/tooling; it restores `globalThis.fetch`, which the Emscripten loader nulls under Node).
- **Analysis:** `analysis/game-analysis.ts` `analyzeGame(pgn, engine)` replays the PGN and searches every non-terminal position at **150k nodes, MultiPV 2**. It stores per ply: fen, the move that led there, eval (**White POV**), best + second-best move with evals, depth, and terminal (checkmate/stalemate/draw). Fixed nodes keep effort deterministic across devices; it runs about 0.2 s/position in Node.
- **Flow:** `/analyze` (batch, newest unanalyzed first) or the button on `/games/[id]` runs the engine in the browser, then `PUT /api/games/[id]/analysis`. The server re-validates the analysis against the stored PGN (ply count + every FEN) before saving, and a re-analysis replaces the old one.
- **Next (T005):** win-probability conversion, move classification, and the review UI read `analyses.data`; no re-analysis is needed.

## Analysis pipeline (planned, engine milestone)
1. Games sync into `games` (server).
2. The browser pulls unanalyzed games, runs Stockfish per ply (fixed depth or nodes, MultiPV 2 at critical plies), and posts the results.
3. Pure `analysis/` code turns evals into win-probability swings → classified moments → per-game summary → per-user weakness profile.
4. Own-mistake moments become drill cards.
