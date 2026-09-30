import type { TaskProvider } from '../types'

/** Play the weekly quota of games at the plan speed. */
export const playTask: TaskProvider = ({ settings, weekGames }) => {
  const { weeklyGames, planSpeed } = settings
  const why =
    "Slower games leave time for a blunder check before every move. That's where your points go." +
    (planSpeed === 'rapid' ? ' Try 10+0 or 15+10.' : '')
  return {
    id: 'play',
    title: `Play ${weeklyGames} ${planSpeed} games`,
    why,
    target: weeklyGames,
    done: weekGames.filter((game) => game.speed === planSpeed).length,
    unit: 'games',
    links: [],
  }
}
