import { describe, expect, it } from 'vitest'

import { parseNdjson } from './ndjson'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })
}

async function collect<T>(items: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of items) out.push(item)
  return out
}

describe('parseNdjson', () => {
  it('parses lines split across chunks', async () => {
    const items = await collect(parseNdjson<{ a: number }>(streamOf(['{"a":1}\n{"b":', '2}\n{"c":3}\n'])))
    expect(items).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it('ignores blank lines', async () => {
    const items = await collect(parseNdjson<{ a: number }>(streamOf(['{"a":1}\n\n\n{"a":2}\n'])))
    expect(items).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('parses a trailing line without a newline', async () => {
    const items = await collect(parseNdjson<{ a: number }>(streamOf(['{"a":1}\n{"a":2}'])))
    expect(items).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('decodes a UTF-8 character split across chunks', async () => {
    const text = '{"name":"café"}\n'
    const bytes = new TextEncoder().encode(text)
    const streams = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, text.indexOf('é') + 1)) // includes the first byte of é
        controller.enqueue(bytes.slice(text.indexOf('é') + 1))
        controller.close()
      },
    })
    const items = await collect(parseNdjson<{ name: string }>(streams))
    expect(items).toEqual([{ name: 'café' }])
  })
})
