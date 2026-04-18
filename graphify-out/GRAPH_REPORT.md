# Graph Report - .  (2026-04-17)

## Corpus Check
- Corpus is ~3,874 words - fits in a single context window. You may not need a graph.

## Summary
- 45 nodes · 55 edges · 8 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Color Wars` - 5 edges
2. `Real-Time Two-Player Online Grid Conquest Game` - 5 edges
3. `Supabase` - 4 edges
4. `games Table (Supabase)` - 4 edges
5. `createGame()` - 3 edges
6. `Supabase Realtime` - 3 edges
7. `Environment Variables (NEXT_PUBLIC_SUPABASE_*)` - 3 edges
8. `generateRoomCode()` - 2 edges
9. `getOrCreatePlayerId()` - 2 edges
10. `joinGame()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Color Wars` --conceptually_related_to--> `Real-Time Two-Player Online Grid Conquest Game`  [EXTRACTED]
  README.md → README.md  _Bridges community 0 → community 4_

## Hyperedges (group relationships)
- **Core Game Mechanics** — readme_explosion_mechanic, readme_chain_reaction, readme_win_condition, readme_room_code [INFERRED 0.85]
- **Supabase Infrastructure** — readme_supabase, readme_games_table, readme_realtime, readme_rls, readme_env_vars [EXTRACTED 1.00]

## Communities

### Community 0 - "Project Config & Infra"
Cohesion: 0.29
Nodes (10): Color Wars, Environment Variables (NEXT_PUBLIC_SUPABASE_*), games Table (Supabase), Next.js, Rationale: No Auth Needed for Game, Rationale: REPLICA IDENTITY FULL for Realtime, Supabase Realtime, Row Level Security Policy (+2 more)

### Community 1 - "Page Routing & Room Setup"
Cohesion: 0.31
Nodes (5): createGame(), generateRoomCode(), getOrCreatePlayerId(), handleL2KeyDown(), joinGame()

### Community 2 - "Game Client & UI"
Cohesion: 0.28
Nodes (0): 

### Community 3 - "Game Logic Engine"
Cohesion: 0.32
Nodes (4): checkWinner(), countCircles(), getAdjacentCells(), processMove()

### Community 4 - "Core Game Mechanics"
Cohesion: 0.5
Nodes (5): Chain Reaction Mechanic, Circle Explosion Mechanic (split at 4), Real-Time Two-Player Online Grid Conquest Game, 6-Letter Room Code, Win Condition (own every circle)

### Community 5 - "App Layout"
Cohesion: 1.0
Nodes (0): 

### Community 6 - "TypeScript Env"
Cohesion: 1.0
Nodes (0): 

### Community 7 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **4 isolated node(s):** `6-Letter Room Code`, `Win Condition (own every circle)`, `Rationale: No Auth Needed for Game`, `Rationale: REPLICA IDENTITY FULL for Realtime`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `App Layout`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TypeScript Env`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Color Wars` connect `Project Config & Infra` to `Core Game Mechanics`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `Real-Time Two-Player Online Grid Conquest Game` connect `Core Game Mechanics` to `Project Config & Infra`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `6-Letter Room Code`, `Win Condition (own every circle)`, `Rationale: No Auth Needed for Game` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._