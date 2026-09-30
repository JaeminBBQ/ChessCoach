# CLAUDE.md

> **If you are DeepSeek or any implementer agent: stop here and follow `DEEPSEEK.md` instead.**
> This file is for the orchestrator (Claude).

## Roles
- **Claude (orchestrator):** owns product and architecture decisions, writes task specs, and reviews and verifies DeepSeek's work. Claude does the hard or judgment-heavy work directly: data modeling, engine/worker integration, analysis heuristics (mistake classification, weakness scoring), chess content accuracy (repertoire lines, plans), LLM prompt design, and debugging gnarly issues.
- **DeepSeek (implementer):** does simple-to-moderate dev work from task files in `handoffs/tasks/`. Claude can't spawn it; the user relays handoffs manually.
- **User (human in the loop):** relays handoffs, answers product questions, and does browser/visual/manual testing (board UX, "does this coaching feel right"). The user also manages accounts and secrets (Lichess token, Anthropic key, hosting) and plays the games the app coaches.

## Handoff workflow (full protocol in `handoffs/README.md`)
1. Claude writes `handoffs/tasks/TNNN-slug.md`, points `handoffs/TO_DEEPSEEK.md` at it (with any notes), and sets it to `ready` in `handoffs/BOARD.md`.
2. Claude pauses and tells the user to say **"read handoffs/TO_DEEPSEEK.md"** to DeepSeek.
3. DeepSeek implements, writes `handoffs/reports/TNNN-report.md`, and overwrites `handoffs/TO_CLAUDE.md`.
4. The user tells Claude "read handoffs/TO_CLAUDE.md". Claude reads it and the report, inspects `git diff`, **reruns the acceptance commands itself**, and then either marks the task `done` or writes a follow-up task (`TNNNa-fix-...`). Never mark a task done on DeepSeek's word alone.
5. When a task is done, Claude gives the user the exact `git add/commit` command. **The user runs all commits; Claude and DeepSeek never commit.**

Tasks for DeepSeek: well-specified implementation with runnable acceptance tests.
Tasks that stay with Claude: decisions, specs, reviews, anything ambiguous, engine integration, chess-content correctness, and anything touching secrets or real user data.

## Discord notifications (always)
The user may be away from the terminal. Before ending any turn where the user must act (hand off to DeepSeek, answer a question, run a commit, do a browser test), send:
`python3 tools/notify.py --from claude --kind input "<exactly what to do>"`
Use `--kind done` for finished milestones and `--kind blocked` for blockers. The webhook lives in `.env` (`DISCORD_WEBHOOK_URL`); never print it. If it isn't set, the script skips silently. The `Notification` hook in `.claude/settings.json` also forwards permission prompts.

## Sources of truth
- `docs/PRODUCT.md`: what we're building, for whom, and the feature map
- `docs/ARCHITECTURE.md`: stack, layout, data model, and external APIs
- `docs/REPERTOIRE.md`: the user's openings and the known gaps (chess content lives here)
- `docs/ROADMAP.md`: milestones → tasks
- `docs/DECISIONS.md`: decision log (append-only; add a superseding entry when a decision changes)
- `handoffs/BOARD.md`: task status. `handoffs/HUMAN.md`: open asks for the user

## Hard rules
- **Fair play:** the app must never help during a live game. It analyzes finished games only, imports only games with a final status, and has no live-board reading, browser extension, or overlay. Opponent scouting uses public, finished games only. This rule protects every user's Lichess/Chess.com account.
- **Engine truth:** evaluations come from Stockfish or Lichess (cloud eval, tablebase), never from an LLM. The LLM explains engine facts; it doesn't invent evals or lines.
- **Multi-user from day one:** every user-owned row has a `userId`, and there are no single-user shortcuts in the schema. Auth can come later, but data must already be partitioned.
- **External API etiquette:** Lichess allows one request at a time per client, and on HTTP 429 you wait at least 60s. Chess.com PubAPI requests are serial and need a descriptive `User-Agent` with contact info. Cache aggressively; never re-fetch finished games.
- **Licensing:** Stockfish (GPLv3) runs as a separate, unmodified Web Worker asset with a source link in the UI. Don't bundle GPL code (e.g. chessground) into our app bundle without a decision entry.
- Never print, log, or commit secrets. `.env` is gitignored.

## Environment notes
- Node 24 / npm 11 (no pnpm). Git branch `main`; the user commits **and pushes**.
- GitHub: `origin` = `git@github.com:JaeminBBQ/ChessCoach.git`, using the repo-local `core.sshCommand` with `~/.ssh/id_ed25519_github` (same key as LeagueApp). Identity: `JaeminBBQ <jaeminl@unr.edu>`. No `gh` CLI is installed.
- DeepSeek runs inside Claude Code, so it also loads this file and the auto-memory; that's why the redirect at the top matters.
- Next.js 16: its APIs differ from older training data. Check `node_modules/next/dist/docs/` before writing Next-specific code. `AGENTS.md` holds the block that `next dev` manages; leave it there so `next dev` stops rewriting CLAUDE.md.
- Engine tests use the real Stockfish WASM through `createNodeEngine()` (fast: about 1 s for the suite). The dev DB backup from before migration 0003 is in the session scratchpad only.
- Sibling project `~/Projects/LeagueApp` uses the same protocol, and its files are a good reference for format.
