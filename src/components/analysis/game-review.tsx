'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'

import type { Judgement, KeyMoment, MoveJudgement } from '@/lib/analysis/classify'
import type { PlyAnalysis } from '@/lib/analysis/game-analysis'

export interface GameReviewProps {
  plies: PlyAnalysis[]
  judgements: MoveJudgement[]
  series: { ply: number; whiteWin: number | null }[]
  moments: KeyMoment[]
  userColor: 'white' | 'black'
  /** The ply to open on (deep links); clamped to the game's range. */
  initialPly?: number
  /** Pattern labels for the user's mistakes and missed chances, by ply. */
  motifLabels?: ReadonlyMap<number, string>
  /** Called once when every key moment has been visited, or the last ply when there are none. */
  onReviewComplete?: () => void
}

const navButtonClass =
  'rounded-md border border-black/10 px-2.5 py-1.5 text-sm transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

const MARK: Partial<Record<Judgement, string>> = { inaccuracy: '?!', mistake: '?', blunder: '??' }

function markClass(judgement: Judgement): string {
  if (judgement === 'blunder') return 'text-red-600 dark:text-red-400'
  if (judgement === 'mistake') return 'text-orange-600 dark:text-orange-400'
  if (judgement === 'inaccuracy') return 'text-yellow-600 dark:text-yellow-300'
  return ''
}

function moveNo(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`
}

function round(value: number | null): string {
  return value === null ? '—' : String(Math.round(value))
}

/** Interactive review: board, navigation, move list, eval graph, and key moments. */
export default function GameReview({ plies, judgements, series, moments, userColor, initialPly = 0, motifLabels, onReviewComplete }: GameReviewProps) {
  const maxPly = plies.length - 1
  const [selectedPly, setSelectedPly] = useState(() => Math.min(Math.max(0, initialPly), maxPly))
  const judgementByPly = useMemo(() => new Map(judgements.map((j) => [j.ply, j])), [judgements])

  // Auto-mark reviewed: every key-moment ply visited, or the last ply reached
  // when the game has no key moments.
  const visited = useRef(new Set<number>())
  const completed = useRef(false)
  useEffect(() => {
    if (!onReviewComplete || completed.current) return
    visited.current.add(selectedPly)
    const done =
      moments.length > 0 ? moments.every((moment) => visited.current.has(moment.ply)) : selectedPly >= maxPly
    if (done) {
      completed.current = true
      onReviewComplete()
    }
  }, [selectedPly, moments, maxPly, onReviewComplete])

  const judgement = selectedPly >= 1 ? judgementByPly.get(selectedPly) : undefined
  const position = plies[selectedPly]
  const before = selectedPly >= 1 ? plies[selectedPly - 1] : undefined

  // Last-move highlight and the engine-best arrow (in the position before the
  // selected move, drawn only when the played move wasn't best).
  const squareStyles: Record<string, React.CSSProperties> = {}
  const arrows: { startSquare: string; endSquare: string; color: string }[] = []
  if (position.move?.uci) {
    const from = position.move.uci.slice(0, 2)
    const to = position.move.uci.slice(2, 4)
    const highlight = { backgroundColor: 'rgba(250, 204, 21, 0.4)' }
    squareStyles[from] = highlight
    squareStyles[to] = highlight
  }
  if (judgement && before?.best && judgement.judgement !== 'best') {
    arrows.push({
      startSquare: before.best.uci.slice(0, 2),
      endSquare: before.best.uci.slice(2, 4),
      color: 'rgba(16, 185, 129, 0.75)',
    })
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft') setSelectedPly((ply) => Math.max(0, ply - 1))
      else if (event.key === 'ArrowRight') setSelectedPly((ply) => Math.min(maxPly, ply + 1))
      else if (event.key === 'Home') setSelectedPly(0)
      else if (event.key === 'End') setSelectedPly(maxPly)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxPly])

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full max-w-[520px] shrink-0 lg:sticky lg:top-4">
        <Chessboard
          options={{
            id: 'game-review-board',
            position: position.fen,
            boardOrientation: userColor,
            allowDragging: false,
            allowDrawingArrows: false,
            arrows,
            squareStyles,
            boardStyle: { width: '100%', height: 'auto', aspectRatio: '1 / 1' },
          }}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" className={navButtonClass} onClick={() => setSelectedPly(0)} disabled={selectedPly === 0} aria-label="First move">
            ⏮
          </button>
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setSelectedPly((ply) => Math.max(0, ply - 1))}
            disabled={selectedPly === 0}
            aria-label="Previous move"
          >
            ◀
          </button>
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setSelectedPly((ply) => Math.min(maxPly, ply + 1))}
            disabled={selectedPly === maxPly}
            aria-label="Next move"
          >
            ▶
          </button>
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setSelectedPly(maxPly)}
            disabled={selectedPly === maxPly}
            aria-label="Last move"
          >
            ⏭
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {selectedPly}/{maxPly} · ← → to step
          </span>
        </div>

        <CurrentMovePanel position={position} judgement={judgement} userColor={userColor} motifLabels={motifLabels} />

        <EvalGraph series={series} judgements={judgements} userColor={userColor} selectedPly={selectedPly} onSelect={setSelectedPly} />

        <MoveList plies={plies} judgements={judgements} selectedPly={selectedPly} onSelect={setSelectedPly} />

        <KeyMoments moments={moments} onSelect={setSelectedPly} motifLabels={motifLabels} />
      </div>
    </div>
  )
}

function CurrentMovePanel({
  position,
  judgement,
  userColor,
  motifLabels,
}: {
  position: PlyAnalysis
  judgement: MoveJudgement | undefined
  userColor: 'white' | 'black'
  motifLabels?: ReadonlyMap<number, string>
}) {
  if (position.ply === 0) {
    return (
      <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="text-sm font-medium">Start position</div>
      </div>
    )
  }
  const terminal = position.terminal === 'checkmate' ? 'Checkmate' : position.terminal === 'stalemate' ? 'Stalemate' : null
  const label = judgement ? (judgement.color === userColor ? 'You played' : 'Opponent played') : 'Move'
  const motif = judgement !== undefined ? motifLabels?.get(position.ply) : undefined
  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-sm">
        <span className="font-semibold tabular-nums">
          {moveNo(position.ply)} {judgement?.san ?? position.move?.san}
          {judgement ? MARK[judgement.judgement] ?? '' : ''}
        </span>
        {terminal ? (
          <span className="ml-2 font-medium text-red-600 dark:text-red-400">{terminal}</span>
        ) : (
          judgement && (
            <span className={`ml-2 font-medium ${markClass(judgement.judgement)}`}>
              {judgement.judgement === 'best' ? 'Best move' : judgement.judgement}
            </span>
          )
        )}
        {motif !== undefined && <span className="ml-2 text-zinc-500 dark:text-zinc-400">· {motif}</span>}
      </div>
      {judgement && (
        <div className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
          win chance {round(judgement.winBefore)}% → {round(judgement.winAfter)}%
          {judgement.bestSan &&
            judgement.bestWinAfter !== null &&
            ` · Best was ${judgement.bestSan} (${round(judgement.bestWinAfter)}%)`}
        </div>
      )}
    </div>
  )
}

function EvalGraph({
  series,
  judgements,
  userColor,
  selectedPly,
  onSelect,
}: {
  series: { ply: number; whiteWin: number | null }[]
  judgements: MoveJudgement[]
  userColor: 'white' | 'black'
  selectedPly: number
  onSelect: (ply: number) => void
}) {
  const n = series.length
  const pts = series.map((point) => ({ x: n <= 1 ? 50 : (point.ply / (n - 1)) * 100, y: 100 - (point.whiteWin ?? 50), win: point.whiteWin ?? 50 }))
  const runs = areaRuns(pts)
  const mistakes = judgements.filter((j) => j.color === userColor && (j.judgement === 'mistake' || j.judgement === 'blunder'))

  function jump(event: React.MouseEvent) {
    if (n <= 1) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    onSelect(Math.round(ratio * (n - 1)))
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Evaluation</div>
      <div className="relative mt-2 h-[120px] cursor-pointer" onClick={jump} role="img" aria-label="Evaluation graph: White's win chance per move">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-black/30 dark:text-white/30" />
          {runs.above.map((run, i) => (
            <polygon key={`a${i}`} points={runPolygon(run)} className="fill-sky-400/20 dark:fill-sky-500/25" />
          ))}
          {runs.below.map((run, i) => (
            <polygon key={`b${i}`} points={runPolygon(run)} className="fill-zinc-400/25 dark:fill-zinc-700/50" />
          ))}
          <polyline
            points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="text-zinc-700 dark:text-zinc-300"
          />
          <line
            x1={pts[selectedPly]?.x ?? 0}
            y1="0"
            x2={pts[selectedPly]?.x ?? 0}
            y2="100"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="text-emerald-500"
          />
        </svg>
        {mistakes.map((j) => {
          const pt = pts[j.ply]
          const shape = j.judgement === 'blunder' ? '◆' : '●'
          return (
            <button
              key={j.ply}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelect(j.ply)
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 text-xs ${
                j.judgement === 'blunder' ? 'text-red-600 dark:text-red-400' : 'text-orange-500 dark:text-orange-400'
              }`}
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
              title={`${moveNo(j.ply)} ${j.san} — ${j.judgement === 'blunder' ? 'Blunder' : 'Mistake'} (win chance ${round(j.winBefore)}% → ${round(j.winAfter)}%)`}
              aria-label={`${j.judgement} at move ${moveNo(j.ply)} ${j.san}`}
            >
              {shape}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface GraphPoint {
  x: number
  y: number
  win: number
}

/** Contiguous runs of points with win ≥ 50 (above) and < 50 (below). */
function areaRuns(pts: GraphPoint[]): { above: GraphPoint[][]; below: GraphPoint[][] } {
  const above: GraphPoint[][] = []
  const below: GraphPoint[][] = []
  let run: GraphPoint[] = []
  let runAbove = false
  for (const pt of pts) {
    const isAbove = pt.win >= 50
    if (run.length === 0) {
      run = [pt]
      runAbove = isAbove
    } else if (isAbove === runAbove) {
      run.push(pt)
    } else {
      ;(runAbove ? above : below).push(run)
      run = [pt]
      runAbove = isAbove
    }
  }
  if (run.length > 0) (runAbove ? above : below).push(run)
  return { above, below }
}

/** A polygon for one run, closed against the 50% midline. */
function runPolygon(run: GraphPoint[]): string {
  const first = run[0]
  const last = run[run.length - 1]
  const body = run.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  return `${body} ${last.x.toFixed(2)},50 ${first.x.toFixed(2)},50`
}

function MoveList({
  plies,
  judgements,
  selectedPly,
  onSelect,
}: {
  plies: PlyAnalysis[]
  judgements: MoveJudgement[]
  selectedPly: number
  onSelect: (ply: number) => void
}) {
  const judgementByPly = useMemo(() => new Map(judgements.map((j) => [j.ply, j])), [judgements])
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedPly])

  const rows: { number: number; white?: number; black?: number }[] = []
  for (let ply = 1; ply < plies.length; ply += 2) {
    const row: { number: number; white?: number; black?: number } = { number: ply / 2 + 0.5 }
    row.white = ply
    if (ply + 1 < plies.length) row.black = ply + 1
    rows.push(row)
  }

  function MoveButton({ ply }: { ply: number }) {
    const judgement = judgementByPly.get(ply)
    const san = plies[ply].move?.san ?? '—'
    const mark = judgement ? (MARK[judgement.judgement] ?? '') : ''
    const selected = ply === selectedPly
    return (
      <button
        type="button"
        ref={selected ? selectedRef : undefined}
        onClick={() => onSelect(ply)}
        title={judgement ? judgement.judgement : undefined}
        className={`rounded px-1 py-0.5 text-left font-mono text-sm ${
          judgement ? markClass(judgement.judgement) : ''
        } ${selected ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
      >
        {san}
        {mark}
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        Moves
      </div>
      <div className="max-h-56 overflow-y-auto px-3 py-2">
        <div className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-y-0.5">
          {rows.map((row) => (
            <Fragment key={row.number}>
              <span className="text-right font-mono text-sm text-zinc-400 dark:text-zinc-600">{row.number}.</span>
              {row.white !== undefined ? <MoveButton ply={row.white} /> : <span />}
              {row.black !== undefined ? <MoveButton ply={row.black} /> : <span />}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function KeyMoments({
  moments,
  onSelect,
  motifLabels,
}: {
  moments: KeyMoment[]
  onSelect: (ply: number) => void
  motifLabels?: ReadonlyMap<number, string>
}) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        Key moments
      </div>
      {moments.length === 0 ? (
        <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No big mistakes in this game.</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {moments.map((moment) => (
            <li key={moment.ply}>
              <button
                type="button"
                onClick={() => onSelect(moment.ply)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span
                  className={`font-medium ${
                    moment.kind === 'blunder'
                      ? 'text-red-600 dark:text-red-400'
                      : moment.kind === 'mistake'
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-sky-600 dark:text-sky-400'
                  }`}
                >
                  {moment.kind === 'blunder' ? 'Blunder' : moment.kind === 'mistake' ? 'Mistake' : 'Missed chance'}
                </span>{' '}
                <span className="font-mono tabular-nums">
                  {moveNo(moment.ply)} {moment.san}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {' '}
                  — win chance {round(moment.winBefore)}% → {round(moment.winAfter)}%
                  {moment.bestSan && ` · Best was ${moment.bestSan}`}
                  {motifLabels?.get(moment.ply) && ` · ${motifLabels.get(moment.ply)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
