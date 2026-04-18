# COLOUR WARS

A real-time, two-player grid conquest game with a neo-arcade aesthetic. Pick a starting square, then chain-react your circles across a 5×5 board until one colour owns everything.

<p align="center">
  <img src="docs/home.png" alt="Home screen" width="420" />
</p>

> To add your own screenshots, drop PNGs into a `docs/` folder at the project root with the filenames below (`home.png`, `game.png`, `explosion.png`, `victory.png`). They'll render automatically.

---

## Screenshots

| Lobby | In-game |
|:---:|:---:|
| <img src="docs/home.png" width="320" /> | <img src="docs/game.png" width="320" /> |

| Chain reaction | Victory |
|:---:|:---:|
| <img src="docs/explosion.png" width="320" /> | <img src="docs/victory.png" width="320" /> |

---

## Features

- **Cross-device multiplayer** via Supabase Realtime — two players, one board, zero lag
- **2-letter room codes** — friction-free sharing (e.g. `KP`, `XJ`)
- **Animated explosions** — orbs visibly fly from the exploding cell to each neighbour, followed by a bounce on receive and a capture flash when enemy cells flip
- **Neon CRT aesthetic** — Bebas Neue title, Orbitron score HUD, Space Mono body, scanline overlay, drifting ambient orbs
- **Turn-aware glow** — board, HUD, and ambient colour all shift with the active player
- **Territory bar** — live percentage split between blue and red
- **Last-move marker** — ringed highlight on the cell most recently played
- **Reconnect-safe** — refreshing or backgrounding the tab re-syncs state and re-subscribes
- **Rematch flow** — one click to spin up a fresh room with the same opponent
- **Graceful DB fallback** — if optional columns haven't been added yet, the game drops them and keeps playing

---

## How to play

1. Player 1 clicks **CREATE GAME** → gets a 2-letter room code
2. Player 2 types the code and hits **GO**
3. Each player picks a starting square — it spawns with 3 dots (one click away from exploding)
4. On your turn, click any empty square or one of your own circles to add +1
5. A circle reaching **4 dots explodes** — it clears itself and sends one orb up, down, left, and right (never diagonal)
6. Orbs landing on enemy cells **convert them to your colour** and may chain-react
7. First player to own every filled circle on the board wins

---

## Setup

### 1. Create the Supabase table

In Supabase → **SQL Editor**:

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'waiting',
  blue_player_id TEXT,
  red_player_id TEXT,
  current_turn TEXT DEFAULT 'blue',
  grid JSONB NOT NULL,
  winner TEXT,
  move_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public access (no auth for this game)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON games FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE games;
```

### 2. Optional columns (last-move marker + rematch)

These aren't required — the client will detect they're missing and keep working — but running this unlocks the last-move highlight and rematch button:

```sql
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS last_move_row      INTEGER,
  ADD COLUMN IF NOT EXISTS last_move_col      INTEGER,
  ADD COLUMN IF NOT EXISTS rematch_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS rematch_room_id    TEXT;
```

### 3. Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in Supabase → **Project Settings → API**.

### 4. Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000> in two browser windows (or two devices on the same network) to test multiplayer.

### 5. Deploy to Vercel

```bash
npx vercel
```

Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in your Vercel project settings.

---

## Tech stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Supabase** — Postgres + Realtime websockets
- **Tailwind CSS** — layout utilities
- **Custom CSS keyframes** — neon pulses, board glow, burst/receive/capture animations
- **Google Fonts** — Bebas Neue, Orbitron, Space Mono

---

## Game logic

- Uniform **critical mass = 4** (every cell explodes at 4 dots)
- Starting circles spawn at **critical mass − 1** so the first click always triggers an explosion
- Explosions only propagate **orthogonally** — up, down, left, right (no diagonals)
- Chain reactions resolve wave by wave, each wave animated as its own step
- Win condition: opponent's circle count drops to zero while yours is above zero
