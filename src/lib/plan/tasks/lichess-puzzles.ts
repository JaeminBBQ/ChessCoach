import type { TaskProvider } from '../types'

/** Lichess theme keys as readable names, for the task title. */
const THEME_NAMES: Record<string, string> = {
  hangingPiece: 'hanging piece',
  fork: 'fork',
  mate: 'mate',
  advantage: 'advantage',
  exposedKing: 'exposed king',
}

/** Do themed Lichess puzzles for the focus's top pattern. Not auto-trackable, so it carries a manual Done toggle. */
export const lichessPuzzlesTask: TaskProvider = ({ pattern, manualChecks }) => {
  if (pattern === null || pattern.theme === null || pattern.themeUrl === null) return null
  const name = THEME_NAMES[pattern.theme] ?? pattern.theme.replace(/[A-Z]/g, (ch) => ` ${ch.toLowerCase()}`)
  return {
    id: 'lichess-theme-puzzles',
    title: `Do 15 ${name} puzzles on Lichess`,
    why: `Puzzles that drill the pattern you fall for most: ${pattern.label.toLowerCase()}. Nothing to sync — tick it when done.`,
    target: 15,
    done: manualChecks.has('lichess-theme-puzzles') ? 1 : 0,
    unit: 'puzzles',
    links: [{ href: pattern.themeUrl, label: 'Lichess theme' }],
    manual: true,
  }
}
