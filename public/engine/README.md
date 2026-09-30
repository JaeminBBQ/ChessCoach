# Vendored Stockfish engine

- **Engine:** Stockfish 19, "lite single-threaded" WASM build from [Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg, v19.0.0 (npm `stockfish@19.0.0`, `bin/stockfish-19-lite-single.{js,wasm}`).
- **License:** GPLv3 (`COPYING.txt`). The files are **unmodified** and run as a separate Web Worker; ChessCoach's own code talks to them only over the UCI text protocol.
- **Source:** https://github.com/nmrugg/stockfish.js/tree/v19.0.0 and https://github.com/official-stockfish/Stockfish
- **SHA-256:**
  - `stockfish-19-lite-single.js`: `d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6`
  - `stockfish-19-lite-single.wasm`: `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387`

To upgrade: download the new release's lite-single files, replace them here, update this README, and bump `ENGINE_ID` in `src/lib/engine/index.ts` (old analyses keep their engine id).
