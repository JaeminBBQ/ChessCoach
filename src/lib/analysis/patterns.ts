import { classifyMoves } from './classify'
import { isMissedChance, phaseAt } from './coach'
import type { GameAnalysis } from './game-analysis'
import { lichessTheme, lichessThemeUrl, mistakeMotif, missedMotif, MOTIF_LABEL, type Motif } from './motifs'

export interface PatternRow {
  motif: Motif
  label: string
  count: number
  /** count / table total, 0..1. */
  share: number
  pointsPer100: number
}

export interface PatternBreakdown {
  analyzedGames: number
  /** User mistakes and blunders (missed chances excluded), most common first. */
  mistakes: PatternRow[]
  /** Missed chances, most common first. */
  missed: PatternRow[]
}

/** The slice of a game the pattern detectors need. */
export interface PatternGame {
  userColor: 'white' | 'black'
  analysis: GameAnalysis | null
}

/**
 * The mistake-pattern tables for the Coach page: over all analyzed user
 * mistakes (missed chances excluded) and missed chances in the given games.
 * `pointsPer100` is the sum of the moves' win-% drops / 100 / analyzed games × 100.
 */
export function mistakePatterns(games: readonly PatternGame[]): PatternBreakdown {
  const analyzed = games.filter((game) => game.analysis !== null)
  const mistakes = new Map<Motif, { count: number; points: number }>()
  const missed = new Map<Motif, { count: number; points: number }>()
  for (const game of analyzed) {
    const a = game.analysis!
    const judgements = classifyMoves(a)
    const byPly = new Map(judgements.map((j) => [j.ply, j]))
    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      const previous = byPly.get(j.ply - 1)
      if (isMissedChance(previous, j)) {
        const motif = missedMotif(a, j.ply).motif
        bump(missed, motif, j.drop)
      } else if (j.judgement === 'mistake' || j.judgement === 'blunder') {
        const motif = mistakeMotif(a, j.ply).motif
        bump(mistakes, motif, j.drop)
      }
    }
  }
  const rows = (map: Map<Motif, { count: number; points: number }>): PatternRow[] => {
    const total = [...map.values()].reduce((sum, entry) => sum + entry.count, 0)
    const analyzedGames = analyzed.length
    return [...map.entries()]
      .map(([motif, entry]) => ({
        motif,
        label: MOTIF_LABEL[motif],
        count: entry.count,
        share: total === 0 ? 0 : entry.count / total,
        pointsPer100: analyzedGames === 0 ? 0 : (entry.points / 100 / analyzedGames) * 100,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }
  return { analyzedGames: analyzed.length, mistakes: rows(mistakes), missed: rows(missed) }
}

function bump(map: Map<Motif, { count: number; points: number }>, motif: Motif, drop: number): void {
  const entry = map.get(motif) ?? { count: 0, points: 0 }
  entry.count++
  entry.points += drop
  map.set(motif, entry)
}

/**
 * "Your most expensive pattern is *Left a piece hanging*: 90 mistakes,
 * 14.6 points per 100 games." — the most expensive row across both tables.
 */
export function patternTakeaway(breakdown: PatternBreakdown): string | null {
  const rows = [...breakdown.mistakes.map((row) => ({ ...row, kind: 'mistakes' as const })), ...breakdown.missed.map((row) => ({ ...row, kind: 'missed chances' as const }))]
  if (rows.length === 0) return null
  const top = rows.reduce((best, row) => (row.pointsPer100 > best.pointsPer100 ? row : best), rows[0])
  return `Your most expensive pattern is ${top.label}: ${top.count} ${top.kind}, ${top.pointsPer100.toFixed(1)} points per 100 games.`
}

/** The counts of each motif inside a finding (mistakes-{phase} or missed-chances). */
export function patternCounts(findingId: string, games: readonly PatternGame[]): Map<Motif, number> {
  const counts = new Map<Motif, number>()
  const phase = findingId.startsWith('mistakes-') ? findingId.slice('mistakes-'.length) : null
  for (const game of games) {
    const a = game.analysis
    if (!a) continue
    const judgements = classifyMoves(a)
    const byPly = new Map(judgements.map((j) => [j.ply, j]))
    for (const j of judgements) {
      if (j.color !== game.userColor) continue
      if (phase !== null) {
        // Missed chances are counted in their own table, not as mistakes.
        if (isMissedChance(byPly.get(j.ply - 1), j)) continue
        if ((j.judgement === 'mistake' || j.judgement === 'blunder') && phaseAt(a.plies[j.ply - 1].fen, j.ply) === phase) {
          const motif = mistakeMotif(a, j.ply).motif
          counts.set(motif, (counts.get(motif) ?? 0) + 1)
        }
      } else if (isMissedChance(byPly.get(j.ply - 1), j)) {
        const motif = missedMotif(a, j.ply).motif
        counts.set(motif, (counts.get(motif) ?? 0) + 1)
      }
    }
  }
  return counts
}

export interface TopPattern {
  motif: Motif
  label: string
  count: number
  /** Lichess theme to practice it, or null (hidden link). */
  theme: string | null
  themeUrl: string | null
}

/** Short plural names for per-game metric labels and scorecard columns. */
export const MOTIF_METRIC_LABEL: Record<Motif, string> = {
  allowedMate: 'Allowed mates',
  hangingPiece: 'Hanging pieces',
  fork: 'Forks',
  missedMate: 'Missed mates',
  missedFreePiece: 'Missed free pieces',
  missedFork: 'Missed forks',
  lostMaterial: 'Material losses',
  missedMaterial: 'Missed combinations',
  kingAttack: 'King attacks',
  missedKingAttack: 'Missed king attacks',
  other: 'Other mistakes',
}

/**
 * The most common named pattern inside a finding, or null when it has none.
 * `other` never wins: it names no pattern to practice.
 */
export function topPattern(findingId: string, games: readonly PatternGame[]): TopPattern | null {
  const counts = patternCounts(findingId, games)
  let best: { motif: Motif; count: number } | null = null
  for (const [motif, count] of counts) {
    if (motif === 'other') continue
    if (best === null || count > best.count) best = { motif, count }
  }
  if (best === null || best.count === 0) return null
  const tag = { motif: best.motif }
  return {
    ...best,
    label: MOTIF_LABEL[best.motif],
    theme: lichessTheme(tag),
    themeUrl: lichessThemeUrl(tag),
  }
}
