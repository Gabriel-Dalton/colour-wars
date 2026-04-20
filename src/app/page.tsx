'use client';

import { useState, useRef, useEffect } from 'react';
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
  const [mode, setMode] = useState<'classic' | 'open'>('open');
  const [openRooms, setOpenRooms] = useState<{ id: string; mode: string | null; created_at: string }[]>([]);
  const [showHowTo, setShowHowTo] = useState(false);
  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ── Poll open (waiting) rooms so players can browse lobbies ──
  useEffect(() => {
    let cancelled = false;
    const fetchRooms = async () => {
      const { data } = await supabase
        .from('games')
        .select('id, mode, created_at')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(12);
      if (!cancelled && data) setOpenRooms(data as typeof openRooms);
    };
    fetchRooms();
    const t = setInterval(fetchRooms, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const createGame = async () => {
    setLoading(true);
    setError('');
    const playerId = getOrCreatePlayerId();
    const roomId = generateRoomCode();
    const grid = createInitialGrid();

    const payload: Record<string, unknown> = {
      id: roomId,
      status: 'waiting',
      blue_player_id: playerId,
      red_player_id: null,
      current_turn: 'blue',
      grid,
      winner: null,
      move_count: 0,
      mode,
    };

    let { error: dbError } = await supabase.from('games').insert(payload);

    // If the `mode` column isn't in the DB yet, retry without it
    if (dbError && dbError.message && dbError.message.includes('mode')) {
      delete payload.mode;
      ({ error: dbError } = await supabase.from('games').insert(payload));
    }

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
        padding: '28px 16px',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Top-right HOW TO PLAY button ─────────────────────── */}
      <button
        onClick={() => setShowHowTo(true)}
        className="ff-space"
        aria-label="How to play"
        style={{
          position: 'absolute',
          top: '18px',
          right: '18px',
          zIndex: 5,
          padding: '8px 14px',
          background: 'rgba(13,13,34,0.7)',
          border: '1px solid rgba(170,170,255,0.25)',
          borderTop: '2px solid rgba(170,170,255,0.55)',
          color: 'rgba(240,240,255,0.85)',
          fontSize: '10px',
          letterSpacing: '0.22em',
          cursor: 'pointer',
          borderRadius: '3px',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(30,30,60,0.9)';
          e.currentTarget.style.borderColor = 'rgba(170,170,255,0.55)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(13,13,34,0.7)';
          e.currentTarget.style.borderColor = 'rgba(170,170,255,0.25)';
        }}
      >
        <span style={{ fontSize: '13px', lineHeight: 1 }}>?</span>
        <span>How to play</span>
      </button>

      {/* ── Instructions modal ───────────────────────────────── */}
      {showHowTo && (
        <div
          onClick={() => setShowHowTo(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6,6,15,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="anim-slide-up-fast"
            style={{
              width: '100%',
              maxWidth: '440px',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#0D0D22',
              border: '1px solid rgba(0,207,255,0.35)',
              borderTop: '3px solid #00CFFF',
              borderRadius: '6px',
              padding: '26px 26px 22px',
              color: 'rgba(240,240,255,0.9)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,207,255,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 className="ff-bebas" style={{ margin: 0, fontSize: '28px', letterSpacing: '0.14em', color: '#00CFFF' }}>
                HOW TO PLAY
              </h2>
              <button
                onClick={() => setShowHowTo(false)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(170,170,255,0.6)',
                  fontSize: '26px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: '14px', lineHeight: 1.55, marginTop: 0, marginBottom: '16px', color: 'rgba(240,240,255,0.82)' }}>
              Two players, one grid. Grow your circles, trigger chain reactions, and flip every cell to your colour to win.
            </p>

            {[
              { n: '01', t: 'Pick a starting cell', d: 'Each player places one circle to begin. That cell starts with 3 points.' },
              { n: '02', t: 'Click your circles to add +1', d: 'On your turn, click one of your circles to increase its value.' },
              { n: '03', t: 'At 4 points → CHAIN EXPLOSION', d: 'The circle explodes into its neighbours, capturing enemy cells. Explosions can trigger more explosions.' },
              { n: '04', t: 'Own every cell to win', d: 'Wipe the opponent off the board — the last colour standing wins.' },
            ].map(({ n, t, d }) => (
              <div
                key={n}
                style={{
                  display: 'flex',
                  gap: '14px',
                  padding: '12px 0',
                  borderTop: '1px solid rgba(170,170,255,0.08)',
                }}
              >
                <span className="ff-orbit" style={{ color: 'rgba(0,207,255,0.55)', fontSize: '14px', minWidth: '24px' }}>{n}</span>
                <div>
                  <div className="ff-bebas" style={{ fontSize: '15px', letterSpacing: '0.1em', color: '#FF2D55', marginBottom: '3px' }}>{t}</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(240,240,255,0.72)' }}>{d}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: '18px', padding: '12px 14px', background: 'rgba(0,207,255,0.05)', border: '1px solid rgba(0,207,255,0.18)', borderRadius: '4px' }}>
              <div className="ff-space" style={{ fontSize: '9px', letterSpacing: '0.22em', color: 'rgba(0,207,255,0.7)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Game modes
              </div>
              <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'rgba(240,240,255,0.78)' }}>
                <strong style={{ color: '#00CFFF' }}>Classic</strong> — you can only click circles you already own.<br />
                <strong style={{ color: '#FF2D55' }}>Open</strong> — you can click your circles OR any empty cell.
              </div>
            </div>

            <button
              onClick={() => setShowHowTo(false)}
              className="ff-bebas"
              style={{
                marginTop: '18px',
                width: '100%',
                padding: '12px',
                background: 'transparent',
                border: '1px solid rgba(0,207,255,0.5)',
                color: '#00CFFF',
                fontSize: '18px',
                letterSpacing: '0.14em',
                cursor: 'pointer',
                borderRadius: '3px',
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* Ambient orb — cyan, top-right */}
      <div
        className="anim-float-a"
        style={{
          position: 'absolute',
          top: '-140px',
          right: '-110px',
          width: 'min(460px, 70vw)',
          height: 'min(460px, 70vw)',
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
          width: 'min(420px, 70vw)',
          height: 'min(420px, 70vw)',
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
            fontSize: 'clamp(56px, 18vw, 144px)',
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
            color: 'rgba(210,210,240,0.72)',
            fontSize: '10px',
            letterSpacing: '0.26em',
            marginTop: '12px',
            textTransform: 'uppercase',
          }}
        >
          grow · explode · conquer
        </p>
      </div>

      {/* ── Side-by-side wrapper (desktop only) ─────────────── */}
      <div className="cw-home-wrap">

      {/* ── Panel ───────────────────────────────────────────── */}
      <div className="cw-home-body">
        {/* Mode picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
          <span
            className="ff-space"
            style={{
              color: 'rgba(210,210,240,0.72)',
              fontSize: '9px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            Game Mode
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              padding: '4px',
              background: 'rgba(13,13,34,0.7)',
              border: '1px solid rgba(170,170,255,0.08)',
              borderRadius: '4px',
            }}
          >
            {(['classic', 'open'] as const).map(m => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="ff-bebas"
                  style={{
                    padding: '10px 8px 8px',
                    background: active ? 'rgba(0,207,255,0.12)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(0,207,255,0.55)' : 'transparent'}`,
                    color: active ? '#00CFFF' : 'rgba(210,210,240,0.78)',
                    fontSize: '18px',
                    letterSpacing: '0.14em',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    borderRadius: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    lineHeight: 1,
                  }}
                >
                  <span>{m === 'classic' ? 'CLASSIC' : 'OPEN'}</span>
                  <span
                    className="ff-space"
                    style={{
                      fontSize: '8px',
                      letterSpacing: '0.14em',
                      opacity: active ? 0.75 : 0.5,
                      textTransform: 'uppercase',
                      fontWeight: 400,
                    }}
                  >
                    {m === 'classic' ? 'own circles only' : 'own + empty'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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
            style={{ color: 'rgba(210,210,240,0.65)', fontSize: '9px', letterSpacing: '0.2em' }}
          >
            OR JOIN WITH CODE
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.07)' }} />
        </div>

        {/* Letter inputs + go */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', minWidth: 0 }}>
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
                minWidth: 0,
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

      {/* ── Open rooms ─────────────────────────────────────── */}
      {openRooms.length > 0 && (
        <div className="anim-slide-up cw-home-rooms">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span
              className="ff-space"
              style={{
                color: 'rgba(210,210,240,0.78)',
                fontSize: '9px',
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
              }}
            >
              Open rooms
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(170,170,255,0.1)' }} />
            <span
              className="ff-space"
              style={{
                color: 'rgba(210,210,240,0.72)',
                fontSize: '8px',
                letterSpacing: '0.2em',
              }}
            >
              {openRooms.length} WAITING
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              maxHeight: '180px',
              overflowY: 'auto',
              paddingRight: '2px',
            }}
          >
            {openRooms.map(r => (
              <button
                key={r.id}
                onClick={() => router.push(`/game/${r.id}`)}
                className="ff-space"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'rgba(13,13,34,0.7)',
                  border: '1px solid rgba(0,207,255,0.18)',
                  borderLeft: '3px solid rgba(0,207,255,0.45)',
                  color: 'rgba(240,240,255,0.85)',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  cursor: 'pointer',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(0,207,255,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(0,207,255,0.55)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(13,13,34,0.7)';
                  e.currentTarget.style.borderColor = 'rgba(0,207,255,0.18)';
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    aria-hidden
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#00CFFF',
                      boxShadow: '0 0 6px rgba(0,207,255,0.9)',
                      animation: 'pip-idle 2.4s ease-in-out infinite',
                    }}
                  />
                  <span className="ff-orbit" style={{ fontSize: '15px', letterSpacing: '0.18em', color: '#00CFFF' }}>
                    {r.id}
                  </span>
                  <span style={{ color: 'rgba(210,210,240,0.72)', fontSize: '9px' }}>
                    · {(r.mode ?? 'classic').toUpperCase()}
                  </span>
                </span>
                <span style={{ color: 'rgba(255,45,85,0.7)', fontSize: '12px' }}>JOIN →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      </div>
      {/* ── /cw-home-wrap ──────────────────────────────────── */}
    </main>
  );
}
