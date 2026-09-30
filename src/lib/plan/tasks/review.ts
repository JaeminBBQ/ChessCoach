import type { PlanGame, TaskProvider } from '../types'

/** Review this week's losses — or, when there are none, the last 3 games. */
export const reviewTask: TaskProvider = ({ weekGames, recentGames, reviewedIds }) => {
  const losses = weekGames.filter((game) => game.result === 'loss')
  const targetGames: PlanGame[] = losses.length > 0 ? losses : recentGames.slice(0, 3)
  const done = targetGames.filter((game) => reviewedIds.has(game.id)).length
  return {
    id: 'review-losses',
    title: 'Review your losses',
    why: 'Replaying your own mistakes transfers to your games far better than generic puzzles.',
    target: targetGames.length,
    done,
    unit: 'games',
    links: targetGames
      .filter((game) => !reviewedIds.has(game.id))
      .map((game) => ({ href: `/games/${game.id}`, label: `vs ${game.opponentName ?? 'Unknown'}` })),
  }
}
