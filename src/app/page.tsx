'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createInitialGrid } from '@/lib/gameLogic';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
      setError('Failed to create game. Check your connection and try again.');
      setLoading(false);
      return;
    }

    router.push(`/game/${roomId}`);
  };

  const joinGame = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Enter a valid 6-character room code.');
      return;
    }
    router.push(`/game/${code}`);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-6">
      <div className="bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-slate-700">
        {/* Logo area */}
        <div className="flex justify-center gap-2 mb-4">
          <div className="w-5 h-5 rounded-full bg-[#29C5E6]" />
          <div className="w-5 h-5 rounded-full bg-[#E84040]" />
        </div>

        <h1 className="text-4xl font-black text-center text-white mb-1 tracking-tight">
          COLOR WARS
        </h1>
        <p className="text-slate-400 text-center text-sm mb-8">
          Grow your circles. Conquer the board.
        </p>

        <button
          onClick={createGame}
          disabled={loading}
          className="w-full py-4 bg-[#29C5E6] hover:bg-[#20B0D0] active:bg-[#1A9EBE] text-white font-bold text-lg rounded-2xl mb-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating room...' : 'Create Game'}
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-slate-800 px-3 text-slate-400 text-sm">
              or join with code
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => {
              setError('');
              setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            }}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="XXXXXX"
            maxLength={6}
            className="flex-1 px-4 py-3 bg-slate-700 text-white font-mono text-lg rounded-xl border border-slate-600 focus:outline-none focus:border-[#29C5E6] tracking-widest placeholder:text-slate-500 uppercase"
          />
          <button
            onClick={joinGame}
            className="px-5 py-3 bg-[#E84040] hover:bg-[#D03030] active:bg-[#B82828] text-white font-bold text-lg rounded-xl transition-colors"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
        )}

        <div className="mt-8 pt-6 border-t border-slate-700 text-slate-500 text-xs text-center space-y-1.5">
          <p>Click your circles to grow them (+1 point each turn).</p>
          <p>At 4 points a circle splits in all 4 directions.</p>
          <p>Conquered enemy circles gain +1 and may chain-react.</p>
          <p className="font-semibold text-slate-400">Last player standing wins.</p>
        </div>
      </div>
    </main>
  );
}
