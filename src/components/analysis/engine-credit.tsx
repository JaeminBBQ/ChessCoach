/** GPL attribution for the vendored engine; shown wherever analysis runs or is displayed. */
export default function EngineCredit() {
  return (
    <p className="text-xs text-black/50 dark:text-white/50">
      Analysis by{' '}
      <a className="underline" href="https://stockfishchess.org" target="_blank" rel="noreferrer">
        Stockfish 19
      </a>{' '}
      (lite WASM build, GPLv3), running in your browser.{' '}
      <a className="underline" href="https://github.com/nmrugg/stockfish.js/tree/v19.0.0" target="_blank" rel="noreferrer">
        Source
      </a>
    </p>
  )
}
