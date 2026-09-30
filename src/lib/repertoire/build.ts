import { Chess } from 'chess.js'

import { toWhitePov, type Score } from '../engine/uci'
import type { AnalysisEngine, EngineLine } from '../engine/uci-engine'
import { winPercent } from '../analysis/classify'

/**
 * Builds a repertoire tree for one opening: the user's moves come from the
 * engine (preferring the user's habitual move when it's nearly as good), and
 * the opponent's replies are the engine's top choices plus whatever the user's
 * real opponents play often. Engine-injected so it runs in the browser, Node,
 * or tests with a fake engine.
 */

export interface RepertoireSpec {
  id: string
  name: string
  color: 'white' | 'black'
  /** SAN moves from the start position to where this repertoire begins. */
  root: string[]
  /** Stop expanding below this many plies from the start position. */
  maxPly: number
  /** Deeper limits for specific lines: path prefix (space-separated SAN) → maxPly. */
  deeper?: Record<string, number>
  /** Force the user's move at a path (space-separated SAN from the start) → SAN. */
  prefer?: Record<string, string>
  /** Coaching notes at a path (the position after that path) → text. */
  notes?: Record<string, string>
  /** Lines to always include (space-separated SAN from the start), e.g. traps opponents rarely fall into. */
  include?: string[]
}

export interface Frequency {
  n: number
  /** The user's score in games through this position (0–1). */
  score: number
}

export interface RepertoireNode {
  /** Space-separated SAN from the start position, ending with this node's move. */
  path: string
  san: string
  by: 'user' | 'opponent'
  fen: string
  /** Evaluation of the position after this move, White POV (null when terminal). */
  eval: Score | null
  /** How often the user reached this position, from their own games. */
  freq: Frequency | null
  /** For opponent moves that are clear mistakes (user win % ≥ 70 after it). */
  punish?: boolean
  note?: string
}

export interface BuildOptions {
  engine: AnalysisEngine
  nodes: number
  /**
   * Frequency of a path (space-separated SAN, check marks included as chess.js
   * writes them) in the user's games, or null. Normalize with `pathKey`.
   */
  frequency: (path: string) => Frequency | null
  /** Opponent replies seen at least this often are included. */
  minFreq: number
  /** Keep the user's habitual move if it's within this many win % points of the engine's best. */
  habitTolerance: number
}

export async function buildRepertoire(spec: RepertoireSpec, opts: BuildOptions): Promise<RepertoireNode[]> {
  const nodes: RepertoireNode[] = []
  const start = new Chess()
  for (const san of spec.root) start.move(san)
  const userColor = spec.color === 'white' ? 'w' : 'b'
  await expand(spec.root, start.fen(), null)
  for (const n of nodes) {
    if (n.by === 'opponent' && n.eval && userWinPercent(n.eval, userColor) >= 70) n.punish = true
  }
  return nodes

  /**
   * Analyzes `fen` once: the result is both the eval of the move that led here
   * (`owner`) and the source of the next moves. Positions past the depth limit
   * are analyzed only for the eval.
   */
  async function expand(path: string[], fen: string, owner: RepertoireNode | null): Promise<void> {
    const key = path.join(' ')
    const chess = new Chess(fen)
    if (chess.isGameOver()) return
    const side = chess.turn()
    const atLimit = path.length >= limitFor(spec, key)
    const lines = await opts.engine.analyze(fen, { nodes: opts.nodes, multiPv: atLimit ? 1 : 3 })
    if (owner && lines[0]) owner.eval = toWhitePov(lines[0].score, side)
    // Past the depth limit, only `include` lines continue (one move each, no branching).
    const onLine = atLimit ? includeNext(spec.include ?? [], key) : []
    if ((atLimit && onLine.length === 0) || lines.length === 0) return

    const moves = atLimit
      ? onLine
      : side === userColor
        ? [spec.prefer?.[key] ?? chooseUserMove(fen, key, lines, side, opts)]
        : opponentReplies(fen, key, lines, opts, spec.include ?? [])
    for (const san of moves) {
      const child = play(fen, san)
      const full = [...path, child.san]
      const n: RepertoireNode = {
        path: full.join(' '),
        san: child.san,
        by: side === userColor ? 'user' : 'opponent',
        fen: child.fen,
        eval: null,
        freq: opts.frequency(full.join(' ')),
      }
      const note = spec.notes?.[n.path]
      if (note) n.note = note
      nodes.push(n)
      await expand(full, child.fen, n)
    }
  }
}

/** The next move of every `include` line that passes through `key` (deduplicated). */
function includeNext(include: string[], key: string): string[] {
  const k = pathKey(key)
  const next = new Set<string>()
  for (const line of include) {
    const sans = line.split(' ')
    const l = pathKey(line)
    if (!k && sans.length > 0) next.add(sans[0])
    else if (l.startsWith(k + ' ')) next.add(sans[k.split(' ').length])
  }
  return [...next]
}

function limitFor(spec: RepertoireSpec, key: string): number {
  let limit = spec.maxPly
  for (const [prefix, deeper] of Object.entries(spec.deeper ?? {})) {
    if ((key === prefix || key.startsWith(prefix + ' ')) && deeper > limit) limit = deeper
  }
  return limit
}

function play(fen: string, san: string): { fen: string; san: string } {
  const chess = new Chess(fen)
  const move = chess.move(san)
  return { fen: chess.fen(), san: move.san }
}

function sanOf(fen: string, uci: string): string {
  return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
}

function userWinPercent(score: Score, userColor: 'w' | 'b'): number {
  const white = winPercent(score)
  return userColor === 'w' ? white : 100 - white
}

/**
 * The engine's best move, unless the user's most-played move here is within
 * `habitTolerance` win % of it (then keep the habit: less to relearn).
 */
function chooseUserMove(fen: string, key: string, lines: EngineLine[], side: 'w' | 'b', opts: BuildOptions): string {
  const scored = lines.map((l) => ({ san: sanOf(fen, l.pv[0]), win: userWinPercent(toWhitePov(l.score, side), side) }))
  const best = scored[0]
  const habit = mostPlayed(fen, key, opts)
  if (habit) {
    const match = scored.find((s) => s.san === habit)
    if (match && best.win - match.win <= opts.habitTolerance) return habit
  }
  return best.san
}

/**
 * Opponent replies: the engine's top 2, any legal move the user's opponents
 * played at least `minFreq` times, and moves on `include` lines.
 */
function opponentReplies(fen: string, key: string, lines: EngineLine[], opts: BuildOptions, include: string[]): string[] {
  const replies = new Set<string>(lines.slice(0, 2).map((l) => sanOf(fen, l.pv[0])))
  for (const san of legalSans(fen)) {
    const path = key ? `${key} ${san}` : san
    const f = opts.frequency(path)
    const forced = include.some((line) => {
      const k = pathKey(path)
      const l = pathKey(line)
      return l === k || l.startsWith(k + ' ')
    })
    if (forced || (f && f.n >= opts.minFreq)) replies.add(san)
  }
  return [...replies]
}

function mostPlayed(fen: string, key: string, opts: BuildOptions): string | null {
  let best: { san: string; n: number } | null = null
  for (const san of legalSans(fen)) {
    const f = opts.frequency(key ? `${key} ${san}` : san)
    if (f && f.n >= opts.minFreq && (!best || f.n > best.n)) best = { san, n: f.n }
  }
  return best?.san ?? null
}

function legalSans(fen: string): string[] {
  return new Chess(fen).moves()
}

/** Normalizes a SAN path for frequency lookups: drops check/mate/annotation marks. */
export function pathKey(path: string): string {
  return path
    .split(' ')
    .map((san) => san.replace(/[+#!?]+$/, ''))
    .join(' ')
}
