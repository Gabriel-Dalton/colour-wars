'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createInitialGrid } from '@/lib/gameLogic';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return (
    chars[Math.floor(Math.random() * chars.length)] +
    chars[Math.floor(Math.random() * chars.length)]
  );
}

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('cw_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cw_player_id', id);
  }
  return id;
}

export default function Home() {
  const [letter1, setLetter1] = useState('');
  const [letter2, setLetter2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const createGame = async () => {
    setLoading(true);
    setError('');
    const playerId = getOrCreatePlayerId();
    const roomId = generateRoomCode();
    const grid = createInitialGrid();

    const { error: dbError } = await supabase.from('games').insert({
      id: roomId,
      status: 'waiting',
      blue_player_id: playerId,
      red_player_id: null,
      current_turn: 'blue',
      grid,
      winner: null,
      move_count: 0,
    });

    if (dbError) {
      setError('Failed to create game. Check your connection.');
      setLoading(false);
      return;
    }
    router.push(`/game/${roomId}`);
  };

  const joinGame = () => {
    const code = (letter1 + letter2).toUpperCase();
    if (code.length !== 2) {
      setError('ENTER BOTH LETTERS');
      return;
    }
    router.push(`/game/${code}`);
  };

  const handleL1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    setLetter1(val);
    setError('');
    if (val) input2Ref.current?.focus();
  };

  const handleL2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    setLetter2(val);
    setError('');
  };

  const handleL2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !letter2) input1Ref.current?.focus();
    if (e.key === 'Enter') joinGame();
  };

  return (
    <main
      className="dot-bg"
      style={{
        minHeight: '100vh',
        background: '#06060F',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient orb — cyan, top-right */}
      <div
        className="anim-float-a"
        style={{
          position: 'absolute',
          top: '-140px',
          right: '-110px',
          width: '460px',
          height: '460px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,207,255,0.1) 0%, transparent 62%)',
          pointerEvents: 'none',
        }}
      />
      {/* Ambient orb — red, bottom-left */}
      <div
        className="anim-float-b"
        style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-90px',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,45,85,0.1) 0%, transparent 62%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Title ───────────────────────────────────────────── */}
      <div
        className="anim-slide-up"
        style={{ textAlign: 'center', marginBottom: '52px', position: 'relative', zIndex: 1 }}
      >
        <h1
          className="ff-bebas"
          style={{
            fontSize: 'clamp(82px, 22vw, 144px)',
            lineHeight: 0.84,
            margin: 0,
            letterSpacing: '0.04em',
          }}
        >
          <span
            style={{
              display: 'block',
              color: '#00CFFF',
              textShadow:
                '0 0 16px rgba(0,207,255,0.9), 0 0 55px rgba(0,207,255,0.32), 0 0 110px rgba(0,207,255,0.12)',
            }}
          >
            COLOUR
          </span>
          <span
            style={{
              display: 'block',
              color: '#FF2D55',
              textShadow:
                '0 0 16px rgba(255,45,85,0.9), 0 0 55px rgba(255,45,85,0.32), 0 0 110px rgba(255,45,85,0.12)',
            }}
          >
            WARS
          </span>
        </h1>

        {/* Colour-split separator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '14px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(0,207,255,0.7))',
            }}
          />
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#00CFFF',
              boxShadow: '0 0 8px rgba(0,207,255,0.9)',
              margin: '0 2px',
            }}
          />
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#FF2D55',
              boxShadow: '0 0 8px rgba(255,45,85,0.9)',
              margin: '0 2px',
            }}
          />
          <div
            style={{
              width: '56px',
              height: '1px',
              background: 'linear-gradient(90deg, rgba(255,45,85,0.7), transparent)',
            }}
          />
        </div>

        <p
          className="ff-space"
          style={{
            color: 'rgba(170,170,255,0.38)',
            fontSize: '10px',
            letterSpacing: '0.26em',
            marginTop: '12px',
            textTransform: 'uppercase',
          }}
        >
          grow · explode · conquer
        </p>
      </div>

      {/* ── Panel ───────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Create game */}
        <button
          onClick={createGame}
          disabled={loading}
          className="ff-bebas"
          style={{
            width: '100%',
            padding: '18px 20px 18px 16px',
            background: 'transparent',
            border: '1px solid rgba(0,207,255,0.45)',
            borderLeft: '3px solid #00CFFF',
            color: '#00CFFF',
            fontSize: '28px',
            letterSpacing: '0.12em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.55 : 1,
            transition: 'all 0.18s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 0 20px rgba(0,207,255,0.05)',
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.currentTarget.style.background = 'rgba(0,207,255,0.07)';
              e.currentTarget.style.boxShadow = '0 0 32px rgba(0,207,255,0.18)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0,207,255,0.05)';
          }}
        >
          <span>{loading ? 'CREATING...' : 'CREATE GAME'}</span>
          <span style={{ fontSize: '15px', opacity: 0.45, marginLeft: '8px' }}>→</span>
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.07)' }} />
          <span
            className="ff-space"
            style={{ color: 'rgba(170,170,255,0.2)', fontSize: '9px', letterSpacing: '0.2em' }}
          >
            OR JOIN WITH CODE
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.07)' }} />
        </div>

        {/* Letter inputs + go */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
          {[
            {
              ref: input1Ref,
              value: letter1,
              onChange: handleL1,
              onKeyDown: undefined as React.KeyboardEventHandler<HTMLInputElement> | undefined,
              placeholder: 'A',
            },
            {
              ref: input2Ref,
              value: letter2,
              onChange: handleL2,
              onKeyDown: handleL2KeyDown,
              placeholder: 'B',
            },
          ].map((p, i) => (
            <input
              key={i}
              ref={p.ref}
              value={p.value}
              onChange={p.onChange}
              onKeyDown={p.onKeyDown}
              maxLength={1}
              placeholder={p.placeholder}
              autoComplete="off"
              style={{
                flex: 1,
                height: '72px',
                background: '#0D0D1E',
                border: '1px solid rgba(255,45,85,0.28)',
                borderLeft: i === 0 ? '3px solid rgba(255,45,85,0.55)' : '1px solid rgba(255,45,85,0.28)',
                color: '#FF2D55',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '34px',
                fontWeight: 900,
                textAlign: 'center',
                letterSpacing: '0.05em',
                outline: 'none',
                transition: 'all 0.15s ease',
                caretColor: 'transparent',
                textTransform: 'uppercase',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(255,45,85,0.8)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255,45,85,0.18), inset 0 0 14px rgba(255,45,85,0.05)';
                e.currentTarget.style.background = '#120A10';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(255,45,85,0.28)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.background = '#0D0D1E';
              }}
            />
          ))}

          <button
            onClick={joinGame}
            className="ff-bebas"
            style={{
              width: '72px',
              height: '72px',
              flexShrink: 0,
              background: 'rgba(255,45,85,0.1)',
              border: '1px solid rgba(255,45,85,0.5)',
              color: '#FF2D55',
              fontSize: '20px',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 0 14px rgba(255,45,85,0.08)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,45,85,0.22)';
              e.currentTarget.style.boxShadow = '0 0 28px rgba(255,45,85,0.32)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,45,85,0.1)';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(255,45,85,0.08)';
            }}
          >
            GO
          </button>
        </div>

        {error && (
          <p
            className="ff-space anim-slide-up-fast"
            style={{
              color: '#FF2D55',
              fontSize: '10px',
              textAlign: 'center',
              letterSpacing: '0.15em',
              margin: 0,
              textShadow: '0 0 10px rgba(255,45,85,0.55)',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* ── How to play ─────────────────────────────────────── */}
      <div
        style={{
          marginTop: '50px',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
          position: 'relative',
          zIndex: 1,
          alignItems: 'center',
        }}
      >
        {[
          { n: '01', t: 'Click your circles to add +1 value' },
          { n: '02', t: 'At 4 points the circle chain-explodes' },
          { n: '03', t: 'Own every cell to win the board' },
        ].map(({ n, t }) => (
          <div
            key={n}
            className="ff-space"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'rgba(170,170,255,0.2)',
              fontSize: '9px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: 'rgba(0,207,255,0.22)', minWidth: '14px' }}>{n}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
