import type { Result, Speed, UserColor } from '../db/schema'

/** The slice of a game row the insights aggregations need. */
export interface InsightGame {
  playedAt: number
  userColor: UserColor
  result: Result
  termination: string | null
  speed: Speed
  rated: boolean
  userRating: number | null
  opponentRating: number | null
  accountId: number
  pgn: string
}

export interface ScoreSummary {
  n: number
  wins: number
  losses: number
  draws: number
  /** (wins + 0.5 * draws) / n; 0 when n is 0. */
  score: number
}

/** SAN tokens of the first `plies` half-moves of the PGN movetext. */
export function firstMoves(pgn: string, plies: number): string[] {
  return pgnMoves(pgn).slice(0, plies)
}

/**
 * The movetext as SAN tokens: tag pairs, `{...}` comments, `(...)` variations,
 * NAGs, move numbers, and the result token are stripped, and trailing
 * check/mate/annotation marks are dropped from each move. Tokenization only —
 * no chess rules are applied, so this scales to thousands of games.
 */
function pgnMoves(pgn: string): string[] {
  let body = pgn.replace(/^\s*(\[[^\]]*\]\s*)+/, '')
  body = stripEnclosed(body, '{', '}')
  body = stripEnclosed(body, '(', ')')
  body = body.replace(/\$\d+/g, ' ')
  body = body.replace(/\b\d+\.+/g, ' ')
  body = body.replace(/(^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g, ' ')
  return body
    .split(/\s+/)
    .map((token) => token.replace(/[+#!?]+$/, ''))
    .filter(Boolean)
}

/** Removes `open...close` spans, including nested ones. */
function stripEnclosed(text: string, open: string, close: string): string {
  let out = ''
  let depth = 0
  for (const ch of text) {
    if (ch === open) depth++
    else if (ch === close && depth > 0) depth--
    else if (depth === 0) out += ch
  }
  return out
}

export function emptyScore(): ScoreSummary {
  return { n: 0, wins: 0, losses: 0, draws: 0, score: 0 }
}

function addResult(acc: ScoreSummary, result: Result): void {
  acc.n++
  if (result === 'win') acc.wins++
  else if (result === 'loss') acc.losses++
  else acc.draws++
  acc.score = (acc.wins + 0.5 * acc.draws) / acc.n
}

export function scoreOf(games: readonly InsightGame[]): ScoreSummary {
  const score = emptyScore()
  for (const game of games) addResult(score, game.result)
  return score
}

export interface OpeningRow extends ScoreSummary {
  color: UserColor
  moves: string[]
}

/**
 * Groups by the user's color + the first `plies` SAN moves, most played first.
 * Games that ended before `plies` are skipped (they never reached the line).
 */
export function byOpening(games: readonly InsightGame[], plies: number): OpeningRow[] {
  if (plies < 1) return []
  const rows = new Map<string, OpeningRow>()
  for (const game of games) {
    const moves = firstMoves(game.pgn, plies)
    if (moves.length < plies) continue
    const key = `${game.userColor} ${moves.join(' ')}`
    let row = rows.get(key)
    if (!row) {
      row = { color: game.userColor, moves, ...emptyScore() }
      rows.set(key, row)
    }
    addResult(row, game.result)
  }
  return [...rows.values()].sort(compareOpeningRows)
}

/**
 * The children one ply deeper than `prefix` for the given color: every next
 * move played after the prefix, with its score, most played first.
 */
export function byOpeningTree(
  games: readonly InsightGame[],
  color: UserColor,
  prefix: readonly string[],
): OpeningRow[] {
  const rows = new Map<string, OpeningRow>()
  for (const game of games) {
    if (game.userColor !== color) continue
    const moves = firstMoves(game.pgn, prefix.length + 1)
    if (moves.length < prefix.length + 1) continue
    if (!startsWith(moves, prefix)) continue
    const line = [...prefix, moves[prefix.length]]
    const key = line.join(' ')
    let row = rows.get(key)
    if (!row) {
      row = { color, moves: line, ...emptyScore() }
      rows.set(key, row)
    }
    addResult(row, game.result)
  }
  return [...rows.values()].sort(compareOpeningRows)
}

function startsWith(moves: readonly string[], prefix: readonly string[]): boolean {
  for (let i = 0; i < prefix.length; i++) {
    if (moves[i] !== prefix[i]) return false
  }
  return true
}

function compareOpeningRows(a: OpeningRow, b: OpeningRow): number {
  return b.n - a.n || a.moves.join(' ').localeCompare(b.moves.join(' '))
}

export interface TerminationRow {
  termination: string
  n: number
  /** Share of that result bucket (0..1); 0 when the bucket is empty. */
  share: number
}

export interface Terminations {
  wins: TerminationRow[]
  losses: TerminationRow[]
}

/** Count and share per termination code, separately for wins and losses. */
export function byTermination(games: readonly InsightGame[]): Terminations {
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  for (const game of games) {
    const counts = game.result === 'win' ? wins : game.result === 'loss' ? losses : null
    if (!counts) continue
    const code = game.termination ?? 'unknown'
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return { wins: terminationRows(wins), losses: terminationRows(losses) }
}

function terminationRows(counts: Map<string, number>): TerminationRow[] {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return [...counts.entries()]
    .map(([termination, n]) => ({ termination, n, share: total === 0 ? 0 : n / total }))
    .sort((a, b) => b.n - a.n || (a.termination < b.termination ? -1 : 1))
}

export interface RatingBandRow extends ScoreSummary {
  label: string
}

/** Bands of `opponentRating - userRating`, in fixed order, all present. */
export const RATING_BAND_LABELS = [
  '< -200',
  '-200..-101',
  '-100..-26',
  '-25..25',
  '26..100',
  '101..200',
  '> 200',
] as const

export function byRatingDiff(games: readonly InsightGame[]): RatingBandRow[] {
  const rows = new Map<string, RatingBandRow>()
  for (const label of RATING_BAND_LABELS) rows.set(label, { label, ...emptyScore() })
  for (const game of games) {
    if (game.userRating === null || game.opponentRating === null) continue
    const row = rows.get(bandOf(game.opponentRating - game.userRating))!
    addResult(row, game.result)
  }
  return RATING_BAND_LABELS.map((label) => rows.get(label)!)
}

function bandOf(diff: number): string {
  if (diff < -200) return '< -200'
  if (diff <= -101) return '-200..-101'
  if (diff <= -26) return '-100..-26'
  if (diff <= 25) return '-25..25'
  if (diff <= 100) return '26..100'
  if (diff <= 200) return '101..200'
  return '> 200'
}

export interface IndexBucket extends ScoreSummary {
  /** '1', '2', '3', '4–6', '7+' — the game's position within its session. */
  label: string
}

export interface SessionStats {
  sessionCount: number
  avgGamesPerSession: number
  byGameIndex: IndexBucket[]
  afterResult: {
    afterWin: ScoreSummary
    afterLoss: ScoreSummary
    afterDraw: ScoreSummary
  }
}

const INDEX_BUCKETS = [
  { label: '1', min: 0, max: 0 },
  { label: '2', min: 1, max: 1 },
  { label: '3', min: 2, max: 2 },
  { label: '4–6', min: 3, max: 5 },
  { label: '7+', min: 6, max: Infinity },
] as const

/**
 * Splits chronologically into sessions: a new session starts when the gap to
 * the previous game exceeds `gapMinutes`. `afterResult` only counts games
 * whose predecessor is in the same session.
 */
export function sessions(games: readonly InsightGame[], gapMinutes = 20): SessionStats {
  const sorted = [...games].sort((a, b) => a.playedAt - b.playedAt)
  const gapMs = gapMinutes * 60_000
  const buckets: IndexBucket[] = INDEX_BUCKETS.map(({ label }) => ({ label, ...emptyScore() }))
  const afterWin = emptyScore()
  const afterLoss = emptyScore()
  const afterDraw = emptyScore()
  let sessionCount = 0
  let indexInSession = 0
  for (let i = 0; i < sorted.length; i++) {
    const game = sorted[i]
    const previous = sorted[i - 1]
    if (previous === undefined || game.playedAt - previous.playedAt > gapMs) {
      sessionCount++
      indexInSession = 0
    } else if (previous.result === 'win') {
      addResult(afterWin, game.result)
    } else if (previous.result === 'loss') {
      addResult(afterLoss, game.result)
    } else {
      addResult(afterDraw, game.result)
    }
    for (let b = 0; b < INDEX_BUCKETS.length; b++) {
      const range = INDEX_BUCKETS[b]
      if (indexInSession >= range.min && indexInSession <= range.max) {
        addResult(buckets[b], game.result)
        break
      }
    }
    indexInSession++
  }
  return {
    sessionCount,
    avgGamesPerSession: sessionCount === 0 ? 0 : sorted.length / sessionCount,
    byGameIndex: buckets,
    afterResult: { afterWin, afterLoss, afterDraw },
  }
}

export interface RatingSeries {
  accountId: number
  speed: Speed
  points: { t: number; rating: number }[]
}

const MAX_SERIES_POINTS = 200

/**
 * The user's rating per rated game, grouped by (accountId, speed) and sorted
 * by time, downsampled to at most `MAX_SERIES_POINTS` points per series (each
 * bucket keeps its last game's rating).
 */
export function ratingSeries(games: readonly InsightGame[]): RatingSeries[] {
  const series = new Map<string, RatingSeries>()
  for (const game of games) {
    if (!game.rated || game.userRating === null) continue
    const key = `${game.accountId}:${game.speed}`
    let entry = series.get(key)
    if (!entry) {
      entry = { accountId: game.accountId, speed: game.speed, points: [] }
      series.set(key, entry)
    }
    entry.points.push({ t: game.playedAt, rating: game.userRating })
  }
  return [...series.values()]
    .sort((a, b) => a.accountId - b.accountId || (a.speed < b.speed ? -1 : a.speed > b.speed ? 1 : 0))
    .map((entry) => {
      entry.points.sort((a, b) => a.t - b.t)
      return { ...entry, points: downsample(entry.points) }
    })
}

function downsample(points: { t: number; rating: number }[], max = MAX_SERIES_POINTS): { t: number; rating: number }[] {
  if (points.length <= max) return points
  const out: { t: number; rating: number }[] = []
  for (let i = 0; i < max; i++) {
    const end = Math.min(points.length, Math.round(((i + 1) * points.length) / max))
    out.push(points[end - 1])
  }
  return out
}

export function byColor(games: readonly InsightGame[]): { white: ScoreSummary; black: ScoreSummary } {
  const white = emptyScore()
  const black = emptyScore()
  for (const game of games) addResult(game.userColor === 'white' ? white : black, game.result)
  return { white, black }
}
