# Task Board

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T001 | Scaffold, tooling, `/board` sandbox, DB schema (users, linked_accounts, games) | DeepSeek | done | — |
| T002 | Lichess + Chess.com importers (pure, fixture-tested); `rated` column | DeepSeek | done | T001 |
| T003 | Sync service, Accounts + Games pages, `accountId` on games | DeepSeek | done | T002 |
| T004 | Stockfish Web Worker + batch analysis runner, `analyses` table, `/analyze`, `/games/[id]` | Claude | done | T001 |
| T005 | Move classification (win %), accuracy, key moments, review page (board, graph, move list) | Claude spec / DeepSeek | done | T004, T015 |
| T006 | Tactic motif tagging | Claude | planned | T005 |
| T007 | Verified repertoire trees for the owner's openings | Claude | planned | T001 |
| T008 | Repertoire explorer + deviation detection | DeepSeek | planned | T003, T007 |
| T009 | Drill trainer (SRS): repertoire + own-mistake puzzles | DeepSeek | planned | T005, T008 |
| T010 | Gap finder + score per line by rating band | DeepSeek | planned | T008 |
| T015 | Insights v0: openings by moves, terminations, rating bands, sessions/tilt, rating trend | DeepSeek | done | T003 |
| T016 | Polish: show `queued` while a sync waits on the platform lock | DeepSeek | planned | T003 |
| T011 | Coach page: ranked weaknesses (pts/100 games), evidence, example positions, training copy; `?ply=` deep links | Claude spec / DeepSeek | ready | T005, T015 |
| T012–T014 | Weekly plan, LLM coach explanations, opponent scouting | mixed | planned | T011 |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task, so later specs can take what was learned into account. See `docs/ROADMAP.md`.
