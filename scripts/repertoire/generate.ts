// Generates repertoire trees from content/repertoire/<set>/specs.json using the
// vendored Stockfish (Node) and the user's own game frequencies. Run with
// `npm run content:repertoire` (shards run in parallel as Vitest workers).
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { firstMoves } from '../../src/lib/analysis/insights'
import { ENGINE_ID } from '../../src/lib/engine'
import { createNodeEngine } from '../../src/lib/engine/node'
import { buildRepertoire, pathKey, type Frequency, type RepertoireSpec } from '../../src/lib/repertoire/build'
import { explorerSource } from './explorer'

const SET = process.env.REPERTOIRE_SET ?? 'owner'
const USER_ID = Number(process.env.REPERTOIRE_USER_ID ?? 1)
const NODES = Number(process.env.REPERTOIRE_NODES ?? 800_000)
const DIR = path.resolve('content/repertoire', SET)
/** Comma-separated spec ids to regenerate (default: all). */
const ONLY = process.env.REPERTOIRE_ONLY?.split(',')

/** Frequency of every opening path (up to 20 plies) in the user's games, by the user's color. */
function loadFrequencies(color: 'white' | 'black'): (p: string) => Frequency | null {
  const db = new Database('data/chesscoach.db', { readonly: true })
  const rows = db
    .prepare('select pgn, result from games where user_id = ? and user_color = ?')
    .all(USER_ID, color) as { pgn: string; result: string }[]
  db.close()
  const table = new Map<string, { n: number; points: number }>()
  for (const r of rows) {
    const moves = firstMoves(r.pgn, 20)
    const points = r.result === 'win' ? 1 : r.result === 'draw' ? 0.5 : 0
    for (let i = 1; i <= moves.length; i++) {
      const key = pathKey(moves.slice(0, i).join(' '))
      const e = table.get(key) ?? { n: 0, points: 0 }
      e.n++
      e.points += points
      table.set(key, e)
    }
  }
  return (p) => {
    const e = table.get(pathKey(p))
    return e ? { n: e.n, score: Math.round((e.points / e.n) * 1000) / 1000 } : null
  }
}

export async function generateShard(shard: number, shards: number): Promise<void> {
  const specs = JSON.parse(readFileSync(path.join(DIR, 'specs.json'), 'utf8')) as RepertoireSpec[]
  const mine = specs.filter((s, i) => i % shards === shard && (!ONLY || ONLY.includes(s.id)))
  if (mine.length === 0) return
  const popular = explorerSource()
  if (!popular) throw new Error('LICHESS_TOKEN is not set (.env): trap mining needs the Lichess explorer')
  const engine = await createNodeEngine()
  mkdirSync(DIR, { recursive: true })
  for (const spec of mine) {
    const started = Date.now()
    const nodes = await buildRepertoire(spec, {
      engine,
      nodes: NODES,
      frequency: loadFrequencies(spec.color),
      minFreq: 5,
      habitTolerance: 3,
      popular,
      minShare: 0.1,
      maxPopular: 4,
      trapPlies: 6,
    })
    const out = {
      id: spec.id,
      name: spec.name,
      color: spec.color,
      root: spec.root,
      engine: ENGINE_ID,
      nodesPerPosition: NODES,
      generatedAt: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 1000),
      nodes,
    }
    writeFileSync(path.join(DIR, `${spec.id}.json`), JSON.stringify(out, null, 1) + '\n')
  }
  engine.close()
}
