'use client'

import { Chessboard } from 'react-chessboard'

/** The explorer's read-only board with the green arrow for the book move. */
export default function ExplorerBoard({
  id,
  fen,
  orientation,
  arrow,
}: {
  id: string
  fen: string
  orientation: 'white' | 'black'
  arrow: { from: string; to: string } | null
}) {
  return (
    <div className="w-full max-w-[380px]">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          allowDrawingArrows: false,
          arrows: arrow ? [{ startSquare: arrow.from, endSquare: arrow.to, color: 'rgba(16, 185, 129, 0.75)' }] : [],
          boardStyle: { width: '100%', height: 'auto', aspectRatio: '1 / 1' },
        }}
      />
    </div>
  )
}
