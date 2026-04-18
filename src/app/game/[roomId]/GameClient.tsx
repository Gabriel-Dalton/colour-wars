'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GameRow, Player } from '@/lib/types';
import {
  placeStartingCircle,
  processMove,
  checkWinner,
  nextTurn,
  countCircles,
} from '@/lib/gameLogic';
import Grid from '@/components/Grid';
import type { RealtimeChannel } from '@supabase/supabase-js';

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('cw_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cw_player_id', id);
  }
  return id;
}

export default function GameClient({ roomId }: { roomId: string }) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const router = useRouter();

  // Extracted so it can be called on reconnect without re-running the join logic
  const subscribe = useCallback(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`game:${roomId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${roomId}` },
        (payload) => setGame(payload.new as GameRow)
      )
      .subscribe();
  }, [roomId]);

  useEffect(() => {
    const pid = getOrCreatePlayerId();
    initGame(pid);
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Re-fetch + re-subscribe when the tab becomes visible again (mobile reconnect fix)
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('games').select('*').eq('id', roomId).single();
      if (data) setGame(data as GameRow);
      subscribe();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [roomId, subscribe]);

  async function initGame(pid: string) {
    const { data, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('id', roomId)
      .single();

    if (fetchError || !data) {
      setError('Room not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    let gameData = data as GameRow;

    if (gameData.blue_player_id === pid) {
      setMyColor('blue');
    } else if (gameData.red_player_id === pid) {
      setMyColor('red');
    } else if (gameData.status === 'waiting' && !gameData.red_player_id) {
      const { data: updated, error: joinError } = await supabase
        .from('games')
        .update({ red_player_id: pid, status: 'placement_blue' })
        .eq('id', roomId)
        .eq('status', 'waiting')
        .select()
        .single();

      if (joinError || !updated) {
        setError('This room is full or no longer available.');
        setLoading(false);
        return;
      }
      gameData = updated as GameRow;
      setMyColor('red');
    } else {
      setMyColor(null);
    }

    setGame(gameData);
    setLoading(false);
    subscribe();
  }

  const handleCellClick = useCallback(
    async (row: number, col: number) => {
      if (!game || submitting) return;
      const { status, current_turn, grid } = game;

      // Validate before acquiring the lock so we never get stuck
      if (status === 'placement_blue') {
        if (myColor !== 'blue' || grid[row][col].owner !== null) return;
      } else if (status === 'placement_red') {
        if (myColor !== 'red' || grid[row][col].owner !== null) return;
      } else if (status === 'playing') {
        if (current_turn !== myColor || grid[row][col].owner !== myColor) return;
      } else {
        return;
      }

      setSubmitting(true);
      try {
        if (status === 'placement_blue') {
          const newGrid = placeStartingCircle(grid, row, col, 'blue');
          await supabase
            .from('games')
            .update({ grid: newGrid, status: 'placement_red', current_turn: 'red' })
            .eq('id', roomId);
        } else if (status === 'placement_red') {
          const newGrid = placeStartingCircle(grid, row, col, 'red');
          await supabase
            .from('games')
            .update({ grid: newGrid, status: 'playing', current_turn: 'blue', move_count: 0 })
            .eq('id', roomId);
        } else {
          const newGrid = processMove(grid, row, col, myColor!);
          const winner = checkWinner(newGrid);
          await supabase
            .from('games')
            .update({
              grid: newGrid,
              current_turn: winner ? current_turn : nextTurn(myColor!),
              winner: winner ?? null,
              status: winner ? 'finished' : 'playing',
              move_count: (game.move_count ?? 0) + 1,
            })
            .eq('id', roomId);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [game, myColor, roomId, submitting]
  );

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/game/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Loading ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#06060F',
        }}
      >
        <span
          className="ff-orbit"
          style={{ color: 'rgba(0,207,255,0.55)', fontSize: '13px', letterSpacing: '0.28em' }}
        >
          CONNECTING...
        </span>
      </div>
    );
  }

  /* ── Error ──────────────────────────────────────────────── */
  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#06060F',
          gap: '20px',
          padding: '24px',
        }}
      >
        <p
          className="ff-space"
          style={{
            color: '#FF2D55',
            fontSize: '12px',
            textAlign: 'center',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {error}
        </p>
        <button
          onClick={() => router.push('/')}
          className="ff-bebas"
          style={{
            padding: '14px 32px',
            background: 'transparent',
            border: '1px solid rgba(0,207,255,0.55)',
            borderLeft: '3px solid #00CFFF',
            color: '#00CFFF',
            fontSize: '22px',
            letterSpacing: '0.1em',
            cursor: 'pointer',
          }}
        >
          BACK HOME
        </button>
      </div>
    );
  }

  if (!game) return null;

  /* ── Derived state ──────────────────────────────────────── */
  const counts = countCircles(game.grid);
  const isWaiting = game.status === 'waiting';
  const isPlacingNow =
    (game.status === 'placement_blue' && myColor === 'blue') ||
    (game.status === 'placement_red' && myColor === 'red');
  const isFinished = game.status === 'finished';
  const isMyTurn = game.status === 'playing' && game.current_turn === myColor;

  const totalOwned = counts.blue + counts.red;
  const blueTerrPct = totalOwned > 0 ? (counts.blue / totalOwned) * 100 : 50;

  function statusText(): string {
    if (isWaiting) return 'Waiting for opponent...';
    if (game!.status === 'placement_blue')
      return myColor === 'blue' ? 'Pick your starting position' : 'Blue is placing...';
    if (game!.status === 'placement_red')
      return myColor === 'red' ? 'Pick your starting position' : 'Red is placing...';
    if (isFinished) {
      if (!myColor) return `${game!.winner === 'blue' ? 'Blue' : 'Red'} wins!`;
      return game!.winner === myColor ? 'You win!' : 'You lose!';
    }
    if (isMyTurn) return 'Your turn — click a circle';
    return `${game!.current_turn === 'blue' ? 'Blue' : 'Red'}'s turn...`;
  }

  const blueIsActive = game.status === 'playing' && game.current_turn === 'blue';
  const redIsActive  = game.status === 'playing' && game.current_turn === 'red';

  const winnerColor = game.winner === 'blue' ? '#00CFFF' : '#FF2D55';
  const winnerRgb   = game.winner === 'blue' ? '0,207,255' : '255,45,85';

  /* ── Game UI ────────────────────────────────────────────── */
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06060F',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '18px 16px 28px',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Static top ambient — color shifts with active player */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '560px',
          height: '240px',
          background: blueIsActive
            ? 'radial-gradient(ellipse at center top, rgba(0,207,255,0.07) 0%, transparent 68%)'
            : redIsActive
            ? 'radial-gradient(ellipse at center top, rgba(255,45,85,0.07) 0%, transparent 68%)'
            : 'none',
          pointerEvents: 'none',
          transition: 'background 1.2s ease',
        }}
      />

      {/* ── Wordmark header ─────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <h1
          className="ff-bebas"
          style={{ margin: 0, fontSize: '17px', letterSpacing: '0.32em', lineHeight: 1 }}
        >
          <span style={{ color: 'rgba(0,207,255,0.45)' }}>COLOUR </span>
          <span style={{ color: 'rgba(255,45,85,0.45)' }}>WARS</span>
        </h1>
        <div
          className="ff-space"
          style={{ color: 'rgba(170,170,255,0.2)', fontSize: '9px', letterSpacing: '0.18em' }}
        >
          ROOM: {roomId}
        </div>
      </div>

      {/* ── HUD ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: '360px',
          alignItems: 'stretch',
          gap: '8px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Blue score */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 6px 10px',
            background: myColor === 'blue' ? 'rgba(0,207,255,0.06)' : 'transparent',
            border: `1px solid ${blueIsActive ? 'rgba(0,207,255,0.35)' : 'rgba(0,207,255,0.1)'}`,
            borderLeft: `3px solid ${blueIsActive ? '#00CFFF' : 'rgba(0,207,255,0.25)'}`,
            borderRadius: '4px',
            transition: 'border-color 0.4s ease',
          }}
        >
          <span
            className="ff-orbit"
            style={{
              color: '#00CFFF',
              fontSize: '40px',
              fontWeight: 900,
              lineHeight: 1,
              textShadow: blueIsActive
                ? '0 0 14px rgba(0,207,255,0.8), 0 0 28px rgba(0,207,255,0.35)'
                : '0 0 6px rgba(0,207,255,0.25)',
              transition: 'text-shadow 0.4s ease',
            }}
          >
            {counts.blue}
          </span>
          <span
            className="ff-space"
            style={{
              color: myColor === 'blue' ? 'rgba(0,207,255,0.55)' : 'rgba(0,207,255,0.28)',
              fontSize: '8px',
              letterSpacing: '0.2em',
              marginTop: '4px',
            }}
          >
            {myColor === 'blue' ? '▶ YOU' : 'BLUE'}
          </span>
        </div>

        {/* Center VS */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
          }}
        >
          <span
            className="ff-bebas"
            style={{ color: 'rgba(170,170,255,0.18)', fontSize: '20px', letterSpacing: '0.1em' }}
          >
            VS
          </span>
        </div>

        {/* Red score */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 6px 10px',
            background: myColor === 'red' ? 'rgba(255,45,85,0.06)' : 'transparent',
            border: `1px solid ${redIsActive ? 'rgba(255,45,85,0.35)' : 'rgba(255,45,85,0.1)'}`,
            borderRight: `3px solid ${redIsActive ? '#FF2D55' : 'rgba(255,45,85,0.25)'}`,
            borderRadius: '4px',
            transition: 'border-color 0.4s ease',
          }}
        >
          <span
            className="ff-orbit"
            style={{
              color: '#FF2D55',
              fontSize: '40px',
              fontWeight: 900,
              lineHeight: 1,
              textShadow: redIsActive
                ? '0 0 14px rgba(255,45,85,0.8), 0 0 28px rgba(255,45,85,0.35)'
                : '0 0 6px rgba(255,45,85,0.25)',
              transition: 'text-shadow 0.4s ease',
            }}
          >
            {counts.red}
          </span>
          <span
            className="ff-space"
            style={{
              color: myColor === 'red' ? 'rgba(255,45,85,0.55)' : 'rgba(255,45,85,0.28)',
              fontSize: '8px',
              letterSpacing: '0.2em',
              marginTop: '4px',
            }}
          >
            {myColor === 'red' ? '▶ YOU' : 'RED'}
          </span>
        </div>
      </div>

      {/* ── Territory bar ───────────────────────────────────── */}
      {totalOwned > 0 && (
        <div style={{ width: '100%', maxWidth: '360px', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              overflow: 'hidden',
              background: 'rgba(255,45,85,0.4)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${blueTerrPct}%`,
                background: 'rgba(0,207,255,0.7)',
                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: '2px',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span className="ff-space" style={{ color: 'rgba(0,207,255,0.3)', fontSize: '8px', letterSpacing: '0.1em' }}>
              {Math.round(blueTerrPct)}%
            </span>
            <span className="ff-space" style={{ color: 'rgba(170,170,255,0.16)', fontSize: '8px', letterSpacing: '0.1em' }}>
              TERRITORY
            </span>
            <span className="ff-space" style={{ color: 'rgba(255,45,85,0.3)', fontSize: '8px', letterSpacing: '0.1em' }}>
              {Math.round(100 - blueTerrPct)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Status ──────────────────────────────────────────── */}
      <div
        className="ff-space"
        style={{
          padding: '8px 20px',
          background: isMyTurn || isPlacingNow ? 'rgba(255,255,255,0.04)' : 'transparent',
          border: `1px solid ${isMyTurn || isPlacingNow ? 'rgba(255,255,255,0.09)' : 'transparent'}`,
          borderRadius: '5px',
          color: isMyTurn || isPlacingNow ? 'rgba(240,240,255,0.88)' : 'rgba(170,170,255,0.3)',
          fontSize: '10px',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {statusText()}
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <Grid
        grid={game.grid}
        onCellClick={handleCellClick}
        myColor={myColor}
        gameStatus={game.status}
        currentTurn={game.current_turn}
        isPlacingNow={isPlacingNow}
        submitting={submitting}
      />

      {/* ── Share panel (waiting) ───────────────────────────── */}
      {isWaiting && myColor === 'blue' && (
        <div
          className="anim-slide-up"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            padding: '24px 20px',
            background: '#0D0D22',
            border: '1px solid rgba(0,207,255,0.16)',
            borderLeft: '3px solid rgba(0,207,255,0.45)',
            borderRadius: '6px',
            width: '100%',
            maxWidth: '320px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <p
            className="ff-space"
            style={{
              color: 'rgba(170,170,255,0.3)',
              fontSize: '9px',
              letterSpacing: '0.2em',
              margin: 0,
              textTransform: 'uppercase',
            }}
          >
            Share code with opponent
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            {roomId.split('').map((char, i) => (
              <div
                key={i}
                style={{
                  width: '70px',
                  height: '78px',
                  background: '#0A0A1E',
                  border: '1px solid rgba(0,207,255,0.35)',
                  borderTop: '3px solid rgba(0,207,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                }}
              >
                <span className="ff-orbit" style={{ color: '#00CFFF', fontSize: '40px', fontWeight: 900 }}>
                  {char}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={copyLink}
            className="ff-space"
            style={{
              padding: '10px 28px',
              background: 'transparent',
              border: '1px solid rgba(0,207,255,0.32)',
              color: copied ? 'rgba(0,207,255,0.9)' : 'rgba(0,207,255,0.6)',
              fontSize: '10px',
              letterSpacing: '0.18em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textTransform: 'uppercase',
              borderRadius: '3px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,207,255,0.07)';
              e.currentTarget.style.borderColor = 'rgba(0,207,255,0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(0,207,255,0.32)';
            }}
          >
            {copied ? '✓ COPIED' : 'COPY LINK'}
          </button>
        </div>
      )}

      {/* ── Leave button ────────────────────────────────────── */}
      {!isFinished && (
        <button
          onClick={() => router.push('/')}
          className="ff-space"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(170,170,255,0.16)',
            fontSize: '10px',
            letterSpacing: '0.12em',
            cursor: 'pointer',
            padding: '4px 8px',
            textTransform: 'uppercase',
            transition: 'color 0.15s ease',
            position: 'relative',
            zIndex: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(170,170,255,0.42)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(170,170,255,0.16)'; }}
        >
          ← LEAVE
        </button>
      )}

      {/* ── Win overlay ──────────────────────────────────────── */}
      {isFinished && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: `linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(${winnerRgb},0.06) 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 50,
          }}
        >
          <div
            className="anim-slide-up"
            style={{
              background: '#0D0D22',
              border: `1px solid rgba(${winnerRgb},0.55)`,
              borderTop: `3px solid ${winnerColor}`,
              padding: '36px 32px 32px',
              textAlign: 'center',
              width: '100%',
              maxWidth: '300px',
              borderRadius: '6px',
              boxShadow: `0 0 80px rgba(${winnerRgb},0.12)`,
            }}
          >
            <div
              className="ff-orbit"
              style={{
                color: winnerColor,
                fontSize: '11px',
                letterSpacing: '0.38em',
                marginBottom: '8px',
              }}
            >
              {game.winner === 'blue' ? 'BLUE' : 'RED'} WINS
            </div>

            <h2
              className="ff-bebas"
              style={{
                fontSize: '76px',
                lineHeight: 0.88,
                margin: '0 0 16px',
                color: game.winner === myColor ? '#fff' : 'rgba(170,170,255,0.35)',
                letterSpacing: '0.02em',
              }}
            >
              {game.winner === myColor ? 'VICTORY' : myColor ? 'DEFEAT' : 'GAME\nOVER'}
            </h2>

            {/* Final score */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                marginBottom: '24px',
                padding: '14px 0',
                borderTop: '1px solid rgba(170,170,255,0.07)',
                borderBottom: '1px solid rgba(170,170,255,0.07)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  className="ff-orbit"
                  style={{
                    color: '#00CFFF',
                    fontSize: '30px',
                    fontWeight: 900,
                    lineHeight: 1,
                    textShadow: game.winner === 'blue' ? '0 0 12px rgba(0,207,255,0.6)' : 'none',
                  }}
                >
                  {counts.blue}
                </div>
                <div className="ff-space" style={{ color: 'rgba(0,207,255,0.35)', fontSize: '8px', letterSpacing: '0.18em', marginTop: '4px' }}>
                  BLUE
                </div>
              </div>
              <div className="ff-bebas" style={{ color: 'rgba(170,170,255,0.15)', fontSize: '22px' }}>:</div>
              <div style={{ textAlign: 'center' }}>
                <div
                  className="ff-orbit"
                  style={{
                    color: '#FF2D55',
                    fontSize: '30px',
                    fontWeight: 900,
                    lineHeight: 1,
                    textShadow: game.winner === 'red' ? '0 0 12px rgba(255,45,85,0.6)' : 'none',
                  }}
                >
                  {counts.red}
                </div>
                <div className="ff-space" style={{ color: 'rgba(255,45,85,0.35)', fontSize: '8px', letterSpacing: '0.18em', marginTop: '4px' }}>
                  RED
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/')}
              className="ff-bebas"
              style={{
                width: '100%',
                padding: '18px',
                background: 'transparent',
                border: `1px solid rgba(${winnerRgb},0.55)`,
                borderLeft: `3px solid ${winnerColor}`,
                color: winnerColor,
                fontSize: '26px',
                letterSpacing: '0.12em',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                borderRadius: '3px',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${winnerRgb},0.09)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
