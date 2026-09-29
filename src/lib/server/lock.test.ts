import { describe, expect, it } from 'vitest'

import { KeyedLock } from './lock'

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('KeyedLock', () => {
  it('runs same-key tasks strictly one after the other', async () => {
    const lock = new KeyedLock()
    const events: string[] = []
    const first = lock.run('a', async () => {
      events.push('1:start')
      await tick()
      events.push('1:end')
    })
    const second = lock.run('a', async () => {
      events.push('2:start')
      await tick()
      events.push('2:end')
    })
    await Promise.all([first, second])
    expect(events).toEqual(['1:start', '1:end', '2:start', '2:end'])
  })

  it('lets different keys overlap', async () => {
    const lock = new KeyedLock()
    let active = 0
    let maxActive = 0
    const task = (key: string) =>
      lock.run(key, async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await tick()
        active--
      })
    await Promise.all([task('a'), task('b')])
    expect(maxActive).toBe(2)
  })

  it('passes through results and rejections, and the key stays usable', async () => {
    const lock = new KeyedLock()
    await expect(lock.run('a', async () => 42)).resolves.toBe(42)
    await expect(
      lock.run('a', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await expect(lock.run('a', async () => 43)).resolves.toBe(43)
  })
})
