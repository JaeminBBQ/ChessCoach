// Node-only (tests and server-side tooling). Never import from client components.
import { createRequire } from 'node:module'
import path from 'node:path'

import { UciEngine, type UciTransport } from './uci-engine'

interface EmscriptenEngine {
  locateFile: (file: string) => string
  listener?: (line: string) => void
  print?: (line: string) => void
  _isReady?: () => boolean
  ccall?: (name: string, ret: null, types: string[], args: string[], opts: { async: boolean }) => void
}

const ENGINE_JS = path.resolve(process.cwd(), 'public/engine/stockfish-19-lite-single.js')

/** Loads the vendored WASM build in-process and wraps it as a UCI engine. */
export async function createNodeEngine(): Promise<UciEngine> {
  const require = createRequire(import.meta.url)
  const init = require(ENGINE_JS) as () => (wasm: EmscriptenEngine) => Promise<unknown>
  let listener: (line: string) => void = () => {}
  const wasm: EmscriptenEngine = {
    locateFile: (file) => (file.includes('.wasm') ? ENGINE_JS.replace(/\.js$/, '.wasm') : ENGINE_JS),
    listener: (line) => listener(line),
    // Swallow the banner and other stdout prints; UCI output arrives via `listener`.
    print: () => {},
  }
  // Under Node the Emscripten loader sets the global `fetch = null` and installs
  // a global XMLHttpRequest shim to read the .wasm file. Restore both once the
  // engine is up so the host process keeps a working fetch.
  const globals = globalThis as { fetch?: typeof fetch; XMLHttpRequest?: unknown }
  const saved = { fetch: globals.fetch, XMLHttpRequest: globals.XMLHttpRequest }
  try {
    await init()(wasm)
    while (wasm._isReady && !wasm._isReady()) await new Promise((r) => setTimeout(r, 10))
  } finally {
    globals.fetch = saved.fetch
    if (saved.XMLHttpRequest === undefined) delete globals.XMLHttpRequest
    else globals.XMLHttpRequest = saved.XMLHttpRequest
  }

  const transport: UciTransport = {
    send: (command) =>
      setImmediate(() => wasm.ccall?.('command', null, ['string'], [command], { async: /^go\b/.test(command) })),
    onLine: (fn) => {
      listener = fn
    },
    // `quit` would exit the host process under Emscripten; stop searching and drop output instead.
    close: () => {
      listener = () => {}
      wasm.ccall?.('command', null, ['string'], ['stop'], { async: false })
    },
  }
  return new UciEngine(transport)
}
