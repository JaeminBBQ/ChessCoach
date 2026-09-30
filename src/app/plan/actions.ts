'use server'

import { getDb } from '@/lib/db/client'
import { speeds, type Speed } from '@/lib/db/schema'
import { getSettings, isValidTimezone, updateSettings } from '@/lib/server/plan'
import { getCurrentUserId } from '@/lib/server/session'

export type PlanSettingsState = { ok: true } | { ok: false; error: string } | null

export async function savePlanSettingsAction(_prev: PlanSettingsState, formData: FormData): Promise<PlanSettingsState> {
  const db = getDb()
  const userId = getCurrentUserId(db)
  getSettings(db, userId)

  const weeklyGames = Number(formData.get('weeklyGames'))
  if (!Number.isInteger(weeklyGames) || weeklyGames < 1 || weeklyGames > 100) {
    return { ok: false, error: 'Weekly games must be between 1 and 100.' }
  }
  const puzzlesPerWeek = Number(formData.get('puzzlesPerWeek'))
  if (!Number.isInteger(puzzlesPerWeek) || puzzlesPerWeek < 1 || puzzlesPerWeek > 1000) {
    return { ok: false, error: 'Puzzles per week must be between 1 and 1000.' }
  }
  const planSpeed = formData.get('planSpeed')
  if (!speeds.includes(planSpeed as Speed)) {
    return { ok: false, error: 'Pick a plan speed.' }
  }
  const timezone = String(formData.get('timezone') ?? '').trim()
  if (!isValidTimezone(timezone)) return { ok: false, error: 'Pick a valid time zone.' }

  updateSettings(db, userId, { weeklyGames, puzzlesPerWeek, planSpeed: planSpeed as Speed, timezone })
  return { ok: true }
}
