'use client'

import { useCallback, useEffect, useRef } from 'react'

import { analyzeGame, type GameAnalysis } from '@/lib/analysis/game-analysis'
import { createBrowserEngine } from '@/lib/engine/browser'
import { DEFAULT_NODES, ENGINE_ID } from '@/lib/engine'
import type { UciEngine } from '@/lib/engine/uci-engine'

/**
 * Lazily starts one Stockfish worker for the component's lifetime and exposes
 * `analyzeAndSave(gameId)`: fetch the PGN, analyze every position in the
 * browser, and store the result on the server.
 */
export function useAnalyzer() {
  const engineRef = useRef<UciEngine | null>(null)

  useEffect(() => () => engineRef.current?.close(), [])

  return useCallback(
    async (
      gameId: number,
      opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
    ): Promise<GameAnalysis> => {
      engineRef.current ??= createBrowserEngine()
      const res = await fetch(`/api/games/${gameId}`)
      if (!res.ok) throw new Error(`Could not load game ${gameId}`)
      const { game } = (await res.json()) as { game: { pgn: string } }
      const analysis = await analyzeGame(game.pgn, engineRef.current, {
        engineId: ENGINE_ID,
        nodes: DEFAULT_NODES,
        signal: opts.signal,
        onProgress: opts.onProgress,
      })
      const save = await fetch(`/api/games/${gameId}/analysis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysis),
      })
      if (!save.ok) throw new Error(`Saving analysis failed: ${(await save.json()).error ?? save.status}`)
      return analysis
    },
    [],
  )
}
