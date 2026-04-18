'use client';

import { Cell as CellType } from '@/lib/types';

const PALETTE = {
  blue: { circle: '#00CFFF', cellBg: '#091420' },
  red:  { circle: '#FF2D55', cellBg: '#180810' },
};

function Dot() {
  return (
    <div
      style={{
        width: '9px',
        height: '9px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.95)',
        boxShadow: '0 0 5px rgba(255,255,255,0.7)',
        flexShrink: 0,
      }}
    />
  );
}

function Dots({ value }: { value: number }) {
  if (value === 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <Dot />
      </div>
    );
  }
  if (value === 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', height: '100%' }}>
        <Dot /><Dot />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%', height: '100%' }}>
      <Dot />
      <div style={{ display: 'flex', gap: '6px' }}><Dot /><Dot /></div>
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
  const palette = cell.owner ? PALETTE[cell.owner] : null;
  const isAboutToExplode = cell.value === 3;
  const glowClass = cell.owner
    ? isAboutToExplode
      ? cell.owner === 'blue' ? 'anim-danger-blue' : 'anim-danger-red'
      : cell.owner === 'blue' ? 'anim-neon-blue' : 'anim-neon-red'
    : '';

  return (
    <div
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette ? palette.cellBg : '#12122A',
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'background 0.1s ease',
      }}
      onClick={clickable ? onClick : undefined}
    >
      {cell.owner && palette && (
        <div
          className={glowClass}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: palette.circle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: isMyCircle ? 'transform 0.08s ease' : undefined,
          }}
        >
          <Dots value={cell.value} />
        </div>
      )}

      {!cell.owner && clickable && (
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            border: '2px dashed rgba(180,180,255,0.2)',
          }}
        />
      )}
    </div>
  );
}
