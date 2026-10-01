'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Chessboard } from 'react-chessboard'

import type { ReplayData, ReplayStep } from '@/lib/analysis/replay'

const navButtonClass =
  'rounded-md border border-black/10 px-2.5 py-1.5 text-sm transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

const modeButtonClass = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'
  }`

/** One finding's examples as chips; clicking one opens its replay panel below (one per finding). */
export default function ReplayBoards({ examples, initialOpen = -1 }: { examples: ReplayData[]; initialOpen?: number }) {
  const [openIndex, setOpenIndex] = useState<number | null>(
    initialOpen >= 0 && initialOpen < examples.length ? initialOpen : null,
  )
  return (
    <div className="mt-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {examples.map((data, i) => (
          <li key={`${data.gameId}-${data.ply}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="font-mono text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
            >
              {data.label}
            </button>
          </li>
        ))}
      </ul>
      {/* Keyed so each example starts fresh (mode and ply) instead of inheriting the previous one's state. */}
      {openIndex !== null && (
        <ReplayPanel key={`${examples[openIndex].gameId}-${examples[openIndex].ply}`} data={examples[openIndex]} />
      )}
    </div>
  )
}

function ReplayPanel({ data }: { data: ReplayData }) {
  const [mode, setMode] = useState<'game' | 'engine'>('game')
  const [index, setIndex] = useState(data.decisionIndex)

  const engine = mode === 'engine' ? data.engine : null
  const steps = engine ? engine.steps : data.game
  const decisionIndex = engine ? 0 : data.decisionIndex
  const step = steps[Math.min(Math.max(index, 0), steps.length - 1)]

  function switchMode(next: 'game' | 'engine') {
    setMode(next)
    setIndex(next === 'game' ? data.decisionIndex : 0)
  }

  function moveBy(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), steps.length - 1))
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveBy(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveBy(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setIndex(decisionIndex)
    }
  }

  // The played move leads to ply p (none for p = 0), the best move is the
  // engine line's first step. Both arrows show whenever the decision position
  // is on screen, in either mode.
  const playedUci = data.ply === 0 ? null : (data.game[data.decisionIndex + 1]?.uci ?? null)
  const bestUci = data.engine?.steps[1]?.uci ?? null
  const isDecision = index === decisionIndex

  const arrows: { startSquare: string; endSquare: string; color: string }[] = []
  const squareStyles: Record<string, React.CSSProperties> = {}
  if (isDecision) {
    if (playedUci) arrows.push({ startSquare: playedUci.slice(0, 2), endSquare: playedUci.slice(2, 4), color: 'rgba(239, 68, 68, 0.7)' })
    if (bestUci) arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: 'rgba(16, 185, 129, 0.75)' })
  } else if (step.uci) {
    const highlight = { backgroundColor: 'rgba(250, 204, 21, 0.4)' }
    squareStyles[step.uci.slice(0, 2)] = highlight
    squareStyles[step.uci.slice(2, 4)] = highlight
  }

  const playedPly = data.ply === 0 ? null : data.game[data.decisionIndex + 1]?.ply ?? null

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="mt-2 max-w-[360px] rounded-lg border border-black/10 p-3 outline-none focus:ring-2 focus:ring-sky-500/50 dark:border-white/10"
    >
      <div className="flex flex-wrap items-center gap-2">
        {data.engine !== null && (
          <span className="inline-flex overflow-hidden rounded-md border border-black/10 dark:border-white/15">
            <button type="button" className={modeButtonClass(mode === 'game')} onClick={() => switchMode('game')}>
              Game
            </button>
            <button
              type="button"
              className={modeButtonClass(mode === 'engine')}
              onClick={() => switchMode('engine')}
            >
              Engine&apos;s line
            </button>
          </span>
        )}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">← → to step</span>
      </div>

      <div className="mt-2">
        <Chessboard
          options={{
            id: `coach-replay-${data.gameId}-${data.ply}`,
            position: step.fen,
            boardOrientation: data.userColor,
            allowDragging: false,
            allowDrawingArrows: false,
            arrows,
            squareStyles,
            boardStyle: { width: '100%', height: 'auto', aspectRatio: '1 / 1' },
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className={navButtonClass}
          onClick={() => setIndex(decisionIndex)}
          disabled={index === decisionIndex}
          aria-label="Decision position"
        >
          ⏮
        </button>
        <button
          type="button"
          className={navButtonClass}
          onClick={() => moveBy(-1)}
          disabled={index === 0}
          aria-label="Previous move"
        >
          ◀
        </button>
        <button
          type="button"
          className={navButtonClass}
          onClick={() => moveBy(1)}
          disabled={index === steps.length - 1}
          aria-label="Next move"
        >
          ▶
        </button>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {moveNo(step.ply)} {step.san ?? 'position'}
        </span>
      </div>

      <MoveList steps={steps} index={index} playedPly={engine ? null : playedPly} onSelect={setIndex} />

      {engine ? (
        <p className="mt-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
          Engine: {moveNo(data.ply)}{engine.bestSan}
          {engine.bestWin !== null && ` — your win chance ${engine.bestWin}%`}
        </p>
      ) : (
        step.win !== null && (
          <p className="mt-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
            Your win chance: {step.win}%
          </p>
        )
      )}

      <p className="mt-1 text-sm">
        <Link
          href={`/games/${data.gameId}?ply=${data.ply}`}
          className="text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
        >
          Open full review →
        </Link>
      </p>
    </div>
  )
}

/** "14." / "14..." for a ply. */
function moveNo(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`
}

function MoveList({
  steps,
  index,
  playedPly,
  onSelect,
}: {
  steps: ReplayStep[]
  index: number
  playedPly: number | null
  onSelect: (index: number) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm">
      {steps.map((step, i) => {
        if (step.san === null) return null
        const selected = i === index
        const played = playedPly !== null && step.ply === playedPly
        return (
          <button
            key={step.ply}
            type="button"
            onClick={() => onSelect(i)}
            className={`rounded px-1 py-0.5 font-mono text-sm ${
              played ? 'text-red-600 dark:text-red-400' : ''
            } ${selected ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
          >
            {moveNo(step.ply)}
            {step.san}
          </button>
        )
      })}
    </div>
  )
}
