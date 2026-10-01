# Task Board

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T001 | Scaffold, tooling, `/board` sandbox, DB schema (users, linked_accounts, games) | DeepSeek | done | — |
| T002 | Lichess + Chess.com importers (pure, fixture-tested); `rated` column | DeepSeek | done | T001 |
| T003 | Sync service, Accounts + Games pages, `accountId` on games | DeepSeek | done | T002 |
| T004 | Stockfish Web Worker + batch analysis runner, `analyses` table, `/analyze`, `/games/[id]` | Claude | done | T001 |
| T005 | Move classification (win %), accuracy, key moments, review page (board, graph, move list) | Claude spec / DeepSeek | done | T004, T015 |
| T006 | Motif tagging (`motifs.ts`), engine lines stored in analyses, 265 games re-analyzed | Claude | done | T005 |
| T006b | Patterns on Coach (table + Lichess links), Train `?motif=`, Plan focus/pattern task, review labels | DeepSeek | done | T006, T012 |
| T007 | Verified repertoire trees for the owner's openings (content for the opening test) | Claude | done | T001 |
| T008 | Repertoire explorer + where each game left the book (import trees to DB, matcher, `/repertoire`, game banner) | DeepSeek | ready | T003, T007 |
| T009 | Train: puzzles from own mistakes + missed chances, SM-2 spaced repetition, `/train` | Claude spec / DeepSeek | done | T011 |
| T009b | Opening test: repertoire drills (SRS), registers a plan task | DeepSeek | planned | T007, T012 |
| T010 | Gap finder + score per line by rating band | DeepSeek | planned | T008 |
| T015 | Insights v0: openings by moves, terminations, rating bands, sessions/tilt, rating trend | DeepSeek | done | T003 |
| T020 | Polish: show `queued` while a sync waits on the platform lock | DeepSeek | planned | T003 |
| T011 | Coach page: ranked weaknesses (pts/100 games), evidence, example positions, training copy; `?ply=` deep links | Claude spec / DeepSeek | done | T005, T015 |
| T016 | Inline replay boards on Coach examples (game window + engine line) | DeepSeek | done | T011, T006b |
| T017 | Notation trainer (squares, reading moves), registers a plan task | DeepSeek | planned | T012 |
| T018 | Progress + correlation page (weakness trends vs training vs rating) | Claude spec / DeepSeek | planned | T006, T009, T019 |
| T019 | Auto-analyze new games after sync (folded into T012's Sync & analyze) | DeepSeek | done-in-T012 | T004 |
| T012 | Game plan `/plan`: weekly auto-tracked tasks (play/review/train/analyze), focus habit + metric, Sync & analyze, 8-week scorecard | Claude spec / DeepSeek | done | T009, T011 |
| T013–T014 | LLM coach explanations, opponent scouting | mixed | planned | T012 |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task, so later specs can take what was learned into account. See `docs/ROADMAP.md`.
