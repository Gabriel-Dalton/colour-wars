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
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          setGame(payload.new as GameRow);
        }
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
          .update({
            grid: newGrid,
            status: 'playing',
            current_turn: 'blue',
            move_count: 0,
          })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <p className="text-white text-xl font-bold animate-pulse">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 gap-4 p-6">
        <p className="text-red-400 text-xl text-center">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-[#29C5E6] text-white font-bold rounded-xl"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!game) return null;

  const counts = countCircles(game.grid);
  const isWaiting = game.status === 'waiting';
  const isPlacingNow =
    (game.status === 'placement_blue' && myColor === 'blue') ||
    (game.status === 'placement_red' && myColor === 'red');
  const isFinished = game.status === 'finished';
  const isMyTurn = game.status === 'playing' && game.current_turn === myColor;

  function statusText(): string {
    if (isWaiting) return 'Waiting for opponent to join...';
    if (game!.status === 'placement_blue') {
      return myColor === 'blue'
        ? 'Pick your starting position'
        : 'Blue is choosing their starting position...';
    }
    if (game!.status === 'placement_red') {
      return myColor === 'red'
        ? 'Pick your starting position'
        : 'Red is choosing their starting position...';
    }
    if (isFinished) {
      if (!myColor) return `${game!.winner === 'blue' ? 'Blue' : 'Red'} wins!`;
      return game!.winner === myColor ? 'You win!' : 'You lose!';
    }
    if (isMyTurn) return 'Your turn — click one of your circles';
    const turnName = game!.current_turn === 'blue' ? 'Blue' : 'Red';
    return `${turnName}'s turn...`;
  }

  const playerLabel = myColor
    ? `You are ${myColor === 'blue' ? '🔵 Blue' : '🔴 Red'}`
    : 'Spectating';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#D4785A] p-4 gap-5">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow">
          COLOR WARS
        </h1>
        <span className="text-white/70 text-sm font-medium">{playerLabel}</span>
      </div>

      {/* Scoreboard */}
      <div className="flex gap-4">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
            myColor === 'blue' ? 'bg-white/30 ring-2 ring-white/50' : 'bg-white/15'
          }`}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-[#29C5E6] shadow" />
          <span className="text-white font-bold text-lg leading-none">{counts.blue}</span>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
            myColor === 'red' ? 'bg-white/30 ring-2 ring-white/50' : 'bg-white/15'
          }`}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-[#E84040] shadow" />
          <span className="text-white font-bold text-lg leading-none">{counts.red}</span>
        </div>
      </div>

      {/* Room code badge */}
      <div className="text-white/60 text-xs font-mono tracking-widest">
        ROOM: {roomId}
      </div>

      <Grid
        grid={game.grid}
        onCellClick={handleCellClick}
        myColor={myColor}
        gameStatus={game.status}
        currentTurn={game.current_turn}
        isPlacingNow={isPlacingNow}
        submitting={submitting}
      />

      {/* Status message */}
      <div
        className={`px-5 py-2.5 rounded-2xl text-center font-bold text-base transition-all ${
          isMyTurn || isPlacingNow
            ? 'bg-white text-[#D4785A]'
            : 'bg-white/20 text-white'
        }`}
      >
        {statusText()}
      </div>

      {/* Share panel — only shown to blue while waiting */}
      {isWaiting && myColor === 'blue' && (
        <div className="flex flex-col items-center gap-3 bg-white/15 rounded-2xl p-5 w-full max-w-xs">
          <p className="text-white/80 text-sm">Share this code with your opponent:</p>
          <span className="font-mono font-black text-3xl text-white tracking-[0.3em]">
            {roomId}
          </span>
          <button
            onClick={copyLink}
            className="px-5 py-2 bg-white text-[#D4785A] font-bold rounded-xl text-sm transition hover:bg-white/90 active:scale-95"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      {/* Back button */}
      {!isFinished && (
        <button
          onClick={() => router.push('/')}
          className="text-white/40 hover:text-white/70 text-sm transition"
        >
          ← Leave game
        </button>
      )}

      {/* Win / lose overlay */}
      {isFinished && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl w-full max-w-xs">
            <div className="text-6xl mb-3">
              {game.winner === myColor ? '🎉' : myColor ? '😔' : '🏆'}
            </div>
            <h2 className="text-3xl font-black mb-1">
              {game.winner === myColor
                ? 'You Win!'
                : myColor
                ? 'You Lose'
                : `${game.winner === 'blue' ? 'Blue' : 'Red'} Wins!`}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              {game.winner === 'blue' ? '🔵 Blue' : '🔴 Red'} conquered the entire board
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/')}
                className="flex-1 py-3 bg-[#D4785A] text-white font-bold rounded-2xl hover:bg-[#C0664A] transition"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
