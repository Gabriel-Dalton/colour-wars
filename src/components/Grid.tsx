'use client';

import { Grid as GridType, Player, GameStatus } from '@/lib/types';
import Cell from './Cell';

interface Props {
  grid: GridType;
  onCellClick: (row: number, col: number) => void;
  myColor: Player | null;
  gameStatus: GameStatus;
  currentTurn: Player;
  isPlacingNow: boolean;
  submitting: boolean;
}

export default function Grid({
  grid,
  onCellClick,
  myColor,
  gameStatus,
  currentTurn,
  isPlacingNow,
  submitting,
}: Props) {
  return (
    <div className="bg-[#B85C42] p-3 rounded-2xl shadow-xl">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            let clickable = false;
            if (!submitting) {
              if (isPlacingNow && cell.owner === null) {
                clickable = true;
              } else if (
                gameStatus === 'playing' &&
                myColor === currentTurn &&
                cell.owner === myColor
              ) {
                clickable = true;
              }
            }

            return (
              <Cell
                key={`${r}-${c}`}
                cell={cell}
                clickable={clickable}
                isMyCircle={cell.owner === myColor}
                onClick={() => onCellClick(r, c)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
