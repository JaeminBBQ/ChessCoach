import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Chess } from 'chess.js'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from '../../../test/helpers/db'
import type { Score } from '../engine/uci'
import { gameRepertoire, games, linkedAccounts, repertoireNodes, repertoires, users } from '../db/schema'
import { ensureGameRepertoire, importRepertoireSet, loadGameMatches, listRepertoires } from './repertoire'

let db: TestDb
let close: () => void
let userId: number
let accountId: number

beforeEach(() => {
  const t = createTestDb()
  db = t.db
  close = () => t.sqlite.close()
  userId = db.insert(users).values({ displayName: 'me', createdAt: 1 }).returning({ id: users.id }).get().id
  accountId = db
    .insert(linkedAccounts)
    .values({ userId, platform: 'lichess', username: 'me' })
    .returning({ id: linkedAccounts.id })
    .get().id
})
afterEach(() => close())

/** A body node at `extra` past the tree's root, with a real FEN and a neutral eval. */
function bodyNode(root: string[], ...extra: string[]): {
  path: string
  san: string
  by: 'user' | 'opponent'
  fen: string
  eval: Score | null
} {
  const chess = new Chess()
  let san = ''
  for (const token of [...root, ...extra]) san = chess.move(token).san
  const ply = root.length + extra.length
  const white = ply % 2 === 1
  const by = white ? 'opponent' : 'user' // the tree color is black, so Black (even plies) is the user
  return { path: [...root, ...extra].join(' '), san, by, fen: chess.fen(), eval: { type: 'cp', value: 0 } }
}

function writeTree(dir: string, id: string, root: string[], body: ReturnType<typeof bodyNode>[]): void {
  writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({
      id,
      name: id,
      color: 'black',
      root,
      engine: 'test',
      generatedAt: '2026-09-30T00:00:00.000Z',
      nodes: body,
    }),
  )
}

function addGame(pgn: string, userColor: 'white' | 'black' = 'black', playedAt = Date.now()): number {
  return db
    .insert(games)
    .values({
      userId,
      accountId,
      platform: 'lichess',
      externalId: pgn,
      url: 'https://lichess.org/x',
      pgn,
      playedAt,
      speed: 'blitz',
      userColor,
      result: 'win',
      importedAt: 1,
    })
    .returning({ id: games.id })
    .get().id
}

describe('importRepertoireSet', () => {
  it('imports idempotently and clears the match cache', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cc-rep-'))
    try {
      writeTree(dir, 't1', ['d4'], [bodyNode(['d4'], 'e5')])
      importRepertoireSet(db, userId, dir)
      const first = {
        reps: db.select().from(repertoires).all(),
        nodes: db.select().from(repertoireNodes).all(),
      }
      expect(first.reps).toHaveLength(1)
      expect(first.reps[0].slug).toBe('t1')
      expect(JSON.parse(first.reps[0].root)).toEqual(['d4'])
      // Root prefix d4 + the body node.
      expect(first.nodes.map((n) => n.path).sort()).toEqual(['d4', 'd4 e5'])

      // A cached match must survive nothing: importing again clears it.
      const gameId = addGame('1. d4 e5 *')
      ensureGameRepertoire(db, userId, [gameId])
      expect(db.select().from(gameRepertoire).all()).toHaveLength(1)

      importRepertoireSet(db, userId, dir)
      const second = {
        reps: db.select().from(repertoires).all(),
        nodes: db.select().from(repertoireNodes).all(),
      }
      expect(second.reps).toHaveLength(first.reps.length)
      expect(second.nodes).toHaveLength(first.nodes.length)
      expect(new Set(second.nodes.map((n) => n.path))).toEqual(new Set(first.nodes.map((n) => n.path)))
      expect(db.select().from(gameRepertoire).all()).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('synthesizes root-path prefix nodes with null evals and the right mover', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cc-rep-'))
    try {
      // Root e4 e5 means 1.e4 is the opponent's move and 1...e5 the user's.
      writeTree(dir, 't1', ['e4', 'e5'], [bodyNode(['e4', 'e5'], 'Nf3')])
      importRepertoireSet(db, userId, dir)
      const nodes = db.select().from(repertoireNodes).all()
      const e4 = nodes.find((n) => n.path === 'e4')!
      const e5 = nodes.find((n) => n.path === 'e4 e5')!
      expect(e4.by).toBe('opponent')
      expect(e4.eval).toBeNull()
      expect(e5.by).toBe('user')
      expect(e5.eval).toBeNull()
      expect(nodes.find((n) => n.path === 'e4 e5 Nf3')!.by).toBe('opponent')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('ensureGameRepertoire', () => {
  it('computes matches only for games without one, and matches against the book', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cc-rep-'))
    try {
      writeTree(dir, 't1', ['d4'], [bodyNode(['d4'], 'e5')])
      importRepertoireSet(db, userId, dir)

      const inBook = addGame('1. d4 e5 *')
      ensureGameRepertoire(db, userId, [inBook])
      const firstRow = db.select().from(gameRepertoire).where(eq(gameRepertoire.gameId, inBook)).get()!
      expect(firstRow.status).toBe('game-ended')
      expect(firstRow.repertoireId).toBe(listRepertoires(db, userId)[0].id)
      expect(JSON.parse(firstRow.positions)).toHaveLength(2)

      // A second pass computes nothing new.
      ensureGameRepertoire(db, userId, [inBook])
      const again = db.select().from(gameRepertoire).where(eq(gameRepertoire.gameId, inBook)).get()!
      expect(again.computedAt).toBe(firstRow.computedAt)

      // A new game that deviates gets its own row; the old one is untouched.
      const deviates = addGame('1. d4 d5 *')
      ensureGameRepertoire(db, userId, [inBook, deviates])
      const matches = loadGameMatches(db, userId, [inBook, deviates])
      expect(matches.get(deviates)).toMatchObject({ status: 'user-left', leftPly: 2, leftSan: 'd5', bookSans: ['e5'] })
      expect(db.select().from(gameRepertoire).where(eq(gameRepertoire.gameId, inBook)).get()!.computedAt).toBe(firstRow.computedAt)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
