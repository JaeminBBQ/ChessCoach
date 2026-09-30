import { parseBestMove, parseInfo, type InfoLine, type Score } from './uci'

/**
 * A line-based connection to a UCI engine. The browser implementation wraps a
 * Web Worker; the Node implementation (tests) wraps the same WASM build.
 */
export interface UciTransport {
  send(command: string): void
  onLine(listener: (line: string) => void): void
  close(): void
}

export interface SearchLimits {
  /** Node budget per position. Preferred for batch analysis: deterministic effort across devices. */
  nodes?: number
  depth?: number
  movetime?: number
  /** Number of principal variations to report (1–5). */
  multiPv?: number
}

export interface EngineLine {
  multipv: number
  depth: number
  /** From the side to move's point of view, as UCI reports it. */
  score: Score
  pv: string[]
}

export interface AnalysisEngine {
  /** Analyzes one position; calls are queued and run one at a time. */
  analyze(fen: string, limits: SearchLimits): Promise<EngineLine[]>
  close(): void
}

interface Pending {
  fen: string
  limits: SearchLimits
  resolve: (lines: EngineLine[]) => void
  reject: (error: Error) => void
}

/**
 * Drives a UCI engine over a transport: handshake, a strict one-search-at-a-time
 * queue, and collection of the final (deepest, exact) line per MultiPV slot.
 */
export class UciEngine implements AnalysisEngine {
  private queue: Pending[] = []
  private current: Pending | null = null
  private lines = new Map<number, InfoLine>()
  private multiPv = 1
  private ready: Promise<void>
  private readyResolve!: () => void
  private closed = false

  constructor(private transport: UciTransport) {
    this.ready = new Promise((resolve) => (this.readyResolve = resolve))
    transport.onLine((line) => this.handle(line))
    transport.send('uci')
    transport.send('isready')
  }

  analyze(fen: string, limits: SearchLimits): Promise<EngineLine[]> {
    if (this.closed) return Promise.reject(new Error('engine closed'))
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, limits, resolve, reject })
      void this.ready.then(() => this.next())
    })
  }

  close(): void {
    this.closed = true
    for (const p of [this.current, ...this.queue]) p?.reject(new Error('engine closed'))
    this.current = null
    this.queue = []
    this.transport.close()
  }

  private next(): void {
    if (this.current || this.closed) return
    const job = this.queue.shift()
    if (!job) return
    this.current = job
    this.lines.clear()
    const multiPv = Math.min(Math.max(job.limits.multiPv ?? 1, 1), 5)
    if (multiPv !== this.multiPv) {
      this.transport.send(`setoption name MultiPV value ${multiPv}`)
      this.multiPv = multiPv
    }
    this.transport.send(`position fen ${job.fen}`)
    this.transport.send(`go ${goArgs(job.limits)}`)
  }

  private handle(line: string): void {
    if (line === 'readyok') {
      this.readyResolve()
      return
    }
    if (!this.current) return
    const info = parseInfo(line)
    if (info) {
      // Keep the deepest exact score per slot; bound scores from aspiration
      // windows are only used if nothing exact exists at that depth.
      const prev = this.lines.get(info.multipv)
      if (!prev || info.depth > prev.depth || (info.depth === prev.depth && prev.bound && !info.bound)) {
        this.lines.set(info.multipv, info)
      }
      return
    }
    const best = parseBestMove(line)
    if (!best) return
    const job = this.current
    this.current = null
    const result = [...this.lines.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .map(({ multipv, depth, score, pv }) => ({ multipv, depth, score, pv }))
    job.resolve(result)
    this.next()
  }
}

function goArgs(limits: SearchLimits): string {
  const args: string[] = []
  if (limits.nodes) args.push(`nodes ${limits.nodes}`)
  if (limits.depth) args.push(`depth ${limits.depth}`)
  if (limits.movetime) args.push(`movetime ${limits.movetime}`)
  return args.length ? args.join(' ') : 'depth 12'
}
