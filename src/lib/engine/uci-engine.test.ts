import { describe, expect, it } from 'vitest'

import { UciEngine, type UciTransport } from './uci-engine'

/** A scripted fake engine: records commands and answers each `go` with canned lines. */
function fakeTransport(answers: string[][]) {
  const sent: string[] = []
  let listener: (line: string) => void = () => {}
  let closed = false
  const transport: UciTransport = {
    send(command) {
      sent.push(command)
      queueMicrotask(() => {
        if (command === 'isready') listener('readyok')
        if (command.startsWith('go')) for (const line of answers.shift() ?? ['bestmove (none)']) listener(line)
      })
    },
    onLine: (fn) => (listener = fn),
    close: () => (closed = true),
  }
  return { transport, sent, isClosed: () => closed }
}

describe('UciEngine', () => {
  it('handshakes, then runs queued searches one at a time in order', async () => {
    const { transport, sent } = fakeTransport([
      ['info depth 1 score cp 10 pv e2e4', 'bestmove e2e4'],
      ['info depth 1 score cp -20 pv e7e5', 'bestmove e7e5'],
    ])
    const engine = new UciEngine(transport)
    const [a, b] = await Promise.all([
      engine.analyze('fen-a', { nodes: 1000 }),
      engine.analyze('fen-b', { nodes: 1000 }),
    ])
    expect(a[0].pv[0]).toBe('e2e4')
    expect(b[0].score).toEqual({ type: 'cp', value: -20 })
    expect(sent).toEqual(['uci', 'isready', 'position fen fen-a', 'go nodes 1000', 'position fen fen-b', 'go nodes 1000'])
  })

  it('sets MultiPV only when it changes and returns the deepest exact line per slot', async () => {
    const { transport, sent } = fakeTransport([
      [
        'info depth 10 multipv 1 score cp 50 pv e2e4',
        'info depth 10 multipv 2 score cp 30 pv d2d4',
        'info depth 11 multipv 1 score cp 70 lowerbound pv e2e4',
        'info depth 11 multipv 1 score cp 60 pv e2e4 e7e5',
        'info depth 11 multipv 2 score cp 25 pv d2d4 d7d5',
        'bestmove e2e4',
      ],
      ['info depth 3 multipv 1 score cp 1 pv a2a3', 'info depth 3 multipv 2 score cp 0 pv h2h3', 'bestmove a2a3'],
    ])
    const engine = new UciEngine(transport)
    const lines = await engine.analyze('fen', { depth: 11, multiPv: 2 })
    await engine.analyze('fen2', { depth: 3, multiPv: 2 })
    expect(lines).toEqual([
      { multipv: 1, depth: 11, score: { type: 'cp', value: 60 }, pv: ['e2e4', 'e7e5'] },
      { multipv: 2, depth: 11, score: { type: 'cp', value: 25 }, pv: ['d2d4', 'd7d5'] },
    ])
    expect(sent.filter((c) => c.startsWith('setoption'))).toEqual(['setoption name MultiPV value 2'])
  })

  it('rejects pending searches when closed', async () => {
    const { transport, isClosed } = fakeTransport([])
    const engine = new UciEngine(transport)
    const pending = engine.analyze('fen', { nodes: 1 })
    engine.close()
    await expect(pending).rejects.toThrow('engine closed')
    await expect(engine.analyze('fen', { nodes: 1 })).rejects.toThrow('engine closed')
    expect(isClosed()).toBe(true)
  })
})
