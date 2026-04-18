# COLOUR WARS

A real-time, two-player grid conquest game with a neo-arcade aesthetic. Pick a starting square, chain-react your circles across a 5×5 board, and talk smack in live chat until one colour owns everything.

<p align="center">
  <img src="https://github.com/user-attachments/assets/db84bced-2f58-498c-b2d5-41ac93ff66f7" alt="Home screen" width="420" />
</p>

---

## Screenshots

| Lobby | In-game HUD |
|:---:|:---:|
| <img src="https://github.com/user-attachments/assets/db84bced-2f58-498c-b2d5-41ac93ff66f7" width="320" /> | <img src="https://github.com/user-attachments/assets/d9b54c07-9505-47bd-98e4-04e54238e5d9" width="320" /> |

| Chain reaction | Live chat |
|:---:|:---:|
| <img src="https://github.com/user-attachments/assets/40d42b4c-7af8-47b5-872d-765338c69afa" width="320" /> | <img src="https://github.com/user-attachments/assets/79b78c92-7038-4a92-bdfa-acd5bd8980ea" width="320" /> |

| Victory |
|:---:|
| <img src="https://github.com/user-attachments/assets/eae6fcc1-d598-479a-a4b1-c5fcf89d8073" width="320" /> |

---

## Features

### Multiplayer
- **Cross-device realtime** via Supabase — two players, one board, near-zero lag
- **2-letter room codes** (e.g. `KP`, `XJ`) — friction-free sharing, big LCD-style letter boxes on the lobby
- **Reconnect-safe** — refreshing the page or backgrounding the tab re-syncs state and re-subscribes to the channel
- **Rematch flow** — one click to spin up a fresh room with the same opponent; both clients auto-navigate
- **Graceful DB fallback** — if optional columns haven't been added yet, the client drops them and keeps playing

### Two game modes (picked by the creator)
| Mode | Click rules | Feel |
|---|---|---|
| **CLASSIC** | Only your own circles | Strict Chain Reaction. Growth happens only through explosions. More strategic. |
| **OPEN** | Your own circles **OR** any empty cell | Plant anywhere. Looser, more chaotic, faster-paced. |

Mode is selected on the lobby and displayed next to the room code in-game.

### Live chat & taunts
- **Free-form text** (120-char limit, 80-message history)
- **Eight quick-reply taunts** one tap away: `HURRY UP`, `LOVE YOU`, `GG`, `OOPS`, `NICE MOVE`, `YOU'RE COOKED`, `OOF`, `NOOO`
- **Floating pop-ins** — when you're not looking at chat, the opponent's newest message appears as a glowing bubble on the board, then fades
- **Unread badge** on the chat launcher when the panel is closed
- Runs on Supabase **broadcast** channels (no DB writes, no cleanup needed)

### Animation & feel
- **Flying orbs** — when a cell explodes, small glowing orbs visibly fly outward from the exploding cell to each orthogonal neighbour
- **Burst + receive** — the exploding circle scales up and fades out; receivers pop in with a bounce
- **Capture flash** — enemy cells that get converted play a distinct white-flash animation so you can see what you lost
- **Wave-by-wave chains** — chain reactions resolve one wave at a time, each wave a full animation step
- **Last-move impact rings** — after any move, every cell the mover now controls that *changed* gets a glowing ring (not just the clicked coordinate). Tells you exactly what your opponent did, even through a 10-step chain
- **Turn-aware glow** — board, HUD, and ambient orbs all shift colour based on whose turn it is
- **Territory bar** — live percentage split between blue and red

### Aesthetic
- **Fonts** — Bebas Neue (display), Orbitron (digits), Space Mono (body)
- **Scanline CRT overlay** — subtle, full-screen
- **Ambient drifting orbs** — cyan and red gradients floating behind the content
- **Dot-grid background** on the lobby

---

## How to play

1. **Create** — Player 1 picks a mode (Classic / Open), clicks CREATE GAME, gets a 2-letter room code
2. **Join** — Player 2 types the code and hits GO
3. **Place** — each player picks a starting square. It spawns with 3 dots (one click away from exploding)
4. **Play** — on your turn, click one of your own circles to add +1. In Open mode you can also seed any empty cell
5. **Explode** — a circle reaching 4 dots bursts and sends one orb up, down, left, and right (never diagonal)
6. **Convert** — orbs landing on enemy circles flip them to your colour and may trigger a chain reaction
7. **Win** — first player to reduce the opponent's circle count to zero wins the board
8. **Rematch** — hit PLAY AGAIN on the victory screen; both players auto-join the new room

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

### 2. Optional columns (last-move marker, rematch, mode)

These aren't required — the client detects missing columns and keeps playing — but running this unlocks the extras:

```sql
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS last_move_row       INTEGER,
  ADD COLUMN IF NOT EXISTS last_move_col       INTEGER,
  ADD COLUMN IF NOT EXISTS rematch_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS rematch_room_id     TEXT,
  ADD COLUMN IF NOT EXISTS mode                TEXT DEFAULT 'classic';
```

> Chat uses Supabase **broadcast** channels — no table or migration needed. Messages are ephemeral and live only for the session.

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

Open <http://localhost:3000> in two browser windows (or on two devices on the same network) to test multiplayer.

### 5. Deploy to Vercel

```bash
npx vercel
```

Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in your Vercel project settings.

---

## Tech stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Supabase** — Postgres + Realtime (postgres_changes for game state, broadcast for chat)
- **Tailwind CSS** — layout utilities
- **Custom CSS keyframes** — neon pulses, board glow, burst / receive / capture / flying-orb animations
- **Google Fonts** — Bebas Neue, Orbitron, Space Mono

---

## Game logic

- Uniform **critical mass = 4** (every cell explodes at 4 dots)
- Starting circles spawn at **critical mass − 1** so the first click always triggers an explosion
- Explosions propagate **orthogonally only** — up, down, left, right (no diagonals)
- Chain reactions resolve **wave by wave**, each wave animated as its own step
- **Win condition** — opponent's circle count drops to zero while yours is above zero
- **Mode enforcement** — clickability and click-guards on both client and server respect the selected mode; the opponent sees the same rules apply
