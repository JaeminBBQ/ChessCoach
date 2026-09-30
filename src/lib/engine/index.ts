/** Identifies the engine build that produced an analysis; bump it when public/engine changes. */
export const ENGINE_ID = 'stockfish-19-lite-wasm'

/** Public URL of the vendored worker script (its .wasm sits next to it). */
export const ENGINE_WORKER_URL = '/engine/stockfish-19-lite-single.js'

/**
 * Default per-position budget for game analysis. ~150k nodes is roughly depth
 * 14–16 in middlegames: enough to classify club-level mistakes reliably, and
 * about 0.2–0.5 s per position in a browser.
 */
export const DEFAULT_NODES = 150_000
