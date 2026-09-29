# DEEPSEEK.md: Implementer Guide

You are the **implementer** on this project. Claude is the orchestrator: it writes your tasks, owns decisions, and reviews your work. A human relays messages between you. You may be running inside Claude Code, in which case `CLAUDE.md` is also loaded; its orchestrator instructions are **not** for you.

## How to work
1. The user will say something like "read handoffs/TO_DEEPSEEK.md". That file names your current task.
2. Read, in order: this file → the task file → every doc the task lists under "Read first".
3. Implement **only** what the task's Scope says. If something outside scope seems necessary, don't do it; put it under "Questions / proposals" in your report.
4. Run every command under "Acceptance criteria" and make them pass.
5. Write the full report to `handoffs/reports/TNNN-report.md` using `handoffs/REPORT_TEMPLATE.md`.
6. **Overwrite `handoffs/TO_CLAUDE.md`** with a short update for Claude (format below). This is how Claude learns you're finished.
7. Set the task's row in `handoffs/BOARD.md` to `review`.
8. **Send a Discord notification** (see below), then tell the user: "Done. Tell Claude: read handoffs/TO_CLAUDE.md".

## Discord notifications (always)
The user isn't watching the terminal. Notify them whenever you finish or need them:
```
python3 tools/notify.py --from deepseek --kind done    "T00N finished: <one line>. Tell Claude: read handoffs/TO_CLAUDE.md"
python3 tools/notify.py --from deepseek --kind input   "<what you need from the user>"
python3 tools/notify.py --from deepseek --kind blocked "T00N blocked: <why>. Tell Claude: read handoffs/TO_CLAUDE.md"
```
Send `input` **before** you stop to ask the user anything. The script reads the webhook from `.env` itself; never open `.env` or print the webhook URL. Don't edit `tools/notify.py`.

### `handoffs/TO_CLAUDE.md` format
```
# To Claude
**Task:** TNNN (slug)
**Status:** done | partial | blocked
**Report:** handoffs/reports/TNNN-report.md
**Updated:** YYYY-MM-DD HH:MM

## In one paragraph
What was built and whether all acceptance criteria pass.

## Needs Claude's attention
Numbered questions, deviations, or blockers. "Nothing" if none.
```

You may use your own subagents. You may not change the task file, `TO_DEEPSEEK.md`, `CLAUDE.md`, `DEEPSEEK.md`, or anything in `docs/` (propose changes in your report instead).

## If you get stuck
Don't guess at product, architecture, or chess-content decisions. Finish what you can, set the status to `blocked` or `partial`, and list precise questions in `TO_CLAUDE.md`. A clear question beats a wrong assumption.

## Hard rules
- **Fair play:** never build anything that could assist during a live game (no live-board reading, overlays, extensions, or importing games that are still in progress).
- **Engine truth:** evals come from Stockfish or Lichess APIs only, never from an LLM or hard-coded guesses.
- **Every user-owned table and query is scoped by `userId`.** No global "the user" shortcuts.
- **Tests never hit the network.** Use recorded fixtures in `test/fixtures/` and mocked `fetch`.
- Never read, print, log, or commit secrets. Don't open `.env`.
- **Never run `git commit`, `git push`, or change git history.** The user commits. Read-only git (`status`, `diff`) is fine.
- Don't add dependencies the task doesn't list without flagging them in the report (name, version, why). Never add GPL-licensed packages to the app bundle.

## Conventions
- TypeScript strict mode everywhere; no `any` unless it's unavoidable and commented.
- Chess logic (`src/lib/chess/`) and analysis logic (`src/lib/analysis/`) are **pure functions** with Vitest unit tests. React components stay thin.
- Server-only code (DB, external API clients) lives under `src/lib/server/` or `src/lib/db/` and is never imported by client components.
- Use `chess.js` for all move legality, SAN/UCI, and FEN/PGN work. Never hand-roll chess rules.
- **Next.js 16** differs from older docs and training data. Before writing Next-specific code (routing, route handlers, caching, config), check `node_modules/next/dist/docs/`.
- Match the style of existing code. Write docstrings only where behavior isn't obvious.
- Timestamps: store as UTC epoch milliseconds (integers) and convert only at the edges.
