import type { TaskProvider } from '../types'

/** Analyze this week's games — shown only while some are still unanalyzed. */
export const analyzeTask: TaskProvider = ({ weekGames, analyzedIds }) => {
  const unanalyzed = weekGames.filter((game) => !analyzedIds.has(game.id)).length
  if (unanalyzed === 0) return null
  return {
    id: 'analyze',
    title: 'Analyze your new games',
    why: 'Mistakes, missed chances, and the weekly scorecard all come from engine analysis. Run Sync & analyze above when new games arrive.',
    target: weekGames.length,
    done: weekGames.length - unanalyzed,
    unit: 'games',
    links: [{ href: '/analyze', label: 'Batch analyzer' }],
  }
}
