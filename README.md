# ChessCoach

A chess coach that learns from your games.

## Prerequisites

- Node 24
- npm 11

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Script                | What it does                                  |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the dev server                          |
| `npm run build`       | Production build                              |
| `npm run start`       | Serve the production build                    |
| `npm run lint`        | ESLint                                        |
| `npm run typecheck`   | `tsc --noEmit`                                |
| `npm test`            | Vitest unit tests                             |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema |
| `npm run db:migrate`  | Apply migrations to `data/chesscoach.db`      |
