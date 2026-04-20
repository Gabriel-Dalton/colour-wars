import { useEffect, useRef, useState } from 'react';
import { GameRow, Player } from './types';
import { countCircles } from './gameLogic';

export interface MatchStats {
  durationMs: number;
  leadMsBlue: number;
  leadMsRed: number;
  leadMsTied: number;
  leadChanges: number;
  biggestChain: number;            // largest swing in one move (cells gained + cells taken from enemy)
  biggestChainBy: Player | null;
  peakBlue: number;                // max cells blue ever owned at once
  peakRed: number;
  totalMoves: number;
  currentLeader: 'blue' | 'red' | 'tied';
}

const empty: Omit<MatchStats, 'durationMs' | 'totalMoves' | 'currentLeader'> = {
  leadMsBlue: 0,
  leadMsRed: 0,
  leadMsTied: 0,
  leadChanges: 0,
  biggestChain: 0,
  biggestChainBy: null,
  peakBlue: 0,
  peakRed: 0,
};

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Accumulates match stats as a side-effect of game-state changes plus a 1 Hz ticker.
 * Resets whenever the `roomId` changes so a rematch gets a fresh slate.
 */
export function useMatchStats(game: GameRow | null): MatchStats {
  const [, force] = useState(0);
  const statsRef = useRef({ ...empty });
  const gameRef = useRef<GameRow | null>(null);
  const startRef = useRef<number | null>(null);
  const finishedAtRef = useRef<number | null>(null);
  const lastLeaderRef = useRef<'blue' | 'red' | 'tied' | null>(null);
  const lastMoveCountRef = useRef<number>(-1);
  const lastCountsRef = useRef<{ blue: number; red: number }>({ blue: 0, red: 0 });
  const roomRef = useRef<string | null>(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // Reset on room change
  useEffect(() => {
    if (!game) return;
    if (roomRef.current !== game.id) {
      roomRef.current = game.id;
      statsRef.current = { ...empty };
      startRef.current = null;
      finishedAtRef.current = null;
      lastLeaderRef.current = null;
      lastMoveCountRef.current = -1;
      lastCountsRef.current = { blue: 0, red: 0 };
      force((x) => x + 1);
    }
  }, [game]);

  // Update peak + biggest chain on each game change
  useEffect(() => {
    if (!game) return;
    const { blue, red } = countCircles(game.grid);
    const s = statsRef.current;

    if (game.move_count !== lastMoveCountRef.current && lastMoveCountRef.current >= 0) {
      const pc = lastCountsRef.current;
      // Whoever just moved is the opposite of current_turn (the turn flipped on their move).
      // If the game just finished, current_turn doesn't flip — use winner instead.
      const mover: Player =
        game.winner
          ? game.winner
          : (game.current_turn === 'blue' ? 'red' : 'blue');
      // Swing = cells gained by mover + cells taken away from their enemy
      const swing =
        mover === 'blue'
          ? (blue - pc.blue) + (pc.red - red)
          : (red - pc.red) + (pc.blue - blue);
      if (swing > s.biggestChain) {
        s.biggestChain = swing;
        s.biggestChainBy = mover;
      }
    }
    lastMoveCountRef.current = game.move_count;
    lastCountsRef.current = { blue, red };
    if (blue > s.peakBlue) s.peakBlue = blue;
    if (red > s.peakRed) s.peakRed = red;

    if (game.status === 'finished' && finishedAtRef.current === null) {
      finishedAtRef.current = Date.now();
    }

    force((x) => x + 1);
  }, [game]);

  // 1 Hz ticker: accumulate lead time while game is active
  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const active =
        g.status === 'playing' ||
        g.status === 'placement_blue' ||
        g.status === 'placement_red';
      if (!active) return;
      if (startRef.current === null) startRef.current = Date.now();
      const { blue, red } = countCircles(g.grid);
      const leader: 'blue' | 'red' | 'tied' =
        blue === red ? 'tied' : blue > red ? 'blue' : 'red';
      const s = statsRef.current;
      if (leader === 'blue') s.leadMsBlue += 1000;
      else if (leader === 'red') s.leadMsRed += 1000;
      else s.leadMsTied += 1000;
      if (
        lastLeaderRef.current &&
        lastLeaderRef.current !== leader &&
        lastLeaderRef.current !== 'tied' &&
        leader !== 'tied'
      ) {
        s.leadChanges += 1;
      }
      lastLeaderRef.current = leader;
      force((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const now = finishedAtRef.current ?? Date.now();
  const durationMs = startRef.current ? now - startRef.current : 0;
  const { blue, red } = game ? countCircles(game.grid) : { blue: 0, red: 0 };
  const currentLeader: 'blue' | 'red' | 'tied' =
    blue === red ? 'tied' : blue > red ? 'blue' : 'red';

  return {
    ...statsRef.current,
    durationMs,
    totalMoves: game?.move_count ?? 0,
    currentLeader,
  };
}
