'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GameRow, Player, Grid as GridType } from '@/lib/types';
import {
  placeStartingCircle,
  processMoveStepped,
  checkWinner,
  nextTurn,
  countCircles,
  getAdjacentCells,
  createInitialGrid,
  computeImpactCells,
} from '@/lib/gameLogic';
import Grid, { FlyingOrbData } from '@/components/Grid';
import Chat from '@/components/Chat';
import type { RealtimeChannel } from '@supabase/supabase-js';

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('cw_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cw_player_id', id);
  }
  return id;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return (
    chars[Math.floor(Math.random() * chars.length)] +
    chars[Math.floor(Math.random() * chars.length)]
  );
}

export default function GameClient({ roomId }: { roomId: string }) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flyingOrbs, setFlyingOrbs] = useState<FlyingOrbData[]>([]);
  const [explodingCells, setExplodingCells] = useState<Set<string>>(new Set());
  const [receivingCells, setReceivingCells] = useState<Set<string>>(new Set());
  const [capturedCells, setCapturedCells] = useState<Set<string>>(new Set());
  const [lastImpactCells, setLastImpactCells] = useState<Set<string>>(new Set());
  const [showOverlay, setShowOverlay] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const rematchNavigatedRef = useRef(false);
  const animatingRef = useRef(false);
  const gameRef = useRef<GameRow | null>(null);
  const myColorRef = useRef<Player | null>(null);
  const lastAnimatedMoveKeyRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Keep refs synced so the realtime handler (stable closure) can read current values
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);

  // Unique identifier for a game-state "move" — used to prevent re-animating a move twice
  const moveKey = (g: GameRow): string =>
    `${g.status}:${g.move_count}:${g.last_move_row},${g.last_move_col}:${g.current_turn}`;

  // Fields we added recently that may not exist yet in older DBs — we strip them on error to stay resilient.
  const OPTIONAL_FIELDS = ['last_move_row', 'last_move_col', 'rematch_requested_by', 'rematch_room_id'];

  // Update a game row. If the DB rejects because of missing columns (user hasn't run the ALTER TABLE),
  // retry without those columns so gameplay still works.
  const updateGameRow = useCallback(async (updates: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.from('games').update(updates).eq('id', roomId);
    if (!error) return { ok: true };

    const message = error.message ?? '';
    const missingOptional = OPTIONAL_FIELDS.some(f => message.includes(f));
    if (missingOptional) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (!OPTIONAL_FIELDS.includes(k)) safe[k] = v;
      }
      const retry = await supabase.from('games').update(safe).eq('id', roomId);
      if (!retry.error) {
        console.warn('[colour-wars] Optional columns missing — retried without them. Run ALTER TABLE to enable the new features:', message);
        return { ok: true };
      }
      console.error('[colour-wars] Retry also failed:', retry.error);
      return { ok: false, error: retry.error.message };
    }
    console.error('[colour-wars] Game update failed:', error);
    return { ok: false, error: message };
  }, [roomId]);

  // Plays the explosion animation locally. Returns a promise that resolves with the final grid.
  const animateMove = useCallback((
    fromGrid: GridType,
    row: number,
    col: number,
    mover: Player
  ): Promise<GridType> => {
    animatingRef.current = true;
    const color = mover === 'blue' ? '#00CFFF' : '#FF2D55';
    const { initialGrid, steps } = processMoveStepped(fromGrid, row, col, mover);
    const finalGrid: GridType = steps.length > 0 ? steps[steps.length - 1].gridAfter : initialGrid;

    // Clear the previous move's impact ring — it's about to be replaced by this move's
    setLastImpactCells(new Set());

    // Show the +1 immediately
    setGame(prev => prev ? { ...prev, grid: initialGrid } : prev);

    const FLY = 520, RECV = 560, GAP = 120;
    let t = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      const orbs: FlyingOrbData[] = [];
      for (const [fr, fc] of step.explodingCells) {
        for (const [tr, tc] of getAdjacentCells(fr, fc)) {
          orbs.push({ id: `${fr},${fc}->${tr},${tc}-${i}`, fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, color });
        }
      }

      const delay = t;
      setTimeout(() => {
        setExplodingCells(new Set(step.explodingCells.map(([r, c]) => `${r},${c}`)));
        setFlyingOrbs(orbs);
      }, delay);

      const gridBeforeStep = i === 0 ? initialGrid : steps[i - 1].gridAfter;
      const captured = step.receivingCells.filter(([r, c]) => {
        const p = gridBeforeStep[r][c].owner;
        return p !== null && p !== mover;
      });
      const reinforced = step.receivingCells.filter(([r, c]) => {
        const p = gridBeforeStep[r][c].owner;
        return p === null || p === mover;
      });

      setTimeout(() => {
        setFlyingOrbs([]);
        setExplodingCells(new Set());
        setGame(prev => prev ? { ...prev, grid: step.gridAfter } : prev);
        setReceivingCells(new Set(reinforced.map(([r, c]) => `${r},${c}`)));
        setCapturedCells(new Set(captured.map(([r, c]) => `${r},${c}`)));
      }, delay + FLY);

      setTimeout(() => {
        setReceivingCells(new Set());
        setCapturedCells(new Set());
      }, delay + FLY + RECV);

      t += FLY + RECV + GAP;
    }

    return new Promise(resolve => {
      setTimeout(() => {
        animatingRef.current = false;
        // Highlight every cell the mover now controls that changed — not just the clicked one
        setLastImpactCells(computeImpactCells(fromGrid, finalGrid, mover));
        resolve(finalGrid);
      }, t);
    });
  }, []);

  // Extracted so it can be called on reconnect without re-running the join logic
  const subscribe = useCallback(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`game:${roomId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${roomId}` },
        async (payload) => {
          const incoming = payload.new as GameRow;
          const prev = gameRef.current;
          const incomingKey = moveKey(incoming);

          // Echo of a move this client already animated locally — just sync state
          if (lastAnimatedMoveKeyRef.current === incomingKey) {
            setGame(incoming);
            return;
          }

          // If already mid-animation (shouldn't happen normally), just apply state
          if (animatingRef.current || !prev) {
            setGame(incoming);
            lastAnimatedMoveKeyRef.current = incomingKey;
            return;
          }

          // Opponent played a regular move — replay their animation before applying final state
          const isPlayMove =
            prev.status === 'playing' &&
            (incoming.status === 'playing' || incoming.status === 'finished') &&
            incoming.move_count > prev.move_count &&
            typeof incoming.last_move_row === 'number' &&
            typeof incoming.last_move_col === 'number';

          if (isPlayMove) {
            const mover: Player =
              incoming.winner
                ? incoming.winner
                : (incoming.current_turn === 'blue' ? 'red' : 'blue');

            lastAnimatedMoveKeyRef.current = incomingKey;
            await animateMove(prev.grid, incoming.last_move_row!, incoming.last_move_col!, mover);
            setGame(incoming);
            return;
          }

          // Placements, rematch state changes, initial join, etc. — apply instantly
          // For placement moves, highlight the just-placed cell as "last move"
          const isPlacement =
            (prev.status === 'placement_blue' && incoming.status === 'placement_red') ||
            (prev.status === 'placement_red' && incoming.status === 'playing');
          if (isPlacement) {
            const mover: Player = prev.status === 'placement_blue' ? 'blue' : 'red';
            setLastImpactCells(computeImpactCells(prev.grid, incoming.grid, mover));
          }
          setGame(incoming);
          lastAnimatedMoveKeyRef.current = incomingKey;
        }
      )
      .subscribe();
  }, [roomId, animateMove]);

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
      if (data) {
        setGame(data as GameRow);
        lastAnimatedMoveKeyRef.current = moveKey(data as GameRow);
      }
      subscribe();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [roomId, subscribe]);

  // When rematch_room_id appears, both clients auto-navigate to the new room
  useEffect(() => {
    if (!game?.rematch_room_id || rematchNavigatedRef.current) return;
    rematchNavigatedRef.current = true;
    router.push(`/game/${game.rematch_room_id}`);
  }, [game?.rematch_room_id, router]);

  // Delay the win overlay so both players can see the final board state
  useEffect(() => {
    if (!game) return;
    const status = game.status;
    const wasFinished = prevStatusRef.current === 'finished';
    prevStatusRef.current = status;

    if (status === 'finished' && !wasFinished) {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setShowOverlay(true), 2600);
    }
    if (status !== 'finished') {
      setShowOverlay(false);
      if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status]);

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
    lastAnimatedMoveKeyRef.current = moveKey(gameData);
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
        if (current_turn !== myColor) return;
        const mode = game.mode ?? 'classic';
        const cellOwner = grid[row][col].owner;
        if (mode === 'classic') {
          // Classic: you may only click cells you own.
          if (cellOwner !== myColor) return;
        } else {
          // Open: you may click cells you own OR any empty cell.
          if (cellOwner !== null && cellOwner !== myColor) return;
        }
      } else {
        return;
      }

      setSubmitting(true);
      try {
        if (status === 'placement_blue') {
          const newGrid = placeStartingCircle(grid, row, col, 'blue');
          const nextState: GameRow = { ...game, grid: newGrid, status: 'placement_red', current_turn: 'red', last_move_row: row, last_move_col: col };
          lastAnimatedMoveKeyRef.current = moveKey(nextState);
          setLastImpactCells(computeImpactCells(grid, newGrid, 'blue'));
          setGame(nextState); // optimistic — mover sees their placement instantly
          await updateGameRow({ grid: newGrid, status: 'placement_red', current_turn: 'red', last_move_row: row, last_move_col: col });
        } else if (status === 'placement_red') {
          const newGrid = placeStartingCircle(grid, row, col, 'red');
          const nextState: GameRow = { ...game, grid: newGrid, status: 'playing', current_turn: 'blue', move_count: 0, last_move_row: row, last_move_col: col };
          lastAnimatedMoveKeyRef.current = moveKey(nextState);
          setLastImpactCells(computeImpactCells(grid, newGrid, 'red'));
          setGame(nextState);
          await updateGameRow({ grid: newGrid, status: 'playing', current_turn: 'blue', move_count: 0, last_move_row: row, last_move_col: col });
        } else {
          // Mover's local animation — same helper the opponent uses when the realtime update arrives
          const finalGrid = await animateMove(grid, row, col, myColor!);
          const winner = checkWinner(finalGrid);
          const newMoveCount = (game.move_count ?? 0) + 1;
          const newCurrentTurn = winner ? current_turn : nextTurn(myColor!);
          const newStatus: GameRow['status'] = winner ? 'finished' : 'playing';
          const expectedState: GameRow = {
            ...game,
            grid: finalGrid,
            current_turn: newCurrentTurn,
            winner: winner ?? null,
            status: newStatus,
            move_count: newMoveCount,
            last_move_row: row,
            last_move_col: col,
          };
          lastAnimatedMoveKeyRef.current = moveKey(expectedState);
          setGame(expectedState); // keep mover's UI in sync with what we just animated
          await updateGameRow({
            grid: finalGrid,
            current_turn: newCurrentTurn,
            winner: winner ?? null,
            status: newStatus,
            move_count: newMoveCount,
            last_move_row: row,
            last_move_col: col,
          });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [game, myColor, roomId, submitting, animateMove, updateGameRow]
  );

  const handleRematch = async () => {
    if (!game || !myColor || rematchBusy) return;
    if (game.rematch_room_id) return;
    setRematchBusy(true);
    setRematchError(null);
    try {
      const opponentRequested =
        game.rematch_requested_by && game.rematch_requested_by !== myColor;

      if (!opponentRequested) {
        // First player to click — flag request and wait for opponent
        const { data, error } = await supabase
          .from('games')
          .update({ rematch_requested_by: myColor })
          .eq('id', roomId)
          .select()
          .single();
        if (error) {
          console.error('[rematch] request failed', error);
          setRematchError(error.message || 'Could not send rematch request');
          setRematchBusy(false);
          return;
        }
        if (data) setGame(data as GameRow); // optimistic — realtime will confirm
        setRematchBusy(false);
        return;
      }

      // Opponent already asked — create the new game and link it
      const newRoomId = generateRoomCode();
      const { error: insertError } = await supabase.from('games').insert({
        id: newRoomId,
        status: 'placement_blue',
        // Swap colors so the previous loser starts (blue places first)
        blue_player_id: game.red_player_id,
        red_player_id: game.blue_player_id,
        current_turn: 'blue',
        grid: createInitialGrid(),
        winner: null,
        move_count: 0,
      });
      if (insertError) {
        console.error('[rematch] insert failed', insertError);
        setRematchError(insertError.message || 'Could not create new room');
        setRematchBusy(false);
        return;
      }
      const { error: linkError } = await supabase
        .from('games')
        .update({ rematch_room_id: newRoomId })
        .eq('id', roomId);
      if (linkError) {
        console.error('[rematch] link failed', linkError);
        setRematchError(linkError.message || 'Could not link rematch room');
        setRematchBusy(false);
        return;
      }
      // leave rematchBusy true — we're about to navigate
    } catch (e) {
      console.error('[rematch] unexpected', e);
      setRematchError('Unexpected error — check console');
      setRematchBusy(false);
    }
  };

  const cancelRematch = async () => {
    if (!game) return;
    setRematchError(null);
    const { data, error } = await supabase
      .from('games')
      .update({ rematch_requested_by: null })
      .eq('id', roomId)
      .select()
      .single();
    if (error) {
      console.error('[rematch] cancel failed', error);
      setRematchError(error.message || 'Could not cancel rematch');
      return;
    }
    if (data) setGame(data as GameRow);
  };

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
          style={{ color: 'rgba(170,170,255,0.2)', fontSize: '9px', letterSpacing: '0.18em', display: 'flex', gap: '10px', alignItems: 'center' }}
        >
          <span>ROOM: {roomId}</span>
          <span style={{ color: 'rgba(170,170,255,0.35)', letterSpacing: '0.2em' }}>
            · {(game.mode ?? 'classic').toUpperCase()}
          </span>
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
        flyingOrbs={flyingOrbs}
        explodingCells={explodingCells}
        receivingCells={receivingCells}
        capturedCells={capturedCells}
        lastImpactCells={lastImpactCells}
        mode={game.mode ?? 'classic'}
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

      {/* ── Game-over hint — visible before overlay slides in ── */}
      {isFinished && !showOverlay && (
        <div
          className="anim-slide-up-fast"
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            pointerEvents: 'none',
          }}
        >
          <span
            className="ff-space"
            style={{
              color: winnerColor,
              fontSize: '9px',
              letterSpacing: '0.22em',
              opacity: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {game.winner === myColor ? 'victory — see the final board' : 'defeat — see what happened'}
          </span>
        </div>
      )}

      {/* ── Quick-chat / taunts ─────────────────────────────── */}
      <Chat roomId={roomId} myColor={myColor} />

      {/* ── Win overlay ──────────────────────────────────────── */}
      {showOverlay && (
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

            {(() => {
              const iRequested = game.rematch_requested_by === myColor;
              const theyRequested =
                !!game.rematch_requested_by && game.rematch_requested_by !== myColor;
              const canRematch = !!myColor;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {theyRequested && (
                    <div
                      className="ff-space anim-slide-up-fast"
                      style={{
                        color: 'rgba(240,240,255,0.85)',
                        fontSize: '10px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '4px',
                      }}
                    >
                      Opponent wants a rematch
                    </div>
                  )}

                  {canRematch && !iRequested && (
                    <button
                      onClick={handleRematch}
                      disabled={rematchBusy}
                      className="ff-bebas"
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: theyRequested
                          ? 'rgba(0,207,255,0.12)'
                          : 'transparent',
                        border: '1px solid rgba(0,207,255,0.55)',
                        borderLeft: '3px solid #00CFFF',
                        color: '#00CFFF',
                        fontSize: '24px',
                        letterSpacing: '0.12em',
                        cursor: rematchBusy ? 'not-allowed' : 'pointer',
                        opacity: rematchBusy ? 0.6 : 1,
                        transition: 'background 0.15s ease',
                        borderRadius: '3px',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,207,255,0.12)'; }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = theyRequested
                          ? 'rgba(0,207,255,0.12)'
                          : 'transparent';
                      }}
                    >
                      {theyRequested ? 'ACCEPT REMATCH' : 'REMATCH'}
                    </button>
                  )}

                  {canRematch && iRequested && !theyRequested && (
                    <button
                      onClick={cancelRematch}
                      className="ff-bebas"
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: 'rgba(0,207,255,0.04)',
                        border: '1px dashed rgba(0,207,255,0.4)',
                        color: 'rgba(0,207,255,0.75)',
                        fontSize: '18px',
                        letterSpacing: '0.14em',
                        cursor: 'pointer',
                        borderRadius: '3px',
                      }}
                    >
                      WAITING FOR OPPONENT... (CANCEL)
                    </button>
                  )}

                  {rematchError && (
                    <div
                      className="ff-space"
                      style={{
                        color: '#FF2D55',
                        fontSize: '9px',
                        letterSpacing: '0.14em',
                        padding: '8px 10px',
                        background: 'rgba(255,45,85,0.06)',
                        border: '1px solid rgba(255,45,85,0.35)',
                        borderRadius: '3px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                      }}
                    >
                      {rematchError}
                    </div>
                  )}

                  <button
                    onClick={() => router.push('/')}
                    className="ff-bebas"
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'transparent',
                      border: `1px solid rgba(${winnerRgb},0.4)`,
                      color: winnerColor,
                      fontSize: '18px',
                      letterSpacing: '0.14em',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      borderRadius: '3px',
                      opacity: 0.85,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(${winnerRgb},0.09)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    HOME
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
