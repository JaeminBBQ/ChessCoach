import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { BUCKET_LABELS, matchBucket } from './match'

describe('stray wording (owner choice, 2026-09-30)', () => {
  it('buckets user deviations as strays and labels them that way', () => {
    expect(matchBucket('user-left')).toBe('strayed')
    expect(matchBucket('opponent-left')).toBe('opponent-left')
    expect(matchBucket('book-end')).toBe('followed')
    expect(matchBucket('game-ended')).toBe('followed')
    expect(BUCKET_LABELS.strayed).toBe('strayed')
    expect(BUCKET_LABELS.followed).toBe('followed to the end')
  })

  it('the page and banner copy uses "strayed" for user deviations', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/repertoire/page.tsx', import.meta.url)), 'utf8')
    expect(page).toContain('Where you stray from your book')
    expect(page).toContain('You played vs Book')
    const gamePage = readFileSync(fileURLToPath(new URL('../../app/games/[id]/page.tsx', import.meta.url)), 'utf8')
    expect(gamePage).toContain('You strayed from your book')
    expect(gamePage).toContain('Your opponent left your book')
  })
})
