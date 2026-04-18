# Color Wars

Real-time two-player online grid conquest game. Grow your circles, split at 4, chain-react, conquer everything.

## Setup

### 1. Supabase — create the games table

Go to your Supabase project → SQL Editor and run:

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

-- Allow public read/write (no auth needed for this game)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON games FOR ALL USING (true) WITH CHECK (true);

-- Required for realtime
ALTER TABLE games REPLICA IDENTITY FULL;
```

Then go to **Database → Replication** and enable realtime for the `games` table.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in Supabase → Project Settings → API.

### 3. Local development

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

```bash
npx vercel
```

Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in your Vercel project settings.

## How to play

1. Player 1 clicks **Create Game** → gets a 6-letter room code
2. Player 2 enters the code and clicks **Join**
3. Blue picks their starting square, then Red picks theirs
4. Take turns clicking your own circles to add +1 value
5. A circle at 4 points **explodes** — it splits into all 4 adjacent squares
6. Conquered enemy circles gain +1 and may chain-react
7. First player to own every circle wins
