import type { TaskProvider } from '../types'
import { analyzeTask } from './analyze'
import { lichessPuzzlesTask } from './lichess-puzzles'
import { playTask } from './play'
import { reviewTask } from './review'
import { trainTask } from './train'

/**
 * Every plan task, in display order. Adding a task (e.g. the notation trainer)
 * is one new file in this folder plus one entry here.
 */
export const taskProviders: TaskProvider[] = [playTask, reviewTask, trainTask, analyzeTask, lichessPuzzlesTask]
