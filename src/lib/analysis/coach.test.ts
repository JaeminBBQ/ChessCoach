import { describe, expect, it } from 'vitest'

import type { Platform, Result } from '../db/schema'
import type { Score } from '../engine/uci'
import { winPercent } from './classify'
import { coach, type CoachGame } from './coach'
import type { GameAnalysis, PlyAnalysis } from './game-analysis'

const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })
const win = (score: Score): number => winPercent(score)

/** A 22-ply Ruy Lopez main line, for games that must exceed 10 user moves. */
const RUY = [
  'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1',
  'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5', 'Bc2', 'c5', 'd4', 'Qc7',
]

/** `1.e4 e5 2.Nf3 Nc6 ... 1-0` from SAN tokens (tokenization only, no chess rules). */
function pgnOf(moves: string[]): string {
  const parts: string[] = []
  for (let i = 0; i < moves.length; i += 2) {
    parts.push(`${i / 2 + 1}. ${moves[i]}`)
    if (i + 1 < moves.length) parts.push(moves[i + 1])
  }
  return `${parts.join(' ')} 1-0`
}

/** A FEN whose board holds `pieces` queens (plus the two kings). */
function fenWithPieces(pieces: number): string {
  const board = Array<string>(64).fill('1')
  board[0] = 'k'
  board[63] = 'K'
  for (let i = 0; i < pieces; i++) board[1 + i] = 'Q'
  const ranks: string[] = []
  for (let r = 0; r < 8; r++) {
    ranks.push(board.slice(r * 8, r * 8 + 8).join('').replace(/1+/g, (m) => String(m.length)))
  }
  return `${ranks.join('/')} w - - 0 1`
}

let nextId = 1

function game(overrides: Partial<CoachGame> = {}): CoachGame {
  return {
    id: nextId++,
    platform: 'lichess',
    playedAt: 1_000_000,
    userColor: 'white',
    result: 'win',
    termination: 'mate',
    speed: 'blitz',
    rated: true,
    userRating: 1200,
    opponentRating: 1200,
    opponentName: null,
    accountId: 1,
    pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
    analysis: null,
    ...overrides,
  }
}

interface PlySpec {
  eval?: Score | null
  san?: string
  uci?: string
  bestSan?: string
  bestUci?: string
  bestEval?: Score
  fen?: string
  terminal?: PlyAnalysis['terminal']
}

/**
 * A tiny analysis. By default every position is equal (cp 0) and the played
 * move is also the engine's best, so `classifyMoves` labels everything `best`.
 * Override a ply's eval (the position after that ply) or the best move stored
 * in the position before it to produce specific judgements.
 */
function analysisFor(specs: PlySpec[]): GameAnalysis {
  const plies: PlyAnalysis[] = specs.map((spec, ply) => ({
    ply,
    fen: spec.fen ?? QUIET_FEN,
    move: ply === 0 ? null : { san: spec.san ?? 'e4', uci: spec.uci ?? 'e2e4' },
    eval: spec.eval ?? cp(0),
    terminal: spec.terminal ?? null,
    best: ply === 0
      ? null
      : { uci: spec.bestUci ?? 'e2e4', san: spec.bestSan ?? 'e4', eval: spec.bestEval ?? cp(0) },
    second: null,
    depth: 10,
  }))
  return { version: 1, engine: 'test', nodes: 1, plies }
}

const quietAnalysis = (): GameAnalysis => analysisFor([{}, {}, {}, {}])

/** An analyzed game that produces no findings (all moves judged best, no 85%+ positions). */
function quietGame(result: Result = 'win'): CoachGame {
  return game({ result, analysis: quietAnalysis() })
}

/** A white-user game with one mistake at `ply` (odd): the user drops `from` → `to`. */
function mistakeGame(
  ply: number,
  opts: { from?: Score; to?: Score; bestSan?: string; replySan?: string } = {},
): CoachGame {
  const from = opts.from ?? cp(150)
  const to = opts.to ?? cp(-150)
  const specs = Array<PlySpec>(ply + 1).fill({})
  // The win % before the mistake is reached without an opponent drop, so the
  // mistake is never also a missed chance.
  specs[ply - 2] = { eval: from }
  specs[ply - 1] = { eval: from, bestSan: opts.bestSan ?? 'Nc3', bestUci: 'b1c3' }
  specs[ply] = { eval: to, san: 'Qd7', uci: 'd8d7', ...(opts.replySan ? { bestSan: opts.replySan } : {}) }
  return game({ analysis: analysisFor(specs) })
}

/** A black-user game with one blunder at `ply` (even): White's eval rises under the user. */
function blackMistakeGame(ply: number, fen?: string): CoachGame {
  const specs = Array<PlySpec>(ply + 1).fill({})
  specs[ply - 1] = { eval: cp(0), bestSan: 'Nc3', bestUci: 'b1c3', fen }
  // In a custom endgame FEN the default e2e4 reply isn't legal; Kg1 is (the
  // white king stands on h1). The motif detector replays the reply.
  specs[ply] = { eval: cp(400), san: 'Qd7', uci: 'd8d7', fen, ...(fen ? { bestSan: 'Kg1', bestUci: 'h1g1' } : {}) }
  return game({ userColor: 'black', analysis: analysisFor(specs) })
}

/** A loss by abandonment, with the given final-position eval for the user (White). */
function abandonedGame(platform: Platform, termination: string, finalEval: Score): CoachGame {
  return game({
    platform,
    result: 'loss',
    termination,
    pgn: pgnOf(RUY),
    analysis: analysisFor([{}, {}, {}, { eval: finalEval }]),
  })
}

describe('coach mistakes by phase', () => {
  it('uses ply ≤ 20 as the opening and the piece count (6 vs 7) afterwards', () => {
    const games = [...Array(20)].map(() => quietGame())
    for (let i = 0; i < 5; i++) games.push(blackMistakeGame(20)) // opening: i ≤ 20
    for (let i = 0; i < 5; i++) games.push(blackMistakeGame(22, fenWithPieces(7))) // middlegame
    for (let i = 0; i < 5; i++) games.push(blackMistakeGame(22, fenWithPieces(6))) // endgame

    const { findings, analyzedGames } = coach(games)
    const byId = new Map(findings.map((f) => [f.id, f]))
    expect(analyzedGames).toBe(35)
    expect(byId.get('mistakes-opening')?.evidence[0]).toContain('5 mistakes')
    expect(byId.get('mistakes-middlegame')?.evidence[0]).toContain('5 mistakes')
    expect(byId.get('mistakes-endgame')?.evidence[0]).toContain('5 mistakes')
    expect(byId.get('mistakes-opening')?.title).toBe('Mistakes in the opening')
    // The pattern bullet names the top 2 motifs (all fixtures resolve to 'other').
    expect(byId.get('mistakes-opening')?.evidence[3]).toBe('Mostly: Other (positional or deeper tactic) (100%).')
  })

  it("reports the share of mistakes where the opponent's best reply was a capture", () => {
    const games = [...Array(20)].map(() => quietGame())
    // Two mistakes leave something hanging (the reply captures). The user's own
    // best move being a capture must NOT count (regression: T011 review).
    for (let i = 0; i < 5; i++) games.push(mistakeGame(5, { bestSan: 'Bxc6', replySan: i < 2 ? 'Nxe5' : 'Nc3' }))

    const finding = coach(games).findings.find((f) => f.id === 'mistakes-opening')
    expect(finding).toBeDefined()
    expect(finding!.evidence[2]).toContain('In 40%')
    expect(finding!.sample).toEqual({ kind: 'analyzed', games: 25 })
    expect(finding!.examples).toHaveLength(3)
    expect(finding!.examples[0].ply).toBe(5)
  })
})

describe('coach missed chances', () => {
  it('counts a reply that fails to punish an opponent drop of ≥ 20 (own drop ≥ 10, not best)', () => {
    const games = [...Array(20)].map(() => quietGame())
    // Ply 6 (opponent, Black): White's eval jumps 50 → 81, a drop of 31 from Black's view.
    // Ply 7 (user, White): the reply gives most of it back (81 → 63).
    const drop = win(cp(400)) - win(cp(150))
    for (let i = 0; i < 5; i++) {
      const specs = Array<PlySpec>(8).fill({})
      specs[5] = { eval: cp(0) }
      specs[6] = { eval: cp(400), bestSan: 'Nc3', bestUci: 'b1c3' }
      specs[7] = { eval: cp(150), san: 'Qd7', uci: 'd8d7' }
      games.push(game({ analysis: analysisFor(specs) }))
    }
    // Not a miss: the user plays the best move.
    {
      const specs = Array<PlySpec>(8).fill({})
      specs[6] = { eval: cp(400) }
      games.push(game({ analysis: analysisFor(specs) }))
    }
    // Not a miss: the user's own drop is below 10.
    {
      const specs = Array<PlySpec>(8).fill({})
      specs[6] = { eval: cp(400), bestSan: 'Nc3', bestUci: 'b1c3' }
      specs[7] = { eval: cp(390), san: 'Qd7', uci: 'd8d7' }
      games.push(game({ analysis: analysisFor(specs) }))
    }
    // Not a miss: the opponent's drop is below 20.
    {
      const specs = Array<PlySpec>(8).fill({})
      specs[6] = { eval: cp(50), bestSan: 'Nc3', bestUci: 'b1c3' }
      specs[7] = { eval: cp(0), san: 'Qd7', uci: 'd8d7' }
      games.push(game({ analysis: analysisFor(specs) }))
    }

    const finding = coach(games).findings.find((f) => f.id === 'missed-chances')
    expect(finding).toBeDefined()
    expect(finding!.evidence[0]).toContain('5 times')
    expect(finding!.evidence[2]).toBe('Mostly: Other (positional or deeper tactic) (100%).')
    expect(finding!.pointsPer100).toBeCloseTo((5 * drop) / 28, 6) // 20 quiet + 8 crafted games analyzed
  })
})

describe('coach conversion', () => {
  it('counts games at ≥ 85% after ply 10 that were not won: loss 1, draw 0.5, wins excluded', () => {
    const games = [...Array(20)].map(() => quietGame())
    const conversionGame = (result: Result): CoachGame => {
      const specs = Array<PlySpec>(14).fill({})
      specs[11] = { eval: mate(5) } // 100% for White
      specs[12] = { eval: cp(0) } // first drop below 60 after the peak
      return game({ result, analysis: analysisFor(specs) })
    }
    for (let i = 0; i < 3; i++) games.push(conversionGame('loss'))
    for (let i = 0; i < 2; i++) games.push(conversionGame('draw'))
    games.push(conversionGame('win'))
    // Reached 85% only at ply 9 — before ply 11, so not counted at all.
    {
      const specs = Array<PlySpec>(14).fill({})
      specs[9] = { eval: mate(5) }
      games.push(game({ result: 'loss', analysis: analysisFor(specs) }))
    }

    const finding = coach(games).findings.find((f) => f.id === 'conversion')
    expect(finding).toBeDefined()
    expect(finding!.evidence[0]).toBe('5 of the 6 games where you reached a winning position (≥ 85%) weren\'t won.')
    expect(finding!.pointsPer100).toBeCloseTo((4 / 27) * 100, 6)
    // Losses first, then draws.
    expect(finding!.examples).toHaveLength(3)
    expect(finding!.examples[0].ply).toBe(12)
  })
})

describe('coach abandonment', () => {
  it('counts Chess.com abandoned and Lichess timeout losses at ≥ 30%, not Lichess outoftime', () => {
    const games = [...Array(20)].map(() => quietGame())
    for (let i = 0; i < 5; i++) games.push(abandonedGame('lichess', 'timeout', cp(0)))
    for (let i = 0; i < 2; i++) games.push(abandonedGame('chesscom', 'abandoned', cp(0)))
    games.push(abandonedGame('lichess', 'timeout', cp(-400))) // already lost
    games.push(abandonedGame('lichess', 'outoftime', cp(0))) // a time loss, not abandonment
    games.push(abandonedGame('chesscom', 'timeout', cp(-400))) // time loss in a lost position
    // A win can't be an abandonment.
    games.push(game({ result: 'win', termination: 'timeout', pgn: pgnOf(RUY), analysis: quietAnalysis() }))
    // Without an analysis the final win % is unknown; invisible to this detector.
    games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY) }))

    const { findings, analyzedGames, totalGames } = coach(games)
    expect(findings.map((f) => f.id)).toEqual(['abandoned-playable'])
    const finding = findings[0]
    expect(analyzedGames).toBe(31)
    expect(totalGames).toBe(32)
    expect(finding.sample).toEqual({ kind: 'analyzed', games: 31 })
    expect(finding.pointsPer100).toBeCloseTo((7 * 0.5 / 31) * 100, 6)
    expect(finding.evidence[1]).toContain('1 more abandonment loss was already lost')
    expect(finding.evidence[1]).toContain('effectively resigned, no points lost')
  })
})

describe('coach time losses', () => {
  it('counts time losses at ≥ 50% and reports the total time losses across all games', () => {
    const games = [...Array(20)].map(() => quietGame())
    for (let i = 0; i < 5; i++) {
      games.push(game({ result: 'loss', termination: 'outoftime', pgn: pgnOf(RUY), analysis: quietAnalysis() }))
    }
    games.push(
      game({
        result: 'loss',
        termination: 'outoftime',
        pgn: pgnOf(RUY),
        analysis: analysisFor([{}, {}, {}, { eval: cp(-400) }]),
      }),
    )
    games.push(
      game({ platform: 'chesscom', result: 'loss', termination: 'timeout', pgn: pgnOf(RUY), analysis: quietAnalysis() }),
    )
    games.push(game({ result: 'loss', termination: 'outoftime', pgn: pgnOf(RUY) }))

    const finding = coach(games).findings.find((f) => f.id === 'time-losses-ok-position')
    expect(finding).toBeDefined()
    expect(finding!.sample).toEqual({ kind: 'analyzed', games: 27 })
    expect(finding!.pointsPer100).toBeCloseTo((6 * 0.5 / 27) * 100, 6)
    expect(finding!.evidence[1]).toBe('In total you lost 8 games on time in this filter.')
  })
})

describe('coach early abandon', () => {
  it('counts abandonment losses within 10 user moves (10 yes, 11 no)', () => {
    const games: CoachGame[] = []
    for (let i = 0; i < 5; i++) {
      games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 20)) })) // 10 as White
    }
    games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 22)) })) // 11 → excluded
    games.push(game({ userColor: 'black', result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 21)) })) // 10 as Black

    const { findings, needsAnalysis } = coach(games)
    expect(needsAnalysis).toBe(true) // no analyses at all, but results-only findings still show
    expect(findings.map((f) => f.id)).toEqual(['early-abandon'])
    const finding = findings[0]
    expect(finding.sample).toEqual({ kind: 'all', games: 7 })
    expect(finding.pointsPer100).toBeCloseTo((6 * 0.5 / 7) * 100, 6)
    expect(finding.evidence[0]).toContain('6 losses')
    expect(finding.examples[0].ply).toBe(20) // the last ply of the game
  })
})

describe('coach opening lines', () => {
  it('emits lines with n ≥ 15 and score < 0.42, at most the two worst by points', () => {
    const line14 = pgnOf(['e4', 'e5', 'Nf3', 'Nf6', 'd4', 'exd4'])
    const lineScore = pgnOf(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'])
    const lineC = pgnOf(['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6'])
    const lineD = pgnOf(['Nf3', 'd5', 'g3', 'c5', 'Bg2', 'Nc6'])
    let playedAt = 1000
    const push = (pgn: string, result: Result): void => {
      games.push(game({ userColor: 'black', pgn, result, termination: result === 'win' ? 'mate' : 'resign', playedAt: playedAt++ }))
    }
    const games: CoachGame[] = []
    // 14 games with a terrible score → gated by n.
    for (let i = 0; i < 14; i++) push(line14, 'loss')
    // 15 games scoring 0.47 (7W 8L) → gated by score.
    for (let i = 0; i < 7; i++) push(lineScore, 'win')
    for (let i = 0; i < 8; i++) push(lineScore, 'loss')
    // 15 games scoring 0.4 (6W 9L) → emitted.
    for (let i = 0; i < 6; i++) push(lineC, 'win')
    for (let i = 0; i < 9; i++) push(lineC, 'loss')
    // 15 games scoring 0.3 (4W 1D 10L) → emitted, the worst.
    for (let i = 0; i < 4; i++) push(lineD, 'win')
    push(lineD, 'draw')
    for (let i = 0; i < 10; i++) push(lineD, 'loss')

    const { findings, totalGames } = coach(games)
    expect(totalGames).toBe(59)
    const lines = findings.filter((f) => f.id.startsWith('opening-line:'))
    expect(lines.map((f) => f.id)).toEqual([
      'opening-line:black:Nf3.d5.g3.c5.Bg2.Nc6',
      'opening-line:black:c4.e5.Nc3.Nf6.Nf3.Nc6',
    ])
    expect(lines[0].pointsPer100).toBeCloseTo(((0.5 - 0.3) * 15 / 59) * 100, 6)
    expect(lines[0].sample).toEqual({ kind: 'all', games: 59 })
    expect(lines[0].title).toBe('As Black: 1.Nf3 d5 2.g3 c5 3.Bg2 Nc6')
    // The 3 most recent losses in the line, each at the end of the 6-ply line.
    expect(lines[0].examples).toHaveLength(3)
    expect(lines[0].examples.every((ex) => ex.ply === 6)).toBe(true)
    expect(lines[0].examples[0].gameId).toBeGreaterThan(lines[0].examples[1].gameId)
  })
})

describe('coach ranking and gates', () => {
  it('ranks findings by pointsPer100, most expensive first', () => {
    const games = [...Array(20)].map(() => quietGame())
    for (let i = 0; i < 5; i++) games.push(mistakeGame(5, { from: cp(400), to: cp(-400) })) // 5 blunders
    for (let i = 0; i < 5; i++) {
      games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 20)) })) // early abandons
    }

    const { findings, totalGames } = coach(games)
    const blunderDrop = win(cp(400)) - win(cp(-400))
    const mistakesPer100 = (5 * blunderDrop) / 25 // points/analyzedGames × 100
    const earlyPer100 = (2.5 / totalGames) * 100
    expect(mistakesPer100).toBeGreaterThan(earlyPer100)
    expect(findings.map((f) => f.id)).toEqual(['mistakes-opening', 'early-abandon'])
  })

  it('drops findings with fewer than 5 moves or games behind them', () => {
    const games = [...Array(20)].map(() => quietGame())
    for (let i = 0; i < 3; i++) games.push(mistakeGame(5))
    for (let i = 0; i < 3; i++) {
      games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 20)) }))
    }

    const { findings, needsAnalysis } = coach(games)
    expect(needsAnalysis).toBe(false)
    expect(findings).toEqual([])
  })

  it('requires 20 analyzed games for engine-based findings; results-only ones still show', () => {
    const makeGames = (): CoachGame[] => {
      const games = [...Array(14)].map(() => quietGame())
      for (let i = 0; i < 5; i++) games.push(mistakeGame(5))
      for (let i = 0; i < 5; i++) {
        games.push(game({ result: 'loss', termination: 'timeout', pgn: pgnOf(RUY.slice(0, 20)) }))
      }
      return games
    }

    const under = coach(makeGames()) // 19 analyzed
    expect(under.analyzedGames).toBe(19)
    expect(under.needsAnalysis).toBe(true)
    expect(under.findings.map((f) => f.id)).toEqual(['early-abandon'])

    const over = coach([...makeGames(), quietGame()]) // 20 analyzed
    expect(over.needsAnalysis).toBe(false)
    expect(over.findings.map((f) => f.id)).toEqual(['early-abandon', 'mistakes-opening'])
  })
})
