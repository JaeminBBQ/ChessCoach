'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Chess, type Move, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'

interface TrainCard {
  id: number
  gameId: number
  ply: number
  kind: 'missed' | 'blunder'
  fen: string
  solutionUci: string
  solutionSan: string
  solutionWin: number
  playedSan: string
  playedWin: number
  lastMoveUci: string | null
}

type Attempt = { status: 'correct' } | { status: 'wrong' }
type Grade = 'again' | 'good' | 'easy'

const PROMPTS: Record<TrainCard['kind'], string> = {
  missed: 'Your opponent just made a mistake. Find the move that punishes it.',
  blunder: 'Find a better move than the one you played.',
}

/** One training session: loads the queue, then walks the cards one at a time. */
export default function Trainer() {
  const [cards, setCards] = useState<TrainCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [right, setRight] = useState(0)
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    const response = await fetch('/api/train/queue')
    const { cards } = (await response.json()) as { cards: TrainCard[] }
    setCards(cards)
    setIndex(0)
    setRight(0)
    setBusy(false)
  }

  async function grade(attempt: Attempt, grade: Grade) {
    const card = cards?.[index]
    if (!card || busy) return
    setBusy(true)
    await fetch(`/api/train/cards/${card.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade, correct: attempt.status === 'correct' }),
    })
    if (attempt.status === 'correct') setRight((n) => n + 1)
    setIndex((n) => n + 1)
    setBusy(false)
  }

  if (cards === null) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {busy ? 'Loading…' : 'Start training'}
        </button>
      </div>
    )
  }
  if (cards.length === 0) {
    return <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">All caught up. Nothing to review right now.</p>
  }
  if (index >= cards.length) {
    return (
      <div className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-medium">
          Session done: {right} of {cards.length} right.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/coach" className="underline underline-offset-2">
            Back to Coach →
          </Link>
        </p>
      </div>
    )
  }
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {index + 1} / {cards.length}
      </p>
      <CardView key={cards[index].id} card={cards[index]} onGraded={grade} busy={busy} />
    </div>
  )
}

function CardView({ card, onGraded, busy }: { card: TrainCard; onGraded: (attempt: Attempt, grade: Grade) => void; busy: boolean }) {
  const chess = useMemo(() => new Chess(card.fen), [card])
  const [fen, setFen] = useState(card.fen)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)

  const orientation = card.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const isUserPiece = (pieceType: string) => (orientation === 'white' ? pieceType[0] === 'w' : pieceType[0] === 'b')

  function completeMove(move: Move): void {
    setFen(chess.fen())
    setAttempt(move.lan === card.solutionUci ? { status: 'correct' } : { status: 'wrong' })
  }

  /** Attempts from → to; illegal moves snap back. Promotions ask for a piece first. */
  function tryMove(from: Square, to: Square): boolean {
    if (attempt) return false
    const targets = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to)
    if (targets.length === 0) return false
    if (targets.some((m) => m.promotion)) {
      setPromotion({ from, to })
      return false
    }
    completeMove(chess.move({ from, to }))
    return true
  }

  function onSquareClick(square: Square, pieceType: string | null) {
    if (attempt) return
    if (selected === null) {
      if (pieceType !== null && isUserPiece(pieceType)) setSelected(square)
      return
    }
    if (selected === square) {
      setSelected(null)
      return
    }
    if (tryMove(selected, square)) setSelected(null)
  }

  function promote(piece: 'q' | 'r' | 'b' | 'n') {
    if (!promotion) return
    setPromotion(null)
    completeMove(chess.move({ from: promotion.from, to: promotion.to, promotion: piece }))
  }

  // Highlight the opponent's last move and the selected square.
  const squareStyles: Record<string, React.CSSProperties> = {}
  if (card.lastMoveUci) {
    const highlight = { backgroundColor: 'rgba(250, 204, 21, 0.4)' }
    squareStyles[card.lastMoveUci.slice(0, 2)] = highlight
    squareStyles[card.lastMoveUci.slice(2, 4)] = highlight
  }
  if (selected) squareStyles[selected] = { backgroundColor: 'rgba(14, 165, 233, 0.4)' }

  // After a wrong answer, show the solution as an arrow.
  const arrows =
    attempt?.status === 'wrong'
      ? [
          {
            startSquare: card.solutionUci.slice(0, 2),
            endSquare: card.solutionUci.slice(2, 4),
            color: 'rgba(16, 185, 129, 0.75)',
          },
        ]
      : []

  const buttonClass =
    'rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10'

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="relative w-full max-w-[520px] shrink-0">
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">{PROMPTS[card.kind]}</p>
        <Chessboard
          options={{
            id: `train-card-${card.id}`,
            position: fen,
            boardOrientation: orientation,
            allowDrawingArrows: false,
            arrows,
            squareStyles,
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? tryMove(sourceSquare as Square, targetSquare as Square) : false,
            onSquareClick: ({ piece, square }) => onSquareClick(square as Square, piece?.pieceType ?? null),
            boardStyle: { width: '100%', height: 'auto', aspectRatio: '1 / 1' },
          }}
        />
        {promotion && (
          <div className="absolute inset-x-0 top-1/2 mx-auto w-fit rounded-lg border border-black/10 bg-white p-2 shadow-md dark:border-white/15 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Promote to</div>
            <div className="mt-1 flex gap-2 text-2xl">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => promote(piece)}
                  className="rounded px-2 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  {piece.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm">
          <Link
            href={`/games/${card.gameId}?ply=${card.ply - 1}`}
            className="text-sky-700 underline underline-offset-2 hover:text-foreground dark:text-sky-400"
          >
            See it in the game ↗
          </Link>
        </p>

        {attempt === null && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Move by drag or click. Only legal moves are accepted.
          </p>
        )}

        {attempt?.status === 'correct' && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Correct: {card.solutionSan} (win chance {Math.round(card.solutionWin)}%)
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass} onClick={() => onGraded(attempt, 'good')} disabled={busy}>
                Good
              </button>
              <button type="button" className={buttonClass} onClick={() => onGraded(attempt, 'easy')} disabled={busy}>
                Easy
              </button>
            </div>
          </div>
        )}

        {attempt?.status === 'wrong' && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            <p className="font-medium text-red-700 dark:text-red-400">
              Best was {card.solutionSan} ({Math.round(card.solutionWin)}%). In the game you played {card.playedSan} (
              {Math.round(card.playedWin)}%).
            </p>
            <div className="mt-2">
              <button type="button" className={buttonClass} onClick={() => onGraded(attempt, 'again')} disabled={busy}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
