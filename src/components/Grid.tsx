'use client';

import { useState, useEffect } from 'react';
import { Grid as GridType, Player, GameStatus, GameMode } from '@/lib/types';
import Cell from './Cell';

export interface FlyingOrbData {
  id: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  color: string;
}

// Grid layout constants (must match Cell size + gap + padding in Grid container)
const CELL  = 62;   // 56px cell + 6px gap
const PAD   = 38;   // 10px padding + 28px (half of 56px cell)

function FlyingOrb({ fromRow, fromCol, toRow, toCol, color }: Omit<FlyingOrbData, 'id'>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Double rAF ensures the initial position is painted before the transition fires
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const dx = (toCol - fromCol) * CELL;
  const dy = (toRow - fromRow) * CELL;

  return (
    <div
      style={{
        position: 'absolute',
        left: PAD + fromCol * CELL,
        top:  PAD + fromRow * CELL,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px 3px ${color}`,
        transform: active
          ? `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
          : 'translate(-50%, -50%)',
        transition: active ? 'transform 0.52s cubic-bezier(0.4,0,0.2,1)' : 'none',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    />
  );
}

interface Props {
  grid: GridType;
  onCellClick: (row: number, col: number) => void;
  myColor: Player | null;
  gameStatus: GameStatus;
  currentTurn: Player;
  isPlacingNow: boolean;
  submitting: boolean;
  flyingOrbs?: FlyingOrbData[];
  explodingCells?: Set<string>;
  receivingCells?: Set<string>;
  capturedCells?: Set<string>;
  lastImpactCells?: Set<string>;
  mode?: GameMode;
}

export default function Grid({
  grid,
  onCellClick,
  myColor,
  gameStatus,
  currentTurn,
  isPlacingNow,
  submitting,
  flyingOrbs = [],
  explodingCells = new Set(),
  receivingCells = new Set(),
  capturedCells = new Set(),
  lastImpactCells = new Set(),
  mode = 'classic',
}: Props) {
  const isAnimating = explodingCells.size > 0 || receivingCells.size > 0 || capturedCells.size > 0 || flyingOrbs.length > 0;
  const isActive =
    gameStatus === 'playing' ||
    gameStatus === 'placement_blue' ||
    gameStatus === 'placement_red';

  const boardClass = isActive
    ? currentTurn === 'blue' ? 'anim-board-blue' : 'anim-board-red'
    : '';

  return (
    <div
      className={boardClass}
      style={{
        background: '#0C0C22',
        padding: '10px',
        borderRadius: '10px',
        border: '1px solid rgba(170,170,255,0.07)',
        position: 'relative',
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
            const key = `${r},${c}`;
            let clickable = false;
            if (!submitting) {
              if (isPlacingNow && cell.owner === null) {
                clickable = true;
              } else if (gameStatus === 'playing' && myColor === currentTurn) {
                if (mode === 'open') {
                  // Open mode: click own cells OR any empty cell
                  if (cell.owner === myColor || cell.owner === null) clickable = true;
                } else {
                  // Classic mode: click only your own cells
                  if (cell.owner === myColor) clickable = true;
                }
              }
            }
            return (
              <Cell
                key={key}
                cell={cell}
                clickable={clickable}
                isMyCircle={cell.owner === myColor}
                onClick={() => onCellClick(r, c)}
                isExploding={explodingCells.has(key)}
                isReceiving={receivingCells.has(key)}
                isCapturing={capturedCells.has(key)}
                isLastMove={!isAnimating && lastImpactCells.has(key)}
              />
            );
          })
        )}
      </div>

      {/* Flying orbs layer */}
      {flyingOrbs.map(orb => (
        <FlyingOrb
          key={orb.id}
          fromRow={orb.fromRow}
          fromCol={orb.fromCol}
          toRow={orb.toRow}
          toCol={orb.toCol}
          color={orb.color}
        />
      ))}
    </div>
  );
}
