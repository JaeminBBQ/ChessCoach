import { ENGINE_WORKER_URL } from './index'
import { UciEngine, type UciTransport } from './uci-engine'

/** Browser-only: runs the vendored Stockfish build in a Web Worker. */
export function createBrowserEngine(): UciEngine {
  const worker = new Worker(ENGINE_WORKER_URL)
  const transport: UciTransport = {
    send: (command) => worker.postMessage(command),
    onLine: (listener) => {
      worker.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') listener(event.data)
      }
    },
    close: () => worker.terminate(),
  }
  return new UciEngine(transport)
}
