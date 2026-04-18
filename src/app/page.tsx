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

const S = {
  page: {
    minHeight: '100vh',
    background: '#06060F',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px 20px',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  ambientGlow: {
    position: 'absolute' as const,
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '600px',
    height: '300px',
    background:
      'radial-gradient(ellipse at center top, rgba(0,207,255,0.05) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
  },
  panel: {
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    position: 'relative' as const,
    zIndex: 1,
  },
};

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
    <main style={S.page}>
      <div style={S.ambientGlow} />

      {/* Title */}
      <div className="anim-slide-up" style={{ textAlign: 'center', marginBottom: '52px', position: 'relative', zIndex: 1 }}>
        <h1
          className="ff-bebas anim-flicker"
          style={{
            fontSize: 'clamp(80px, 22vw, 140px)',
            lineHeight: 0.86,
            color: '#fff',
            letterSpacing: '0.04em',
            margin: 0,
            textShadow:
              '0 0 18px rgba(0,207,255,0.75), 0 0 55px rgba(0,207,255,0.3), 0 0 110px rgba(0,207,255,0.12)',
          }}
        >
          COLOUR
          <br />
          WARS
        </h1>
        <p
          className="ff-space"
          style={{
            color: 'rgba(170,170,255,0.35)',
            fontSize: '10px',
            letterSpacing: '0.25em',
            marginTop: '14px',
            textTransform: 'uppercase',
          }}
        >
          grow · explode · conquer
        </p>
      </div>

      {/* Buttons + inputs */}
      <div style={S.panel}>
        {/* Create game */}
        <button
          onClick={createGame}
          disabled={loading}
          className="ff-bebas"
          style={{
            width: '100%',
            padding: '20px',
            background: 'transparent',
            border: '2px solid rgba(0,207,255,0.65)',
            color: '#00CFFF',
            fontSize: '30px',
            letterSpacing: '0.1em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            transition: 'all 0.15s ease',
            boxShadow: '0 0 14px rgba(0,207,255,0.18), inset 0 0 14px rgba(0,207,255,0.04)',
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.currentTarget.style.background = 'rgba(0,207,255,0.1)';
              e.currentTarget.style.boxShadow =
                '0 0 28px rgba(0,207,255,0.45), inset 0 0 20px rgba(0,207,255,0.08)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow =
              '0 0 14px rgba(0,207,255,0.18), inset 0 0 14px rgba(0,207,255,0.04)';
          }}
        >
          {loading ? 'CREATING...' : 'CREATE GAME'}
        </button>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 0',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.08)' }} />
          <span
            className="ff-space"
            style={{ color: 'rgba(170,170,255,0.25)', fontSize: '9px', letterSpacing: '0.2em' }}
          >
            JOIN WITH CODE
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.08)' }} />
        </div>

        {/* Two letter inputs + go */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          {[
            { ref: input1Ref, value: letter1, onChange: handleL1, onKeyDown: undefined as React.KeyboardEventHandler<HTMLInputElement> | undefined, placeholder: 'A' },
            { ref: input2Ref, value: letter2, onChange: handleL2, onKeyDown: handleL2KeyDown, placeholder: 'B' },
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
                height: '76px',
                background: '#0D0D20',
                border: '2px solid rgba(255,45,85,0.35)',
                color: '#FF2D55',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '38px',
                fontWeight: 900,
                textAlign: 'center',
                letterSpacing: '0.05em',
                outline: 'none',
                transition: 'all 0.15s ease',
                caretColor: 'transparent',
                textTransform: 'uppercase',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(255,45,85,0.85)';
                e.currentTarget.style.boxShadow =
                  '0 0 18px rgba(255,45,85,0.3), inset 0 0 12px rgba(255,45,85,0.08)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(255,45,85,0.35)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          ))}

          <button
            onClick={joinGame}
            className="ff-bebas"
            style={{
              width: '76px',
              height: '76px',
              flexShrink: 0,
              background: 'rgba(255,45,85,0.12)',
              border: '2px solid rgba(255,45,85,0.65)',
              color: '#FF2D55',
              fontSize: '22px',
              letterSpacing: '0.05em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 0 12px rgba(255,45,85,0.12)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,45,85,0.28)';
              e.currentTarget.style.boxShadow = '0 0 24px rgba(255,45,85,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,45,85,0.12)';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(255,45,85,0.12)';
            }}
          >
            GO
          </button>
        </div>

        {error && (
          <p
            className="ff-space"
            style={{
              color: '#FF2D55',
              fontSize: '10px',
              textAlign: 'center',
              letterSpacing: '0.15em',
              margin: 0,
              textShadow: '0 0 8px rgba(255,45,85,0.5)',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Footer rules */}
      <div
        className="ff-space"
        style={{
          marginTop: '52px',
          color: 'rgba(170,170,255,0.18)',
          fontSize: '9px',
          textAlign: 'center',
          letterSpacing: '0.14em',
          lineHeight: 2,
          textTransform: 'uppercase',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <p style={{ margin: 0 }}>Click circles to grow (+1 point)</p>
        <p style={{ margin: 0 }}>At 4 points → chain explosion</p>
        <p style={{ margin: 0 }}>Conquer all cells to win</p>
      </div>
    </main>
  );
}
