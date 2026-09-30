import type { TaskProvider } from '../types'

/** Solve the weekly quota of puzzles cut from the user's own games. */
export const trainTask: TaskProvider = ({ settings, drillReviews }) => ({
  id: 'train',
  title: `Solve ${settings.puzzlesPerWeek} puzzles from your games`,
  why: 'These are positions you actually got wrong.',
  target: settings.puzzlesPerWeek,
  done: drillReviews,
  unit: 'puzzles',
  links: [{ href: '/train', label: 'Train' }],
})
