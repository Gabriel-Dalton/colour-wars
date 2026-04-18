import { Cell, Grid, Player } from './types';

export const GRID_SIZE = 5;

export function createInitialGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, (): Cell => ({ owner: null, value: 0 }))
  );
}

export function getAdjacentCells(row: number, col: number): [number, number][] {
  const adj: [number, number][] = [];
  if (row > 0)             adj.push([row - 1, col]);
  if (row < GRID_SIZE - 1) adj.push([row + 1, col]);
  if (col > 0)             adj.push([row, col - 1]);
  if (col < GRID_SIZE - 1) adj.push([row, col + 1]);
  return adj;
}

// Uniform critical mass: every cell explodes at 4, regardless of position.
export function getCriticalMass(_row: number, _col: number): number {
  return 4;
}

// Place starting circle one dot below critical mass — so first click causes explosion
export function placeStartingCircle(grid: Grid, row: number, col: number, player: Player): Grid {
  const g: Grid = JSON.parse(JSON.stringify(grid));
  const startValue = getCriticalMass(row, col) - 1;
  g[row][col] = { owner: player, value: startValue };
  return g;
}

// Can click own cell or empty cell; enemy cells are off-limits
export function processMove(grid: Grid, row: number, col: number, player: Player): Grid {
  if (grid[row][col].owner !== null && grid[row][col].owner !== player) return grid;

  const g: Grid = JSON.parse(JSON.stringify(grid));
  g[row][col] = { owner: player, value: g[row][col].value + 1 };

  const queue: [number, number][] = [];
  if (g[row][col].value >= getCriticalMass(row, col)) {
    queue.push([row, col]);
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (g[r][c].value < getCriticalMass(r, c)) continue;

    g[r][c] = { owner: null, value: 0 };

    for (const [nr, nc] of getAdjacentCells(r, c)) {
      g[nr][nc] = { owner: player, value: g[nr][nc].value + 1 };
      if (g[nr][nc].value >= getCriticalMass(nr, nc)) {
        queue.push([nr, nc]);
      }
    }
  }

  return g;
}

export function countCircles(grid: Grid): { blue: number; red: number } {
  let blue = 0, red = 0;
  for (const row of grid)
    for (const cell of row) {
      if (cell.owner === 'blue') blue++;
      else if (cell.owner === 'red') red++;
    }
  return { blue, red };
}

export function checkWinner(grid: Grid): Player | null {
  const { blue, red } = countCircles(grid);
  if (blue === 0 && red > 0) return 'red';
  if (red === 0 && blue > 0) return 'blue';
  return null;
}

export function nextTurn(current: Player): Player {
  return current === 'blue' ? 'red' : 'blue';
}

export interface ExplosionStep {
  explodingCells: [number, number][];
  receivingCells: [number, number][];
  gridAfter: Grid;
}

/** Returns the initial grid (after +1) plus each wave of explosions separately, for animation. */
export function processMoveStepped(
  grid: Grid,
  row: number,
  col: number,
  player: Player
): { initialGrid: Grid; steps: ExplosionStep[] } {
  if (grid[row][col].owner !== null && grid[row][col].owner !== player) {
    return { initialGrid: grid, steps: [] };
  }

  const g: Grid = JSON.parse(JSON.stringify(grid));
  g[row][col] = { owner: player, value: g[row][col].value + 1 };
  const initialGrid: Grid = JSON.parse(JSON.stringify(g));
  const steps: ExplosionStep[] = [];

  let wave: [number, number][] = [];
  if (g[row][col].value >= getCriticalMass(row, col)) wave.push([row, col]);

  while (wave.length > 0) {
    const explodingCells = wave.filter(([r, c]) => g[r][c].value >= getCriticalMass(r, c));
    if (explodingCells.length === 0) break;

    const receivingSet = new Set<string>();
    const receivingCells: [number, number][] = [];
    const nextWaveSet = new Set<string>();
    const nextWave: [number, number][] = [];

    for (const [r, c] of explodingCells) {
      g[r][c] = { owner: null, value: 0 };
      for (const [nr, nc] of getAdjacentCells(r, c)) {
        g[nr][nc] = { owner: player, value: g[nr][nc].value + 1 };
        const k = `${nr},${nc}`;
        if (!receivingSet.has(k)) { receivingSet.add(k); receivingCells.push([nr, nc]); }
        if (g[nr][nc].value >= getCriticalMass(nr, nc) && !nextWaveSet.has(k)) {
          nextWaveSet.add(k); nextWave.push([nr, nc]);
        }
      }
    }

    steps.push({ explodingCells, receivingCells, gridAfter: JSON.parse(JSON.stringify(g)) });
    wave = nextWave;
  }

  return { initialGrid, steps };
}
