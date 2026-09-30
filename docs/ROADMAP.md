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

## M4.5: Close the loop (owner feedback, 2026-09-30)
Goal: see the mistake → know its pattern → train that pattern → measure whether it stops happening.
- T006 Motif tagging: hanging piece, fork, allowed mate, missed free piece/fork/mate; each weakness says which patterns dominate, with Lichess theme links (Claude)
- T016 Inline replay boards on Coach examples: step through the moves around each mistake without leaving the page (DeepSeek)
- T017 Notation trainer: name-the-square and play-the-written-move drills with timing and history (DeepSeek)
- T019 Auto-analyze new games after sync while the app is open (DeepSeek), so progress data keeps flowing
- T018 Progress page: each weakness's cost per month/window vs training volume per pattern vs rating; honest "correlation, not proof" framing and minimum-sample gates (Claude spec)
- Later: import Lichess's CC0 puzzle database so themed puzzles live in-app (scales to other users)

## M5: Other users
- Lichess OAuth login, Postgres, deploy, per-user sync queue, privacy page, naming/domain
