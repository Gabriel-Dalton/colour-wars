'use client';

import { useState } from 'react';
import { Cell as CellType } from '@/lib/types';

const PALETTE = {
  blue: { circle: '#00CFFF', cellBg: '#091520' },
  red:  { circle: '#FF2D55', cellBg: '#190810' },
};

function Dot() {
  return (
    <div
      style={{
        width: '8px',
        height: '8px',
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', width: '100%', height: '100%' }}>
        <Dot /><Dot />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%', height: '100%' }}>
      <Dot />
      <div style={{ display: 'flex', gap: '7px' }}><Dot /><Dot /></div>
    </div>
  );
}

interface Props {
  cell: CellType;
  clickable: boolean;
  isMyCircle: boolean;
  onClick: () => void;
  isExploding?: boolean;
  isReceiving?: boolean;
  isCapturing?: boolean;
}

export default function Cell({ cell, clickable, isMyCircle, onClick, isExploding, isReceiving, isCapturing }: Props) {
  const [hovered, setHovered] = useState(false);
  const palette = cell.owner ? PALETTE[cell.owner] : null;
  const cm = cell.owner === null ? 4 : (cell.value >= 3 ? 3 : 4); // approximate danger threshold
  const isAboutToExplode = cell.owner !== null && cell.value >= 3;

  const circleGlow = cell.owner
    ? isAboutToExplode
      ? cell.owner === 'blue'
        ? '0 0 14px 4px rgba(0,207,255,0.75), 0 0 28px 10px rgba(0,207,255,0.35)'
        : '0 0 14px 4px rgba(255,45,85,0.75), 0 0 28px 10px rgba(255,45,85,0.35)'
      : cell.owner === 'blue'
        ? '0 0 7px 2px rgba(0,207,255,0.45), 0 0 16px 5px rgba(0,207,255,0.18)'
        : '0 0 7px 2px rgba(255,45,85,0.45), 0 0 16px 5px rgba(255,45,85,0.18)'
    : 'none';

  const isHoverActive = clickable && hovered;

  return (
    <div
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette
          ? isHoverActive && isMyCircle
            ? palette.cellBg
            : palette.cellBg
          : isHoverActive
          ? 'rgba(170,170,255,0.04)'
          : '#11112A',
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'background 0.1s ease',
        outline: isHoverActive && !cell.owner ? '1px solid rgba(170,170,255,0.12)' : 'none',
      }}
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => { if (clickable) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
    >
      {cell.owner && palette && (
        <div
          className={
            isExploding ? 'anim-burst'
            : isCapturing ? 'anim-capture'
            : isReceiving ? 'anim-receive'
            : ''
          }
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: palette.circle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: circleGlow,
            transition: isExploding || isReceiving || isCapturing ? 'none' : 'transform 0.1s ease, box-shadow 0.15s ease',
            transform: (!isExploding && !isReceiving && !isCapturing)
              ? isAboutToExplode
                ? 'scale(1.06)'
                : isMyCircle && isHoverActive
                ? 'scale(1.08)'
                : 'scale(1)'
              : undefined,
          }}
        >
          <Dots value={cell.value} />
        </div>
      )}

      {!cell.owner && clickable && (
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: `2px dashed ${isHoverActive ? 'rgba(180,180,255,0.38)' : 'rgba(180,180,255,0.18)'}`,
            transition: 'border-color 0.12s ease',
          }}
        />
      )}
    </div>
  );
}
