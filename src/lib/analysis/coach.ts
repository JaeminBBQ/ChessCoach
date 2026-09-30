import type { Platform, UserColor } from '../db/schema'
import { classifyMoves, positionWin, type MoveJudgement } from './classify'
import type { GameAnalysis } from './game-analysis'
import { byOpening, firstMoves, type InsightGame } from './insights'

/**
 * A game with its engine analysis. `platform` is needed because the two
 * platforms use different termination codes for abandonment and time losses.
 */
export interface CoachGame extends InsightGame {
  id: number
  platform: Platform
  /** The opponent's display name, for plan task links. */
  opponentName: string | null
  analysis: GameAnalysis | null
}

export interface FindingExample {
  gameId: number
  ply: number
  label: string
}

export interface Finding {
  id: string
  title: string
  pointsPer100: number
  sample: { kind: 'analyzed' | 'all'; games: number }
  headline: string
  evidence: string[]
  examples: FindingExample[]
  training: string
}

export interface CoachResult {
  findings: Finding[]
  analyzedGames: number
  totalGames: number
  needsAnalysis: boolean
}

export type Phase = 'opening' | 'middlegame' | 'endgame'

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']

/** Engine-based detectors need this many analyzed games before they speak. */
const MIN_ANALYZED = 20
/** Findings with fewer than this many moves or games behind them are dropped. */
const MIN_EVIDENCE = 5

/** Fixed coaching copy, keyed by finding id (written by Claude; use verbatim). */
const TRAINING: Record<string, string> = {
  'mistakes-opening':
    'Your early mistakes cost the most. For moves 1–10, before each move ask: what did their last move attack, and is anything of mine loose? Check the opening lines on the Insights page for where your games go wrong.',
  'mistakes-middlegame':
    'Build a blunder check: before every move, ask "What does their last move attack?" and "After my move, what is left undefended?" Do 15 minutes of rated puzzles a day; tactics are pattern recognition.',
  'mistakes-endgame':
    'With few pieces left, precision beats speed. Spend a few seconds more per move, activate your king, and study basic endgames: king and pawn, rook behind the passed pawn, opposition.',
  'missed-chances':
    'When your opponent\'s move looks odd, stop and check every check, capture, and threat for you before continuing your plan. Many of your best chances came right after their mistakes.',
  conversion:
    'When you\'re winning: trade pieces (not pawns), stop their counterplay before attacking, and use your clock; there\'s no rush when you\'re ahead.',
  'abandoned-playable':
    'You left games you could still save or win. Only start a game when you have time to finish it, and when things go badly, play on while the position is still holdable. Blitz opponents at your level blunder back often.',
  'early-abandon':
    'Several games ended almost before they started. Only start a game when you can finish it; if you might be interrupted, pick a shorter time control or play a daily game instead.',
  'time-losses-ok-position':
    'You lose on time in positions that were fine. Aim to keep a third of your clock at move 20, and try 3+2 or 5+3 (increment) for a while so a good position isn\'t lost to the clock.',
  'opening-line':
    'Your results in this line are well below 50%. Open it on the Insights page to see which reply hurts most, and replay your losses in it from the review page.',
}

/**
 * Ranks the user's weaknesses by expected points lost per 100 games. Each
 * finding is gated on at least `MIN_EVIDENCE` moves or games; engine-based
 * detectors additionally need at least `MIN_ANALYZED` analyzed games, and when
 * there are fewer `needsAnalysis` is set so the page can prompt for more.
 */
export function coach(games: readonly CoachGame[]): CoachResult {
  const analyzedGames = games.filter((game) => game.analysis !== null).length
  const needsAnalysis = analyzedGames < MIN_ANALYZED

  const findings: Finding[] = []
  if (!needsAnalysis) findings.push(...engineFindings(games))
  const early = earlyAbandonFinding(games)
  if (early) findings.push(early)
  findings.push(...openingLineFindings(games))

  findings.sort((a, b) => b.pointsPer100 - a.pointsPer100)
  return { findings, analyzedGames, totalGames: games.length, needsAnalysis }
}

/** Detectors that read analyses: mistakes by phase, missed chances, conversion, abandonment, time losses. */
function engineFindings(games: readonly CoachGame[]): Finding[] {
  const analyzedGames = games.filter((game) => game.analysis !== null).length
  const mistakes = new Map<Phase, Array<{ gameId: number; j: MoveJudgement; hanging: boolean }>>()
  for (const phase of PHASES) mistakes.set(phase, [])
  const missed: Array<{ gameId: number; j: MoveJudgement }> = []
  const conversions: Array<Conversion> = []
  let conversionReached = 0
  const abandoned: Array<{ gameId: number; finalPly: number; finalWin: number }> = []
  let abandonedLost = 0
  const timeLossOk: Array<{ gameId: number; finalPly: number; finalWin: number }> = []
  let totalTimeLosses = 0

  for (const game of games) {
    if (isTimeLoss(game)) totalTimeLosses++
    const a = game.analysis
    if (!a) continue
    const judgements = classifyMoves(a)
    const byPly = new Map(judgements.map((j) => [j.ply, j]))
    const phases = phasesOf(a)

    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      if (j.judgement === 'mistake' || j.judgement === 'blunder') {
        // Left something hanging: the opponent's best reply in the position
        // after the user's move (not the user's own best move) is a capture.
        const hanging = a.plies[j.ply]?.best?.san.includes('x') ?? false
        mistakes.get(phases.get(j.ply)!)!.push({ gameId: game.id, j, hanging })
      }
      // A missed chance: the opponent just dropped ≥ 20 win % and the reply
      // neither plays the best move nor punishes the mistake (own drop ≥ 10).
      const previous = byPly.get(j.ply - 1)
      if (previous !== undefined && previous.drop >= 20 && j.judgement !== 'best' && j.drop >= 10) {
        missed.push({ gameId: game.id, j })
      }
    }

    const conversion = conversionOf(game, a)
    if (conversion) {
      conversionReached++
      if (game.result !== 'win') conversions.push(conversion)
    }

    const finalWin = userWinAt(a, a.plies.length - 1, game.userColor)
    if (finalWin === null) continue
    if (isAbandonedLoss(game)) {
      if (finalWin >= 30) abandoned.push({ gameId: game.id, finalPly: a.plies.length - 1, finalWin })
      else abandonedLost++
    } else if (isTimeLoss(game) && finalWin >= 50) {
      timeLossOk.push({ gameId: game.id, finalPly: a.plies.length - 1, finalWin })
    }
  }

  const findings: Finding[] = []
  for (const phase of PHASES) {
    const f = mistakesFinding(phase, mistakes.get(phase)!, analyzedGames)
    if (f) findings.push(f)
  }
  const missedChances = missedChancesFinding(missed, analyzedGames)
  if (missedChances) findings.push(missedChances)
  const conversion = conversionFinding(conversions, conversionReached, analyzedGames)
  if (conversion) findings.push(conversion)
  const abandonedFinding = abandonedPlayableFinding(abandoned, abandonedLost, analyzedGames)
  if (abandonedFinding) findings.push(abandonedFinding)
  const timeLoss = timeLossFinding(timeLossOk, totalTimeLosses, analyzedGames)
  if (timeLoss) findings.push(timeLoss)
  return findings
}

/** Phase per ply, decided from the position before the move (plies[i-1].fen). */
function phasesOf(a: GameAnalysis): Map<number, Phase> {
  const phases = new Map<number, Phase>()
  for (let ply = 1; ply < a.plies.length; ply++) phases.set(ply, phaseAt(a.plies[ply - 1].fen, ply))
  return phases
}

/** Moves 1–10 are the opening; later, endgame once few pieces remain. */
function phaseAt(fen: string, ply: number): Phase {
  if (ply <= 20) return 'opening'
  return countPieces(fen) <= 6 ? 'endgame' : 'middlegame'
}

/** N, B, R, and Q on the board, both colors (kings and pawns excluded). */
function countPieces(fen: string): number {
  let count = 0
  for (const ch of fen.split(' ')[0]) if ('nbrqNBRQ'.includes(ch)) count++
  return count
}

/** The user's win % at a ply (0–100), or null when the position has no eval. */
function userWinAt(a: GameAnalysis, ply: number, userColor: UserColor): number | null {
  const white = positionWin(a.plies[ply])
  return white === null ? null : userColor === 'white' ? white : 100 - white
}

/**
 * A loss where the user left and the opponent claimed the win: Chess.com
 * `abandoned`, Lichess `timeout`. Lichess `outoftime` is a normal flag.
 */
function isAbandonedLoss(game: CoachGame): boolean {
  if (game.result !== 'loss') return false
  return game.platform === 'chesscom' ? game.termination === 'abandoned' : game.termination === 'timeout'
}

/** A loss on the clock: Chess.com `timeout`, Lichess `outoftime`. */
function isTimeLoss(game: CoachGame): boolean {
  if (game.result !== 'loss') return false
  return game.platform === 'chesscom' ? game.termination === 'timeout' : game.termination === 'outoftime'
}

/** Total half-moves in the PGN (tokenization only; no chess rules). */
function totalPlies(game: CoachGame): number {
  return firstMoves(game.pgn, Infinity).length
}

/** The number of plies made by the user's color. */
function userMoveCount(game: CoachGame): number {
  const n = totalPlies(game)
  return game.userColor === 'white' ? Math.ceil(n / 2) : Math.floor(n / 2)
}

/** `14...Qd7?? (62% → 18%)` — the user's win % before and after the move. */
function moveLabel(j: MoveJudgement): string {
  const mark = j.judgement === 'blunder' ? '??' : j.judgement === 'mistake' ? '?' : '?!'
  return `${Math.ceil(j.ply / 2)}${j.ply % 2 === 1 ? '.' : '...'}${j.san}${mark} (${Math.round(j.winBefore)}% → ${Math.round(j.winAfter)}%)`
}

function mistakesFinding(
  phase: Phase,
  moves: Array<{ gameId: number; j: MoveJudgement; hanging: boolean }>,
  analyzedGames: number,
): Finding | null {
  if (moves.length < MIN_EVIDENCE) return null
  const points = moves.reduce((sum, m) => sum + m.j.drop, 0) / 100
  const perGame = moves.length / analyzedGames
  const pointsPer100 = (points / analyzedGames) * 100
  const captures = moves.filter((m) => m.hanging).length
  const worst = [...moves].sort((x, y) => y.j.drop - x.j.drop).slice(0, 3)
  return {
    id: `mistakes-${phase}`,
    title: `Mistakes in the ${phase}`,
    pointsPer100,
    sample: { kind: 'analyzed', games: analyzedGames },
    headline: `${moves.length} ${moves.length === 1 ? 'mistake or blunder' : 'mistakes and blunders'} in the ${phase} — ${perGame.toFixed(1)} per game, worth ${pointsPer100.toFixed(1)} points per 100 games.`,
    evidence: [
      `${moves.length} ${moves.length === 1 ? 'mistake or blunder' : 'mistakes and blunders'} in the ${phase} over ${analyzedGames} analyzed games (${perGame.toFixed(1)} per game).`,
      `Together they cost ${pointsPer100.toFixed(1)} points per 100 games.`,
      `In ${Math.round((captures / moves.length) * 100)}% of them, the opponent's best reply was a capture: something was left hanging.`,
    ],
    examples: worst.map(({ gameId, j }) => ({ gameId, ply: j.ply, label: moveLabel(j) })),
    training: TRAINING[`mistakes-${phase}`],
  }
}

function missedChancesFinding(
  missed: Array<{ gameId: number; j: MoveJudgement }>,
  analyzedGames: number,
): Finding | null {
  if (missed.length < MIN_EVIDENCE) return null
  const points = missed.reduce((sum, m) => sum + m.j.drop, 0) / 100
  const pointsPer100 = (points / analyzedGames) * 100
  const worst = [...missed].sort((x, y) => y.j.drop - x.j.drop).slice(0, 3)
  return {
    id: 'missed-chances',
    title: 'Missed chances',
    pointsPer100,
    sample: { kind: 'analyzed', games: analyzedGames },
    headline: `You let ${missed.length} chances to punish big opponent mistakes slip away — worth ${pointsPer100.toFixed(1)} points per 100 games.`,
    evidence: [
      `${missed.length} times your opponent's move dropped at least 20 win % and your reply gave most of it back (your own drop ≥ 10).`,
      `Those replies cost ${pointsPer100.toFixed(1)} points per 100 games.`,
    ],
    examples: worst.map(({ gameId, j }) => ({ gameId, ply: j.ply, label: moveLabel(j) })),
    training: TRAINING['missed-chances'],
  }
}

interface Conversion {
  gameId: number
  points: number
  examplePly: number
  exampleSan: string
  peakWin: number
  dropWin: number
}

/**
 * The game reached a winning position (user win % ≥ 85 at a non-terminal
 * position after ply 10). Returns the ply where the win % first fell back
 * below 60 after the peak — the moment the conversion went wrong — or null
 * when the game never got to 85 %.
 */
function conversionOf(game: CoachGame, a: GameAnalysis): Conversion | null {
  let peakPly = -1
  let peakWin = 0
  for (let ply = 11; ply < a.plies.length; ply++) {
    if (a.plies[ply].terminal !== null) continue
    const win = userWinAt(a, ply, game.userColor)
    if (win !== null && win >= 85 && win > peakWin) {
      peakPly = ply
      peakWin = win
    }
  }
  if (peakPly === -1) return null
  for (let ply = peakPly + 1; ply < a.plies.length; ply++) {
    const win = userWinAt(a, ply, game.userColor)
    if (win !== null && win < 60) {
      return {
        gameId: game.id,
        points: game.result === 'draw' ? 0.5 : 1,
        examplePly: ply,
        exampleSan: a.plies[ply].move?.san ?? '—',
        peakWin,
        dropWin: win,
      }
    }
  }
  const last = a.plies[a.plies.length - 1]
  return {
    gameId: game.id,
    points: game.result === 'draw' ? 0.5 : 1,
    examplePly: last.ply,
    exampleSan: last.move?.san ?? '—',
    peakWin,
    dropWin: userWinAt(a, last.ply, game.userColor) ?? peakWin,
  }
}

function conversionFinding(conversions: Conversion[], reached: number, analyzedGames: number): Finding | null {
  if (conversions.length < MIN_EVIDENCE) return null
  const points = conversions.reduce((sum, c) => sum + c.points, 0)
  const pointsPer100 = (points / analyzedGames) * 100
  const worst = [...conversions].sort((x, y) => y.points - x.points || y.peakWin - x.peakWin).slice(0, 3)
  return {
    id: 'conversion',
    title: 'Converting winning positions',
    pointsPer100,
    sample: { kind: 'analyzed', games: analyzedGames },
    headline: `You reached a winning position (≥ 85%) in ${reached} games and failed to win ${conversions.length} of them.`,
    evidence: [
      `${conversions.length} of the ${reached} games where you reached a winning position (≥ 85%) weren't won.`,
      `That costs ${pointsPer100.toFixed(1)} points per 100 games.`,
    ],
    examples: worst.map((c) => ({
      gameId: c.gameId,
      ply: c.examplePly,
      label: `${Math.ceil(c.examplePly / 2)}${c.examplePly % 2 === 1 ? '.' : '...'}${c.exampleSan} (${Math.round(c.peakWin)}% → ${Math.round(c.dropWin)}%)`,
    })),
    training: TRAINING.conversion,
  }
}

function abandonedPlayableFinding(
  abandoned: Array<{ gameId: number; finalPly: number; finalWin: number }>,
  abandonedLost: number,
  analyzedGames: number,
): Finding | null {
  if (abandoned.length < MIN_EVIDENCE) return null
  const points = abandoned.reduce((sum, g) => sum + g.finalWin, 0) / 100
  const pointsPer100 = (points / analyzedGames) * 100
  const worst = [...abandoned].sort((x, y) => y.finalWin - x.finalWin).slice(0, 3)
  const evidence = [
    `${abandoned.length} abandonment losses came in positions with a win chance of at least 30%, worth ${pointsPer100.toFixed(1)} points per 100 games.`,
  ]
  if (abandonedLost > 0) {
    evidence.push(
      `${abandonedLost} more abandonment ${abandonedLost === 1 ? 'loss was' : 'losses were'} already lost (win chance < 30%) — effectively resigned, no points lost.`,
    )
  }
  return {
    id: 'abandoned-playable',
    title: 'Leaving playable games',
    pointsPer100,
    sample: { kind: 'analyzed', games: analyzedGames },
    headline: `You abandoned ${abandoned.length} games while the position still gave you at least a 30% win chance.`,
    evidence,
    examples: worst.map((g) => ({
      gameId: g.gameId,
      ply: g.finalPly,
      label: `final position (win chance ${Math.round(g.finalWin)}%)`,
    })),
    training: TRAINING['abandoned-playable'],
  }
}

function earlyAbandonFinding(games: readonly CoachGame[]): Finding | null {
  const abandoned = games.filter((game) => isAbandonedLoss(game) && userMoveCount(game) <= 10)
  if (abandoned.length < MIN_EVIDENCE) return null
  const points = abandoned.length * 0.5
  const pointsPer100 = (points / games.length) * 100
  const recent = [...abandoned].sort((x, y) => y.playedAt - x.playedAt).slice(0, 3)
  return {
    id: 'early-abandon',
    title: 'Abandoning games early',
    pointsPer100,
    sample: { kind: 'all', games: games.length },
    headline: `You abandoned ${abandoned.length} games within your first 10 moves.`,
    evidence: [
      `${abandoned.length} losses came from abandoning before your 11th move.`,
      'Estimated at 0.5 points each — an early position is roughly equal.',
    ],
    examples: recent.map((game) => ({
      gameId: game.id,
      ply: totalPlies(game),
      label: `abandoned after ${userMoveCount(game)} of your moves`,
    })),
    training: TRAINING['early-abandon'],
  }
}

function timeLossFinding(
  timeLossOk: Array<{ gameId: number; finalPly: number; finalWin: number }>,
  totalTimeLosses: number,
  analyzedGames: number,
): Finding | null {
  if (timeLossOk.length < MIN_EVIDENCE) return null
  const points = timeLossOk.reduce((sum, g) => sum + g.finalWin, 0) / 100
  const pointsPer100 = (points / analyzedGames) * 100
  const worst = [...timeLossOk].sort((x, y) => y.finalWin - x.finalWin).slice(0, 3)
  return {
    id: 'time-losses-ok-position',
    title: 'Time losses in fine positions',
    pointsPer100,
    sample: { kind: 'analyzed', games: analyzedGames },
    headline: `You lost on time ${timeLossOk.length} times in positions with a win chance of at least 50%.`,
    evidence: [
      `${timeLossOk.length} time losses came in positions where your win chance was at least 50%, worth ${pointsPer100.toFixed(1)} points per 100 games.`,
      `In total you lost ${totalTimeLosses} ${totalTimeLosses === 1 ? 'game' : 'games'} on time in this filter.`,
    ],
    examples: worst.map((g) => ({
      gameId: g.gameId,
      ply: g.finalPly,
      label: `final position (win chance ${Math.round(g.finalWin)}%)`,
    })),
    training: TRAINING['time-losses-ok-position'],
  }
}

function openingLineFindings(games: readonly CoachGame[]): Finding[] {
  const findings: Finding[] = []
  const candidates = byOpening(games, 6)
    .filter((row) => row.n >= 15 && row.score < 0.42)
    .map((row) => ({ row, points: (0.5 - row.score) * row.n }))
    .sort((x, y) => y.points - x.points)
    .slice(0, 2)
  for (const { row, points } of candidates) {
    const lineGames = games.filter(
      (game) => game.userColor === row.color && sameMoves(firstMoves(game.pgn, 6), row.moves),
    )
    const recentLosses = lineGames
      .filter((game) => game.result === 'loss')
      .sort((x, y) => y.playedAt - x.playedAt)
      .slice(0, 3)
    const pointsPer100 = (points / games.length) * 100
    findings.push({
      id: `opening-line:${row.color}:${row.moves.join('.')}`,
      title: `As ${row.color === 'white' ? 'White' : 'Black'}: ${formatLine(row.moves)}`,
      pointsPer100,
      sample: { kind: 'all', games: games.length },
      headline: `You score ${Math.round(row.score * 100)}% in this line (${row.wins}W ${row.losses}L ${row.draws}D over ${row.n} games) — ${points.toFixed(1)} expected points below a 50% line.`,
      evidence: [
        `${Math.round(row.score * 100)}% score over ${row.n} games (${row.wins}W ${row.losses}L ${row.draws}D).`,
        `${pointsPer100.toFixed(1)} points per 100 games below a 50% baseline.`,
      ],
      examples: recentLosses.map((game) => ({
        gameId: game.id,
        ply: 6,
        label: new Date(game.playedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      })),
      training: TRAINING['opening-line'],
    })
  }
  return findings
}

/** Renders moves as '1.e4 e5 2.Nf3 Nf6' — numbering restarts at the first move. */
function formatLine(moves: readonly string[]): string {
  return moves.map((move, i) => (i % 2 === 0 ? `${i / 2 + 1}.${move}` : move)).join(' ')
}

function sameMoves(moves: readonly string[], line: readonly string[]): boolean {
  if (moves.length < line.length) return false
  for (let i = 0; i < line.length; i++) {
    if (moves[i] !== line[i]) return false
  }
  return true
}
