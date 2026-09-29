"use client";

import { useState } from "react";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";

import { isValidFen, START_FEN, tryMove } from "@/lib/chess/position";

interface HistoryEntry {
  fen: string;
  san: string;
}

const buttonClass =
  "rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10";

export default function BoardPage() {
  const [fen, setFen] = useState(START_FEN);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [fenInput, setFenInput] = useState("");
  const [fenError, setFenError] = useState<string | null>(null);

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
    if (!targetSquare) return false; // dropped off the board
    const result = tryMove(fen, { from: sourceSquare, to: targetSquare });
    if (!result) return false; // illegal move: snap back
    setFen(result.fen);
    setHistory((prev) => [...prev, { fen: result.fen, san: result.san }]);
    return true;
  };

  const undo = () => {
    if (history.length === 0) return;
    setFen(history.length > 1 ? history[history.length - 2].fen : START_FEN);
    setHistory(history.slice(0, -1));
  };

  const reset = () => {
    setFen(START_FEN);
    setHistory([]);
  };

  const loadFen = () => {
    const value = fenInput.trim();
    if (!isValidFen(value)) {
      setFenError("That's not a valid FEN.");
      return;
    }
    setFenError(null);
    setFen(value);
    setHistory([]);
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Board</h1>

      {/* The board grid self-sizes: width fills the container, aspect-ratio keeps it square. */}
      <div className="w-full max-w-[560px] self-center">
        <Chessboard
          options={{
            id: "sandbox-board",
            position: fen,
            boardOrientation: orientation,
            onPieceDrop,
            boardStyle: { width: "100%", height: "auto", aspectRatio: "1 / 1" },
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
        >
          Flip
        </button>
        <button type="button" className={buttonClass} onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
        <button type="button" className={buttonClass} onClick={reset}>
          Reset
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={fenInput}
          onChange={(e) => setFenInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadFen();
          }}
          placeholder="Paste a FEN…"
          aria-label="FEN"
          className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/15"
        />
        <button type="button" className={buttonClass} onClick={loadFen}>
          Load FEN
        </button>
      </div>
      {fenError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fenError}
        </p>
      )}

      <div>
        <h2 className="text-sm font-medium text-zinc-500">Position (FEN)</h2>
        <p className="break-all font-mono text-xs">{fen}</p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-zinc-500">Moves</h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No moves yet.</p>
        ) : (
          <ol className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm">
            {history.map((move, i) =>
              i % 2 === 0 ? (
                <li key={i}>
                  <span className="text-zinc-400 dark:text-zinc-600">{i / 2 + 1}.</span> {move.san}{" "}
                  {history[i + 1]?.san}
                </li>
              ) : null
            )}
          </ol>
        )}
      </div>
    </main>
  );
}
