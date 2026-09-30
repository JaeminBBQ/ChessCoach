# Roadmap

Milestones are ordered; tasks inside them are refined as we learn. The live status is in `handoffs/BOARD.md`.

## M1: Foundation (import your games)
- T001 Scaffold: Next.js, tooling, board sandbox, DB schema (DeepSeek)
- T002 Lichess + Chess.com importers as pure, fixture-tested clients (DeepSeek; fixtures recorded by Claude from the owner's real games)
- T003 Sync service + "link account" and game list UI (DeepSeek)

## M2: Analysis (know your games)
- T004 Stockfish worker + batch analysis runner in the browser (Claude)
- T005 Moment classification (win-probability swings), phases, and a game review page with an eval graph (Claude spec, DeepSeek build)
- T006 Tactic motif tagging for moments (hung piece, fork, pin, back rank, …) (Claude)

## M3: Repertoire (openings you actually play)
- T007 Verified repertoire trees for the owner's openings (Claude content)
- T008 Repertoire explorer UI + "where did the game leave my repertoire" detection (DeepSeek)
- T009 Train: puzzles from your own mistakes and missed chances, spaced repetition (DeepSeek, Claude spec). T009b: repertoire drills
- T010 Gap finder: openings faced with no prepared answer, plus score by line and rating band (DeepSeek)

## M4: Coach (know and train your weaknesses)
- T011 Weakness profile and trends (Claude spec)
- T012 Weekly training plan (Claude)
- T013 LLM coach explanations for moments and plans (Claude)
- T014 Opponent scouting / game plan from an opponent's public finished games (DeepSeek, Claude spec)

## M5: Other users
- Lichess OAuth login, Postgres, deploy, per-user sync queue, privacy page, naming/domain
