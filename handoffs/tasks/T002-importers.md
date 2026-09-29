# T002: Lichess + Chess.com importers (pure, fixture-tested)

**Owner:** DeepSeek · **Depends on:** T001 · **Size:** medium

## Goal
Two importer modules that turn each platform's API responses into one normalized `ImportedGame` shape, plus fetch clients that page through a user's finished games politely. No DB writes and no UI yet; T003 wires this into a sync service.

## Read first
- `DEEPSEEK.md`
- `docs/ARCHITECTURE.md` ("External APIs", "Data model")
- `CLAUDE.md` "Hard rules": fair play and API etiquette (these apply to you too)
- The fixtures in `test/fixtures/` (real games, opponents pseudonymized as `opponent-NN`; the owner is `poip0i333`)

## Fixtures (recorded by Claude; don't edit them)
| File | What |
|---|---|
| `test/fixtures/chesscom/archives.json` | Response of `GET /pub/player/poip0i333/games/archives` (3 months) |
| `test/fixtures/chesscom/archive-2026-09.json` | A monthly archive response: 8 real games + 2 synthetic that must be **skipped** (chess960, custom start position) |
| `test/fixtures/chesscom/expected.json` | **Golden output**: `uuid → normalized game without pgn`, or `null` = skipped |
| `test/fixtures/lichess/games-poip0i333.ndjson` | NDJSON export: 7 real games + 3 synthetic that must be **skipped** (chess960, fromPosition, aborted) |
| `test/fixtures/lichess/expected.json` | **Golden output**: `id → normalized game without pgn`, or `null` |

The golden files are the spec of record. If your output disagrees with them, re-read the mapping rules below. If you still believe a golden value is wrong, say so in the report; don't change the golden file.

## Scope: do

### 1. Schema: add `rated`
Add `rated: integer('rated', { mode: 'boolean' }).notNull().default(true)` to `games`, then run `npm run db:generate` to produce migration `0001_*`. The schema test still passes.

### 2. `src/lib/importers/types.ts`
```ts
export interface ImportedGame {
  platform: Platform; externalId: string; url: string; pgn: string; playedAt: number
  timeControl: string | null; speed: Speed; userColor: UserColor; result: Result
  termination: string | null; rated: boolean; userRating: number | null
  opponentName: string | null; opponentRating: number | null
  openingEco: string | null; openingName: string | null
}
export class RateLimitedError extends Error { retryAfterMs: number }   // HTTP 429
export class UserNotFoundError extends Error { platform; username }    // HTTP 404 on the user's endpoint
export class ImporterHttpError extends Error { status: number; url: string } // any other non-2xx
export interface FetchDeps { fetch?: typeof fetch }  // defaults to globalThis.fetch; tests inject a mock
```
Reuse the `Platform`/`Speed`/`UserColor`/`Result` types from `src/lib/db/schema.ts`.

### 3. Chess.com: `src/lib/importers/chesscom.ts`
- `normalizeChesscomGame(raw, username): ImportedGame | null`
  - Skip (return null) if `rules !== 'chess'` or `initial_setup` exists and isn't the standard start FEN (use `START_FEN`).
  - Username match is case-insensitive → `userColor`.
  - `externalId = uuid`; `url = url`; `pgn = pgn`; `playedAt = end_time * 1000`; `timeControl = time_control`; `speed = time_class`; `rated = rated`.
  - `result`: the user's side result code `win` → `win`; `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient` → `draw`; **everything else** (`checkmated`, `resigned`, `timeout`, `abandoned`, `lose`, …) → `loss`.
  - `termination`: if the user won, the **opponent's** result code; otherwise the **user's** own code.
  - `userRating`, `opponentName` (username), `opponentRating` from the two sides.
  - `openingEco` = the `[ECO "…"]` PGN header, or null. `openingName` = the last path segment of the `eco` URL with `-` replaced by spaces, or null.
- `listChesscomArchives(username, deps?): Promise<string[]>` → `GET https://api.chess.com/pub/player/{username lowercased}/games/archives`.
- `fetchChesscomGames(username, opts: FetchDeps & { sinceMonth?: string /* 'YYYY/MM' */ }): AsyncGenerator<ImportedGame>`: walks archives **oldest → newest**, **one request at a time**, only months ≥ `sinceMonth` when given, and yields normalized games (skipping nulls).
- Every request sends `User-Agent: ${CHESSCOM_USER_AGENT}`, where `CHESSCOM_USER_AGENT` is an exported constant built from `process.env.CHESSCOM_CONTACT`: `ChessCoach/0.1 (+${contact})` if it's set, otherwise `ChessCoach/0.1`. Never hard-code an email address. Add `CHESSCOM_CONTACT=` to `.env.example` with a comment.
- HTTP: 429 → `RateLimitedError` (`retryAfterMs` from the `Retry-After` header in seconds, default 60 000); 404 on the archives endpoint → `UserNotFoundError`; other non-2xx → `ImporterHttpError`.

### 4. Lichess: `src/lib/importers/lichess.ts`
- `normalizeLichessGame(raw, username): ImportedGame | null`
  - Skip if `variant !== 'standard'` or `status` ∈ {`created`, `started`, `aborted`, `noStart`, `unknownFinish`}.
  - `userColor` = the side whose `players[side].user.id === username.toLowerCase()`.
  - `externalId = id`; `url = https://lichess.org/{id}`, plus `/black` when the user is Black; `pgn = pgn`; `playedAt = lastMoveAt`; `rated = rated`.
  - `timeControl`: `clock` → `${initial}+${increment}`; else `daysPerTurn` → `1/${daysPerTurn*86400}`; else null.
  - `speed`: `ultraBullet`/`bullet` → `bullet`; `blitz`, `rapid`, `classical` unchanged; `correspondence` → `daily`.
  - `result`: no `winner` → `draw`; `winner === userColor` → `win`; else `loss`. `termination = status`.
  - `opponentName = user.name`; if there's no user but there is an `aiLevel`, use `Stockfish level N`; else null. Ratings are `players[side].rating ?? null`. `openingEco/openingName` come from `opening.eco/name` or null.
- `src/lib/importers/ndjson.ts`: `parseNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T>`. It must handle lines split across chunks and ignore blank lines.
- `fetchLichessGames(username, opts: FetchDeps & { since?: number /* epoch ms */; token?: string }): AsyncGenerator<ImportedGame>`
  - `GET https://lichess.org/api/games/user/{username}` with query `pgnInJson=true&opening=true&clocks=true&evals=true&finished=true&sort=dateAsc` plus `since` when given. Headers: `Accept: application/x-ndjson`, and `Authorization: Bearer {token}` only when a token is given.
  - Streams the body through `parseNdjson` and yields normalized games (skipping nulls). One request only; there's no pagination (use `since` for incremental sync).
  - Same HTTP error mapping as Chess.com (404 → `UserNotFoundError`).

### 5. Tests (Vitest, **no network**)
- `chesscom.test.ts`: every game in the archive fixture normalizes to its `expected.json` entry (compare everything except `pgn`, and check that `pgn` equals the raw pgn). Fetch client, with a mocked `fetch`:
  - archives are fetched oldest → newest
  - `sinceMonth: '2026/09'` fetches only the September archive
  - the User-Agent header is present
  - **at most one request is in flight at any time** (mock tracks concurrency with a delay)
  - 429 with `Retry-After: 5` → `RateLimitedError` with `retryAfterMs === 5000`
  - 404 → `UserNotFoundError`
- `lichess.test.ts`: every NDJSON line normalizes to `expected.json`. Fetch client:
  - the URL has exactly the query params above; `since` is added when given
  - the Bearer header is sent only with a token
  - a response body delivered in awkward chunks (split mid-line and mid-UTF-8 character) still yields exactly the 7 standard games
  - 429 → `RateLimitedError`
- `ndjson.test.ts`: split lines, blank lines, a trailing line without a newline.

## Scope: do not
- No DB writes, sync service, UI, retries/backoff loops, or scheduling. Those are T003.
- No new dependencies (Node 24's `fetch`, `ReadableStream`, and `TextDecoder` are enough).
- Don't edit the fixtures or `expected.json` files.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm run build` → exit 0
2. `npm test` → all pass, including the golden tests for **all 20 fixture games** (count them in the report)
3. `ls drizzle/0001_*.sql` exists and adds `rated`; `rm -rf data && npm run db:migrate && sqlite3 data/chesscoach.db "pragma table_info(games)" | grep rated` → one row
4. `grep -rnE "@|gmail" src/lib/importers/*.ts | grep -v "^.*//"` → no email address hard-coded
5. `grep -rn "importers" src/app src/components` → nothing (not wired into the UI yet)

## Report
`handoffs/reports/T002-report.md`, then `TO_CLAUDE.md` + `BOARD.md` + notify + tell the user.
