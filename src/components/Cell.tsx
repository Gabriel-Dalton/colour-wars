'use client';

import { Cell as CellType, Player } from '@/lib/types';

const COLORS = {
  blue: { circle: '#29C5E6', tile: '#C8EDF5' },
  red: { circle: '#E84040', tile: '#F5C0C0' },
};

function Dots({ value }: { value: number }) {
  const dot = 'w-2.5 h-2.5 rounded-full bg-white shadow-sm';
  if (value === 1) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className={dot} />
      </div>
    );
  }
  if (value === 2) {
    return (
      <div className="flex items-center justify-center gap-1.5 w-full h-full">
        <div className={dot} />
        <div className={dot} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
      <div className={dot} />
      <div className="flex gap-1.5">
        <div className={dot} />
        <div className={dot} />
      </div>
    </div>
  );
}

interface Props {
  cell: CellType;
  clickable: boolean;
  isMyCircle: boolean;
  onClick: () => void;
}

export default function Cell({ cell, clickable, isMyCircle, onClick }: Props) {
  const colors = cell.owner ? COLORS[cell.owner] : null;
  const isAboutToExplode = cell.value === 3;

  return (
    <div
      className={`
        w-14 h-14 rounded-xl flex items-center justify-center select-none
        transition-colors duration-100
        ${colors ? '' : 'bg-[#F2DFC8]'}
        ${clickable && !cell.owner ? 'hover:bg-[#E4CEB0] cursor-pointer' : ''}
        ${clickable && cell.owner ? 'cursor-pointer' : ''}
        ${!clickable ? 'cursor-default' : ''}
      `}
      style={colors ? { backgroundColor: colors.tile } : {}}
      onClick={clickable ? onClick : undefined}
    >
      {cell.owner && colors && (
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center shadow-md
            transition-all duration-100
            ${isMyCircle ? 'active:scale-90' : ''}
            ${isAboutToExplode ? 'animate-pulse' : ''}
          `}
          style={{ backgroundColor: colors.circle }}
        >
          <Dots value={cell.value} />
        </div>
      )}
      {!cell.owner && clickable && (
        <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/50" />
      )}
    </div>
  );
}
