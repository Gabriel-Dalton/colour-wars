# COLOUR WARS

A real-time, two-player grid conquest game with a neo-arcade aesthetic. Pick a starting square, chain-react your circles across a 5×5 board, taunt your opponent in live chat, and — if you're the kind of person who wants to win that badly — deploy a fake Wi-Fi outage on their screen mid-match.

<p align="center">
  <img src="https://github.com/user-attachments/assets/db84bced-2f58-498c-b2d5-41ac93ff66f7" alt="Home screen" width="420" />
</p>

---

## Features

### Multiplayer

- **Cross-device realtime** via Supabase — two players, one board, near-zero lag
- **2-letter room codes** (e.g. `KP`, `XJ`) — friction-free sharing, big LCD-style letter boxes on the lobby
- **Open rooms browser** on the home page — live-polled list of waiting lobbies you can join with one click, so finding a match doesn't require texting someone a code
- **Reconnect-safe** — refreshing the page or backgrounding the tab re-fetches state and re-subscribes to the channel; mid-animation reconnects settle onto the final grid without double-playing moves
- **Rematch flow** — one click to spin up a fresh room with the same opponent; both clients auto-navigate. Colours are swapped so the previous loser opens the next game
- **Graceful DB fallback** — if optional columns haven't been added yet, the client retries without them and keeps playing

### Two game modes

| Mode | Click rules | Feel |
|---|---|---|
| **CLASSIC** | Only your own circles | Strict Chain Reaction. Growth happens only through explosions. More strategic. |
| **OPEN** | Your own circles **OR** any empty cell | Plant anywhere. Looser, more chaotic, faster-paced. |

Mode is selected on the lobby and displayed next to the room code in-game. Clickability, click-guards, and valid-move checks all respect the mode on both sides.

### Live chat & taunts

- **Free-form text** (120-char limit, 80-message history)
- **Eight one-tap taunts** — `HURRY UP`, `LOVE YOU`, `GG`, `OOPS`, `NICE MOVE`, `YOU'RE COOKED`, `OOF`, `NOOO`
- **Emoji reactions** on any message (👍 😂 🔥 💀 😭 ❤️) with per-user toggle + counts
- **Floating pop-ins** — when chat is closed, the opponent's newest message appears as a glowing bubble near the board and fades
- **Unread badge** on the COMMS launcher
- **Presence-based disconnect notices** — if your opponent drops off the chat channel, a system message lets you know
- Runs on Supabase **broadcast** channels — no DB writes, no cleanup, messages are ephemeral

### Match stats & insights

Stats are tracked client-side from realtime game-state updates plus a 1 Hz ticker — no DB writes.

**During the match** a compact strip shows:
- Seconds-of-lead accumulated by each colour
- Match duration
- Active leader highlighted in their colour
- Lead-change count + biggest single-move swing (once either becomes interesting)

**On the win screen** you get a full stats card:
- Lead-time bar (who was ahead and for what % of the game)
- Duration, total moves, lead changes
- **Biggest swing** — largest net cell change from a single move, colour-coded to whoever pulled it off (good for spotting game-winning chain reactions)
- **Peak dominance** — highest cell count each side ever reached

### Cheat-code toolbar 🎭

A secret prank surface for when you absolutely need to win against your partner. Type `/cheats` in chat, enter the password, and a persistent **taskbar pins to the top of the game view with one-click buttons for every cheat**. Closing it collapses it into a tiny tab — type `/cheats` again (or click the tab) to restore.

Cheats are grouped into three classes:

**Visual pranks** — broadcast-only, render as overlays on your opponent's screen:
- `/blockwifi` / `/unblockwifi` — full-screen fake Windows "No Internet connection" dialog that blocks their board until you call it off (auto-lifts after 45 s as a safety net)
- `/shake` — 3-second screen shake (CSS body animation)
- `/disco` (aka `/rave`) — 4-second rainbow strobe
- `/colorblind` — 6-second 180° hue-rotate that swaps red↔blue on their screen
- `/ghostcursor` — a ghost cursor that drifts across their viewport
- `/spam` — 36 falling emojis for 5 seconds
- `/airhorn` — loud buzz synthesised live with WebAudio (no asset)
- `/fakemove` — fake "OPPONENT MOVED" pulse that wasn't a real move
- `/fakeleave` — injects a fake "opponent disconnected" system message into their chat

**Perception-bending**:
- `/mirror` — flips their whole viewport horizontally for 5 s (they click the wrong cell)
- `/fog` — dark radial mask that tracks their cursor for 6 s
- `/peek` — their client streams cursor position back to yours for 10 s; you see a cyan dot labelled `👁 OPPONENT`
- `/ghost <r> <c>` — hides one cell from their view for 8 s by injecting a CSS rule targeting `[data-cw-cell="r,c"]` (the taskbar button picks a random enemy cell for you)

**Game-state cheats** — write directly to the `games` row, so realtime propagates the change to both clients:
- `/undo` — revert to the previous grid snapshot (Chat keeps a short ring buffer of grids seen via game prop changes)
- `/steal` — convert one random enemy circle to yours
- `/flip` — swap every cell's owner. Nuclear
- `/doublemove` — arms a ref in the GameClient so the next move keeps `current_turn` on you instead of passing it

Confirmation toasts are rendered locally on the prankster's side only. Supabase's `broadcast: { self: false }` means the sender never receives their own fx event, so the prankster never experiences their own prank.

### Animation & feel

- **Flying orbs** — when a cell explodes, small glowing orbs visibly fly outward to each orthogonal neighbour
- **Burst + receive** — exploding circles scale up and fade out; receivers pop in with a bounce
- **Capture flash** — enemy cells that get converted play a distinct white-flash so you can see what you lost
- **Wave-by-wave chains** — chain reactions resolve one wave at a time, each wave its own animation step (~1.1 s per wave)
- **Last-move impact rings** — every cell the mover now controls that *changed* gets a ring, not just the clicked coordinate. Tells you exactly what your opponent did, even through a 10-step chain
- **Turn-aware glow** — board, HUD, and ambient orbs all shift colour based on whose turn it is
- **Live territory bar** — percentage split between blue and red, smoothly interpolated

### Aesthetic

- **Fonts** — Bebas Neue (display), Orbitron (digits), Space Mono (body)
- **Scanline CRT overlay** — subtle, full-screen
- **Ambient drifting orbs** — cyan and red gradients floating behind the content
- **Dot-grid background** on the lobby

---

## How to play

1. **Create** — pick a mode (Classic / Open), click CREATE GAME, get a 2-letter code. Or pick from the Open Rooms list to join someone's waiting lobby
2. **Join** — type the 2 letters and hit GO (or share the link Copy-Link button gives you)
3. **Place** — each player picks a starting square. It spawns with 3 dots (one click away from exploding)
4. **Play** — on your turn, click one of your circles to add +1. In Open mode you can also seed any empty cell
5. **Explode** — a circle reaching 4 dots bursts and sends one orb up, down, left, and right (never diagonal)
6. **Convert** — orbs landing on enemy circles flip them and may trigger a chain reaction
7. **Win** — first player to reduce the opponent's circle count to zero wins the board
8. **Rematch** — hit REMATCH on the victory screen; once both players accept, both clients auto-join the new room

The `?` button top-right of the home page opens an in-app How-to-play modal with all of this spelled out.

---

## Project structure

```
src/
├── app/
│   ├── layout.tsx                   Next.js root layout (fonts, global CSS)
│   ├── globals.css                  CRT overlay, keyframes, utility animations
│   ├── page.tsx                     Home (create/join, open-rooms list, how-to modal)
│   └── game/[roomId]/
│       ├── page.tsx                 Thin server component → GameClient
│       └── GameClient.tsx           Main game screen, realtime subscription, animation orchestrator
├── components/
│   ├── Grid.tsx                     5×5 board layout, flying-orb layer, data-cw-cell wrappers
│   ├── Cell.tsx                     One cell: dot arrangement, hover, glow, explode/receive/capture states
│   └── Chat.tsx                     Messages, reactions, cheats, all victim-side fx overlays
├── lib/
│   ├── types.ts                     GameRow, Grid, Player, GameMode, GameStatus
│   ├── supabase.ts                  Supabase client (anon key)
│   ├── gameLogic.ts                 Pure functions: explosions, chain resolution, win check
│   └── useMatchStats.ts             Hook: lead time, lead changes, biggest swing, peak dominance
supabase/
└── cleanup.sql                      One-shot migration: updated_at trigger + pg_cron job
```

---

## Tech stack

- **Next.js 14** (App Router) + React 18 + TypeScript (strict)
- **Supabase** — Postgres, Realtime (`postgres_changes` for game state, `broadcast` for chat + fx + peek), `pg_cron` for cleanup
- **Tailwind CSS** — layout utilities only; most styling is inline / CSS variables
- **Custom CSS keyframes** — neon pulses, board glow, burst / receive / capture / flying-orb / shake / disco / emoji-fall / ghost-drift / fake-move-pulse
- **WebAudio** — synthesised airhorn buzz (no audio files shipped)
- **Google Fonts** — Bebas Neue, Orbitron, Space Mono

No state-management library. No test framework. No backend server — everything server-side lives in Postgres.

---

## Architecture

### Real-time data flow

Two separate Supabase channels run in parallel per room:

```
┌───────────────── games table (Postgres) ─────────────────┐
│                                                          │
│    replica_identity FULL + supabase_realtime publication │
│                                                          │
└──────────┬─────────────────────────────────┬─────────────┘
           │ postgres_changes (UPDATE)       │
           │                                 │
     ┌─────▼──────┐                    ┌─────▼──────┐
     │ GameClient │                    │ GameClient │
     │  (Blue)    │                    │  (Red)     │
     └─────┬──────┘                    └─────┬──────┘
           │                                 │
           │       broadcast channel         │
           │   `chat:{roomId}`  self:false   │
           └───────────────►◄────────────────┘
               msg • reaction • wifi • fx
               peek_cursor • presence
```

**Game channel** (`game:{roomId}:{ts}`) subscribes to Postgres `UPDATE` events filtered by row id. Every move is a single DB write that every client sees. The timestamp suffix forces a fresh channel on visibility change / reconnect.

**Chat channel** (`chat:{roomId}`) uses Supabase **broadcast** — ephemeral, no DB. Carries chat messages, emoji reactions, all cheat effects, peek cursor streaming, and presence.

### Move consistency without server logic

`src/lib/gameLogic.ts` is pure TypeScript the clients trust each other to run:

- `processMoveStepped(grid, row, col, player)` returns `{ initialGrid, steps[] }` where each step is `{ explodingCells, receivingCells, gridAfter }`. The final grid is deterministic — same inputs, same outputs on both clients.
- `computeImpactCells(oldGrid, newGrid, mover)` derives which cells changed so we can ring-highlight them without storing history.

The mover animates locally first, then writes the **final** grid to the DB in a single update. The opponent's client receives the update, recognises it hasn't animated it yet, re-runs `processMoveStepped` locally to generate the same animation, then settles on the same final state.

De-dup is done with a `moveKey` — `${status}:${move_count}:${last_move_row},${last_move_col}:${current_turn}`. If a client has already animated a given key, it skips the animation when the update echoes back.

### Optional-column resilience

`updateGameRow` in `GameClient.tsx` wraps every game write. If Postgres rejects because columns from a later migration (`last_move_row`, `rematch_requested_by`, `rematch_room_id`, `mode`) are missing, it retries without those fields and logs a warning. The app stays playable against an old schema.

### Cheat system

All cheats live in `Chat.tsx` for proximity to the broadcast channel they piggyback on.

- **Visual / perception cheats** — prankster sends a `broadcast` event `fx` with `{ kind, from, extra? }`. `broadcast: { self: false }` means the prankster never receives it, so their screen stays clean. Victim's client dispatches `kind` to a state update + timeout that auto-clears.
- **Game-state cheats** — `/undo`, `/steal`, `/flip` write directly to the `games` row; realtime propagates to both clients. `/doublemove` calls an `onDoubleMoveArm` callback that sets a ref in `GameClient`, which the next move's handler reads and uses to keep `current_turn` on the mover.
- **/peek** is two-sided: the prankster broadcasts `fx:peek_start`; the victim's client begins attaching a `mousemove` listener that broadcasts viewport-relative cursor position on a separate `peek_cursor` event; the prankster renders a dot. Both sides time out after 10 s.
- **/ghost `<r> <c>`** — Grid wraps every cell in `<div data-cw-cell={`${r},${c}`} style={{ display: 'contents' }}>`. The victim's client injects a `<style>` rule `[data-cw-cell="r,c"] > * { visibility: hidden !important; }` and removes it after 8 s.
- **Password gate** — after typing `/cheats`, the next chat submit is intercepted as a password comparison. On success `cheatsUnlocked` is set and a persistent top-of-viewport taskbar of one-click buttons appears. Slash commands typed before unlock are sent as normal chat messages (no leaked cheat surface).

### Match stats hook

`useMatchStats(game)` in `src/lib/useMatchStats.ts`:
- Uses refs (not state) for accumulators to avoid re-render loops
- A 1 Hz `setInterval` reads the latest game via ref and bumps `leadMs{Blue|Red|Tied}` and `leadChanges`
- A separate effect on `[game]` computes biggest swing and peak dominance diffing `move_count` and `counts` against the previous snapshot
- Resets automatically when `game.id` changes (rematch)
- Freezes `durationMs` at `finishedAt` so the duration stops ticking on game end
- Must be called before any early return in `GameClient` to satisfy the rules of hooks

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

-- Public access (no auth)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON games FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE games;
```

### 2. Optional columns (last-move marker, rematch, mode)

The client detects missing columns and keeps playing without them, but running this unlocks the extras:

```sql
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS last_move_row        INTEGER,
  ADD COLUMN IF NOT EXISTS last_move_col        INTEGER,
  ADD COLUMN IF NOT EXISTS rematch_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS rematch_room_id      TEXT,
  ADD COLUMN IF NOT EXISTS mode                 TEXT DEFAULT 'classic';
```

### 3. Auto-cleanup (recommended)

Run [`supabase/cleanup.sql`](./supabase/cleanup.sql) once in the SQL editor. It:

1. Adds an `updated_at` column with a trigger that bumps it on every UPDATE
2. Defines a `cleanup_games()` function that deletes:
   - Finished games older than 2 minutes (2-min grace for win screen + rematch)
   - Waiting lobbies older than 10 minutes (nobody joined)
   - Active games with no updates for 60 minutes (both players walked away)
3. Registers a `pg_cron` job running the function every minute

Idempotent — safe to re-run. Adjust the intervals inside `cleanup_games()` if you want a tighter / looser policy.

> Chat and cheat effects use Supabase **broadcast** channels — no table, no migration, no cleanup.

### 4. Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in Supabase → **Project Settings → API**.

### 5. Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000> in two browser windows (or two devices on the same network) to test multiplayer.

### 6. Deploy to Vercel

```bash
npx vercel
```

Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in your Vercel project settings.

---

## Game logic (rules summary)

- Uniform **critical mass = 4** (every cell explodes at 4 dots)
- Starting circles spawn at **critical mass − 1** so the first click always triggers an explosion
- Explosions propagate **orthogonally only** — up, down, left, right (no diagonals)
- Chain reactions resolve **wave by wave**, each wave animated as its own step
- **Win condition** — opponent's circle count drops to zero while yours is above zero
- **Mode enforcement** — clickability and click-guards respect the selected mode on both clients

---

## Cheat password

`45618`. Type `/cheats` in chat, enter it, go wild. Use responsibly — ideally only on your partner. The entire system is designed to look stealthy: slash commands are invisible to the opponent, the confirmation toast is local-only, and there's no in-game indicator that cheats are unlocked beyond your own taskbar.
