import { Cell, Grid, Player } from './types';

export const GRID_SIZE = 5;
export const EXPLODE_AT = 4;

export function createInitialGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, (): Cell => ({ owner: null, value: 0 }))
  );
}

export function getAdjacentCells(row: number, col: number): [number, number][] {
  const adj: [number, number][] = [];
  if (row > 0) adj.push([row - 1, col]);
  if (row < GRID_SIZE - 1) adj.push([row + 1, col]);
  if (col > 0) adj.push([row, col - 1]);
  if (col < GRID_SIZE - 1) adj.push([row, col + 1]);
  return adj;
}

export function placeStartingCircle(grid: Grid, row: number, col: number, player: Player): Grid {
  const g: Grid = JSON.parse(JSON.stringify(grid));
  g[row][col] = { owner: player, value: 1 };
  return g;
}

export function processMove(grid: Grid, row: number, col: number, player: Player): Grid {
  if (grid[row][col].owner !== player) return grid;

  const g: Grid = JSON.parse(JSON.stringify(grid));
  g[row][col] = { owner: player, value: g[row][col].value + 1 };

  const queue: [number, number][] = [];
  if (g[row][col].value >= EXPLODE_AT) {
    queue.push([row, col]);
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (g[r][c].value < EXPLODE_AT) continue;

    g[r][c] = { owner: null, value: 0 };

    for (const [nr, nc] of getAdjacentCells(r, c)) {
      const prevValue = g[nr][nc].value;
      g[nr][nc] = { owner: player, value: prevValue + 1 };
      if (g[nr][nc].value >= EXPLODE_AT) {
        queue.push([nr, nc]);
      }
    }
  }

  return g;
}

export function countCircles(grid: Grid): { blue: number; red: number } {
  let blue = 0;
  let red = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.owner === 'blue') blue++;
      else if (cell.owner === 'red') red++;
    }
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
