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
  const isActive =
    gameStatus === 'playing' ||
    gameStatus === 'placement_blue' ||
    gameStatus === 'placement_red';
  const boardShadow = isActive
    ? currentTurn === 'blue'
      ? '0 0 28px 6px rgba(0,207,255,0.14)'
      : '0 0 28px 6px rgba(255,45,85,0.14)'
    : 'none';

  return (
    <div
      style={{
        background: '#0C0C22',
        padding: '10px',
        borderRadius: '10px',
        border: '1px solid rgba(170,170,255,0.07)',
        boxShadow: boardShadow,
        transition: 'box-shadow 0.6s ease',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px',
        }}
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
                (cell.owner === myColor || cell.owner === null)
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
