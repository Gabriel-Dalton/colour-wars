export type Player = 'blue' | 'red';

export type GameStatus =
  | 'waiting'
  | 'placement_blue'
  | 'placement_red'
  | 'playing'
  | 'finished';

// classic = can only click your own circles (strict Chain Reaction)
// open    = can click your own OR any empty cell
export type GameMode = 'classic' | 'open';

export interface Cell {
  owner: Player | null;
  value: number;
}

export type Grid = Cell[][];

export interface GameRow {
  id: string;
  status: GameStatus;
  blue_player_id: string | null;
  red_player_id: string | null;
  current_turn: Player;
  grid: Grid;
  winner: Player | null;
  move_count: number;
  created_at: string;
  rematch_requested_by: Player | null;
  rematch_room_id: string | null;
  last_move_row: number | null;
  last_move_col: number | null;
  mode?: GameMode | null;
}
