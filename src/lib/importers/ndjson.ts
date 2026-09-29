/** Yields the JSON objects in a newline-delimited stream, skipping blank lines. */
export async function* parseNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // stream: true lets TextDecoder buffer incomplete UTF-8 sequences, so a
    // multi-byte character split across chunks is decoded correctly.
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) yield JSON.parse(line) as T
    }
  }
  buffer += decoder.decode() // flush any bytes TextDecoder was still buffering
  const last = buffer.trim()
  if (last) yield JSON.parse(last) as T
}
