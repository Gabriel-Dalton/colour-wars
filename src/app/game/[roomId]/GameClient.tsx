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

  useEffect(() => {
    const pid = getOrCreatePlayerId();
    initGame(pid);
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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

    channelRef.current = supabase
      .channel(`game:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${roomId}` },
        (payload) => setGame(payload.new as GameRow)
      )
      .subscribe();
  }

  const handleCellClick = useCallback(
    async (row: number, col: number) => {
      if (!game || submitting) return;
      const { status, current_turn, grid } = game;

      if (status === 'placement_blue' && myColor === 'blue') {
        if (grid[row][col].owner !== null) return;
        setSubmitting(true);
        const newGrid = placeStartingCircle(grid, row, col, 'blue');
        await supabase
          .from('games')
          .update({ grid: newGrid, status: 'placement_red', current_turn: 'red' })
          .eq('id', roomId);
        setSubmitting(false);
        return;
      }

      if (status === 'placement_red' && myColor === 'red') {
        if (grid[row][col].owner !== null) return;
        setSubmitting(true);
        const newGrid = placeStartingCircle(grid, row, col, 'red');
        await supabase
          .from('games')
          .update({ grid: newGrid, status: 'playing', current_turn: 'blue', move_count: 0 })
          .eq('id', roomId);
        setSubmitting(false);
        return;
      }

      if (status !== 'playing') return;
      if (current_turn !== myColor) return;
      if (grid[row][col].owner !== myColor) return;

      setSubmitting(true);
      const newGrid = processMove(grid, row, col, myColor);
      const winner = checkWinner(newGrid);
      await supabase
        .from('games')
        .update({
          grid: newGrid,
          current_turn: winner ? current_turn : nextTurn(myColor),
          winner: winner ?? null,
          status: winner ? 'finished' : 'playing',
          move_count: (game.move_count ?? 0) + 1,
        })
        .eq('id', roomId);
      setSubmitting(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#06060F' }}>
        <span className="ff-orbit anim-blink" style={{ color: 'rgba(0,207,255,0.6)', fontSize: '13px', letterSpacing: '0.25em' }}>
          CONNECTING...
        </span>
      </div>
    );
  }

  /* ── Error ──────────────────────────────────────────────── */
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#06060F', gap: '20px', padding: '24px' }}>
        <p className="ff-space" style={{ color: '#FF2D55', fontSize: '12px', textAlign: 'center', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {error}
        </p>
        <button
          onClick={() => router.push('/')}
          className="ff-bebas"
          style={{ padding: '14px 32px', background: 'transparent', border: '2px solid rgba(0,207,255,0.6)', color: '#00CFFF', fontSize: '22px', letterSpacing: '0.1em', cursor: 'pointer' }}
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
        padding: '20px 16px 28px',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient top glow follows active player */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '500px',
          height: '220px',
          background: blueIsActive
            ? 'radial-gradient(ellipse at center top, rgba(0,207,255,0.07) 0%, transparent 70%)'
            : redIsActive
            ? 'radial-gradient(ellipse at center top, rgba(255,45,85,0.07) 0%, transparent 70%)'
            : 'none',
          pointerEvents: 'none',
          transition: 'background 1.2s ease',
        }}
      />

      {/* Title wordmark */}
      <h1
        className="ff-bebas"
        style={{
          color: 'rgba(170,170,255,0.4)',
          fontSize: '18px',
          letterSpacing: '0.35em',
          margin: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        COLOUR WARS
      </h1>

      {/* ── HUD ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: '360px',
          alignItems: 'center',
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
            padding: '10px 6px',
            background: myColor === 'blue' ? 'rgba(0,207,255,0.07)' : 'transparent',
            border: `1px solid ${myColor === 'blue' ? 'rgba(0,207,255,0.28)' : 'rgba(0,207,255,0.08)'}`,
            borderRadius: '8px',
            transition: 'all 0.4s ease',
          }}
        >
          <span
            className="ff-orbit"
            style={{
              color: '#00CFFF',
              fontSize: '36px',
              fontWeight: 900,
              lineHeight: 1,
              textShadow: blueIsActive
                ? '0 0 14px rgba(0,207,255,0.9), 0 0 30px rgba(0,207,255,0.45)'
                : 'none',
              transition: 'text-shadow 0.4s ease',
            }}
          >
            {counts.blue}
          </span>
          <span
            className="ff-space"
            style={{ color: 'rgba(0,207,255,0.4)', fontSize: '8px', letterSpacing: '0.18em', marginTop: '3px' }}
          >
            {myColor === 'blue' ? '▶ YOU' : 'BLUE'}
          </span>
        </div>

        {/* Center code */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0 4px' }}>
          <span
            className="ff-orbit"
            style={{ color: 'rgba(170,170,255,0.55)', fontSize: '22px', fontWeight: 700, letterSpacing: '0.22em' }}
          >
            {roomId}
          </span>
          <span className="ff-space" style={{ color: 'rgba(170,170,255,0.18)', fontSize: '7px', letterSpacing: '0.18em' }}>
            ROOM
          </span>
        </div>

        {/* Red score */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 6px',
            background: myColor === 'red' ? 'rgba(255,45,85,0.07)' : 'transparent',
            border: `1px solid ${myColor === 'red' ? 'rgba(255,45,85,0.28)' : 'rgba(255,45,85,0.08)'}`,
            borderRadius: '8px',
            transition: 'all 0.4s ease',
          }}
        >
          <span
            className="ff-orbit"
            style={{
              color: '#FF2D55',
              fontSize: '36px',
              fontWeight: 900,
              lineHeight: 1,
              textShadow: redIsActive
                ? '0 0 14px rgba(255,45,85,0.9), 0 0 30px rgba(255,45,85,0.45)'
                : 'none',
              transition: 'text-shadow 0.4s ease',
            }}
          >
            {counts.red}
          </span>
          <span
            className="ff-space"
            style={{ color: 'rgba(255,45,85,0.4)', fontSize: '8px', letterSpacing: '0.18em', marginTop: '3px' }}
          >
            {myColor === 'red' ? '▶ YOU' : 'RED'}
          </span>
        </div>
      </div>

      {/* Status */}
      <div
        className="ff-space"
        style={{
          padding: '9px 20px',
          background: isMyTurn || isPlacingNow ? 'rgba(255,255,255,0.05)' : 'transparent',
          border: `1px solid ${isMyTurn || isPlacingNow ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
          borderRadius: '6px',
          color: isMyTurn || isPlacingNow ? 'rgba(240,240,255,0.9)' : 'rgba(170,170,255,0.32)',
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

      {/* Grid */}
      <Grid
        grid={game.grid}
        onCellClick={handleCellClick}
        myColor={myColor}
        gameStatus={game.status}
        currentTurn={game.current_turn}
        isPlacingNow={isPlacingNow}
        submitting={submitting}
      />

      {/* Share panel (waiting) */}
      {isWaiting && myColor === 'blue' && (
        <div
          className="anim-slide-up"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            padding: '24px 20px',
            background: '#0D0D22',
            border: '1px solid rgba(0,207,255,0.18)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '320px',
            boxShadow: '0 0 40px rgba(0,207,255,0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <p
            className="ff-space"
            style={{ color: 'rgba(170,170,255,0.35)', fontSize: '9px', letterSpacing: '0.18em', margin: 0, textTransform: 'uppercase' }}
          >
            Share code with opponent
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            {roomId.split('').map((char, i) => (
              <div
                key={i}
                style={{
                  width: '64px',
                  height: '72px',
                  background: '#0A0A1E',
                  border: '2px solid rgba(0,207,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 18px rgba(0,207,255,0.12)',
                }}
              >
                <span className="ff-orbit" style={{ color: '#00CFFF', fontSize: '38px', fontWeight: 900 }}>
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
              border: '1px solid rgba(0,207,255,0.35)',
              color: '#00CFFF',
              fontSize: '10px',
              letterSpacing: '0.18em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textTransform: 'uppercase',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,207,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {copied ? '✓ COPIED' : 'COPY LINK'}
          </button>
        </div>
      )}

      {/* Leave */}
      {!isFinished && (
        <button
          onClick={() => router.push('/')}
          className="ff-space"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(170,170,255,0.18)',
            fontSize: '10px',
            letterSpacing: '0.12em',
            cursor: 'pointer',
            padding: '4px 8px',
            textTransform: 'uppercase',
            transition: 'color 0.15s ease',
            position: 'relative',
            zIndex: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(170,170,255,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(170,170,255,0.18)'; }}
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
            background: 'rgba(0,0,0,0.88)',
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
              border: `2px solid ${game.winner === 'blue' ? 'rgba(0,207,255,0.6)' : 'rgba(255,45,85,0.6)'}`,
              padding: '40px 32px',
              textAlign: 'center',
              width: '100%',
              maxWidth: '300px',
              boxShadow:
                game.winner === 'blue'
                  ? '0 0 70px rgba(0,207,255,0.18), 0 0 140px rgba(0,207,255,0.08)'
                  : '0 0 70px rgba(255,45,85,0.18), 0 0 140px rgba(255,45,85,0.08)',
            }}
          >
            <div
              className="ff-orbit"
              style={{
                color: game.winner === 'blue' ? '#00CFFF' : '#FF2D55',
                fontSize: '11px',
                letterSpacing: '0.35em',
                marginBottom: '10px',
                textShadow:
                  game.winner === 'blue'
                    ? '0 0 18px rgba(0,207,255,0.85)'
                    : '0 0 18px rgba(255,45,85,0.85)',
              }}
            >
              {game.winner === 'blue' ? 'BLUE' : 'RED'} WINS
            </div>

            <h2
              className="ff-bebas"
              style={{
                fontSize: '72px',
                lineHeight: 0.9,
                margin: '0 0 10px',
                color: game.winner === myColor ? '#fff' : 'rgba(170,170,255,0.4)',
                letterSpacing: '0.02em',
              }}
            >
              {game.winner === myColor ? 'VICTORY' : myColor ? 'DEFEAT' : 'GAME\nOVER'}
            </h2>

            <p
              className="ff-space"
              style={{
                color: 'rgba(170,170,255,0.25)',
                fontSize: '9px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: '28px',
              }}
            >
              Board fully conquered
            </p>

            <button
              onClick={() => router.push('/')}
              className="ff-bebas"
              style={{
                width: '100%',
                padding: '18px',
                background: 'transparent',
                border: `2px solid ${game.winner === 'blue' ? 'rgba(0,207,255,0.65)' : 'rgba(255,45,85,0.65)'}`,
                color: game.winner === 'blue' ? '#00CFFF' : '#FF2D55',
                fontSize: '26px',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background =
                  game.winner === 'blue' ? 'rgba(0,207,255,0.1)' : 'rgba(255,45,85,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
