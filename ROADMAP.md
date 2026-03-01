# ROADMAP — Multiplayer Flappy Bird

## Stack
- Frontend: Next.js T3 (no auth, no Prisma) + Phaser.js 3
- Backend: SpacetimeDB Maincloud (Rust module)
- Transport: @clockworklabs/spacetimedb-sdk

## Phase Status
| Phase | Title | Status |
|-------|-------|--------|
| 1 | Project Scaffold & SpacetimeDB Module Skeleton | ⬜ |
| 2 | Core Game Loop (Server-Authoritative, Single Bird) | ⬜ |
| 3 | Multiplayer Session & Lobby | ⬜ |
| 4 | Death, Spectate & Round Resolution | ⬜ |
| 5 | UI, Polish & Juice | ⬜ |
| 6 | Deployment & Hardening | ⬜ |

---

## Phase 1 — Project Scaffold & SpacetimeDB Module Skeleton ⬜

### Goals
Bootstrap the full project structure. No game logic. Verify the client connects to the SpacetimeDB module and can call a test reducer.

### Tasks
- [ ] Create T3 app (no auth, no Prisma): `npm create t3-app@latest`
- [ ] Install Phaser 3: `npm install phaser`
- [ ] Install SpacetimeDB SDK: `npm install @clockworklabs/spacetimedb-sdk`
- [ ] Create `server/` directory with `spacetime init` (Rust module)
- [ ] Define initial tables in `server/src/lib.rs`:
  - `Player` (identity, username, color_hex, session_id, is_alive, score)
  - `Bird` (player_identity, x, y, velocity_y, rotation)
  - `Pipe` (id, x, gap_y, passed_by: Vec<Identity>)
  - `Session` (id, state: enum Waiting|Running|RoundOver, round_number)
  - `Config` (singleton: gravity, flap_force, pipe_speed, pipe_interval_ms, gap_size)
- [ ] Define skeleton reducers (no logic, just stubs):
  - `join_game(username: String, color_hex: String)`
  - `flap()`
  - `request_start()`
  - `tick(timestamp: u64)` — scheduled reducer
- [ ] Publish module to Maincloud: `spacetime publish --server maincloud flappy`
- [ ] Generate TypeScript bindings into `src/module_bindings/`
- [ ] Create `src/game/SpacetimeClient.ts` — singleton wrapper (connect, expose tables, expose reducer calls)
- [ ] Create `src/app/page.tsx` that connects to SpacetimeDB on mount and logs connection success
- [ ] Create a `<GameCanvas />` component (dynamic, SSR-disabled) with a bare Phaser.Game (Boot scene only, grey background)
- [ ] Verify: browser console shows "Connected to SpacetimeDB" with no errors
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md

---

## Phase 2 — Core Game Loop (Server-Authoritative, Single Bird) ⬜

### Goals
One player can join, the game starts, pipes scroll, gravity pulls the bird down, flapping sends a reducer call, server updates bird state each tick, client renders it. Server detects collision and marks player dead.

### Tasks
- [ ] Implement `Config` singleton insert in `init()` with tuned default values
- [ ] Implement `join_game` reducer: insert Player + Bird row, assign to or create a Session in Waiting state
- [ ] Implement `request_start` reducer: transition Session to Running, record start timestamp
- [ ] Implement scheduled `tick` reducer (every 50ms / 20Hz):
  - Apply gravity to all living birds (velocity_y += gravity * dt)
  - Update bird Y position and rotation
  - Spawn new pipes on interval based on elapsed time
  - Move all pipes left by pipe_speed * dt
  - Check bird-pipe and bird-boundary collisions → mark player dead on hit
  - Update scores: increment player score when pipe x passes behind bird x and player not already counted for that pipe
  - Detect round over (all players dead)
- [ ] Implement `flap` reducer: set bird velocity_y to flap_force for calling player
- [ ] Client: `SpacetimeClient` subscribes to `Bird`, `Pipe`, `Player`, `Session` tables
- [ ] Phaser `GameScene`: render one bird sprite (triangle or simple rect) at Bird row position
- [ ] Phaser `GameScene`: render pipe pairs as rectangles from Pipe table rows
- [ ] Flap on spacebar/tap → calls `flap` reducer
- [ ] HUD: current score displayed
- [ ] On player death (Bird marked dead): show "You died" overlay
- [ ] `npm run build` passes
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md

---

## Phase 3 — Multiplayer Session & Lobby ⬜

### Goals
Multiple players join the same session, see a lobby/waiting screen, all birds render simultaneously when the round starts.

### Tasks
- [ ] Session model: first player creates session (Waiting), subsequent players join same Waiting session
- [ ] Lobby screen (React overlay or Phaser scene): shows connected players, usernames, colors, ready count
- [ ] `request_start` available to any player once ≥2 players in session (or allow solo for testing)
- [ ] Auto-start when all players in session click ready (add `is_ready` to Player table)
- [ ] `set_ready` reducer: toggle player ready state
- [ ] Server: start round when all players ready (or host force-start after 30s)
- [ ] Client: render all birds from Bird table (not just local player's)
- [ ] Local bird visually distinct (e.g. brighter, name label above)
- [ ] Each remote bird renders with their assigned `color_hex`
- [ ] Player list HUD panel: username + score per player, ordered by score
- [ ] `npm run build` passes
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md

---

## Phase 4 — Death, Spectate & Round Resolution ⬜

### Goals
Dead players spectate. Last bird alive wins. Round-over screen shown to all. Auto-restart with countdown.

### Tasks
- [ ] On local player death: switch to SpectateScene (or spectate mode within GameScene)
- [ ] Spectate camera follows the bird with the highest current score (last living bird)
- [ ] Camera smoothly pans to follow target bird X/Y
- [ ] Spectate HUD: "Spectating [username]" label, remaining alive count
- [ ] Server round-over detection: when all birds dead, set Session state = RoundOver, record winner identity
- [ ] `RoundResult` table row inserted by server: winner_identity, winner_score, round_number, ended_at
- [ ] All clients: on Session state = RoundOver, show RoundOverOverlay
  - Winner name + score
  - Scoreboard of all players this round
  - "Next round in 5…" countdown
- [ ] Server: after 5s, reset Session to Waiting, clear Pipe rows, reset Bird positions/velocities, clear scores
- [ ] `reset_round` scheduled reducer or triggered from `tick` when enough time elapsed since RoundOver
- [ ] Players who disconnected mid-round are cleaned up (remove Player/Bird rows)
- [ ] `npm run build` passes
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md

---

## Phase 5 — UI, Polish & Juice ⬜

### Goals
The game looks and feels complete. Menus, sounds, effects, readable UI.

### Tasks
- [ ] MainMenuScene: game title, username input (pre-filled from localStorage), color picker (6 preset colors), Play button
- [ ] Username + color persisted to localStorage on join
- [ ] Bird sprites: use colored triangle or simple pixel-art bird shape per player color
- [ ] Pipe sprites: styled green rectangles with a cap (classic Flappy look)
- [ ] Background: scrolling parallax sky + ground layers
- [ ] Particle burst on bird death
- [ ] Screen flash + brief freeze frame on own death
- [ ] Sound effects (Phaser.Sound): flap whoosh, score ping, death thud, round-over fanfare
- [ ] All sounds loaded from `/public/sounds/` (provide placeholder files or use Web Audio API synthesis)
- [ ] Score counter animates on increment
- [ ] "You are the last bird!" text briefly when second-to-last bird dies
- [ ] Mobile touch support: tap anywhere to flap
- [ ] `npm run build` passes
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md

---

## Phase 6 — Deployment & Hardening ⬜

### Goals
Deployed on Vercel, stable under multiple concurrent sessions, clean error handling.

### Tasks
- [ ] `.env.local` documented in README; `.env.example` committed
- [ ] `NEXT_PUBLIC_SPACETIMEDB_HOST` and `NEXT_PUBLIC_MODULE_NAME` used everywhere (no hardcoded strings)
- [ ] Vercel project configured with env vars
- [ ] `vercel deploy` succeeds, game playable at production URL
- [ ] Reconnection logic in `SpacetimeClient`: on disconnect, attempt reconnect with exponential backoff (max 5 attempts)
- [ ] Idle player cleanup: server marks player disconnected after 30s no input, removes from session
- [ ] `on_disconnect` lifecycle hook in Rust module removes Player/Bird rows
- [ ] Handle edge case: only 1 player in session — allow solo play, round ends immediately when that bird dies
- [ ] Error overlay in UI: "Connection lost — reconnecting…" banner
- [ ] Test with 4 browser tabs simultaneously, confirm all birds visible and synced
- [ ] README.md: setup instructions, env vars, how to publish module, how to run locally
- [ ] `npm run build` passes
- [ ] Opus audit → STATUS: APPROVED
- [ ] Mark phase ✅ in ROADMAP.md
```

---

# Phase 1 Claude Code Prompt

Paste this verbatim into Claude Code:
```
You are implementing Phase 1 of a multiplayer Flappy Bird clone. Read CLAUDE.md fully before writing any code.

## Your Goal
Scaffold the complete project structure, define the SpacetimeDB Rust module skeleton, publish it to Maincloud, generate TypeScript bindings, and verify the browser connects successfully. No game logic yet.

## Step-by-Step Instructions

### 1. T3 App Setup
The project may already be initialized. If `package.json` exists, skip T3 init. Otherwise run:
```
npm create t3-app@latest . --CI --noGit --appRouter --noSrc --noTailwind --noTrpc --noPrisma --noAuth
```
Then install additional dependencies:
```
npm install phaser @clockworklabs/spacetimedb-sdk
```

### 2. Initialize SpacetimeDB Rust Module
The `server/` directory already exists and `spacetime init` has already been run.
Skip this step entirely — do not re-run init.

### 3. Write the Rust Module — `server/src/lib.rs`
Replace the contents entirely with the following (implement exactly as specified):

**Tables:**
- `Player`: fields `identity` (Identity, primary key), `username` (String), `color_hex` (String), `session_id` (u32), `is_alive` (bool), `score` (u32), `is_ready` (bool)
- `Bird`: fields `player_identity` (Identity, primary key), `x` (f32), `y` (f32), `velocity_y` (f32), `rotation` (f32)
- `Pipe`: fields `id` (u32, primary key, auto-inc), `x` (f32), `gap_y` (f32), `speed` (f32)
- `Session`: fields `id` (u32, primary key), `state` (String — "Waiting", "Running", "RoundOver"), `round_number` (u32), `started_at` (u64)
- `GameConfig`: fields `id` (u32, primary key), `gravity` (f32), `flap_force` (f32), `pipe_speed` (f32), `pipe_interval_ms` (u64), `gap_size` (f32), `bird_start_x` (f32)

**Reducers (stubs only — log a message and return Ok(())):**
- `init()` — insert a GameConfig row with sensible defaults: gravity=1800.0, flap_force=-500.0, pipe_speed=150.0, pipe_interval_ms=1800, gap_size=160.0, bird_start_x=80.0. Insert a Session row id=1, state="Waiting", round_number=0, started_at=0.
- `join_game(ctx, username: String, color_hex: String)` — stub, just log
- `set_ready(ctx)` — stub
- `flap(ctx)` — stub
- `request_start(ctx)` — stub
- `tick(ctx, timestamp: u64)` — stub (will be a scheduled reducer later)

Make the module compile cleanly with `cargo build` before proceeding.

### 4. Publish to Maincloud
```
cd server
spacetime publish --server maincloud flappy
cd ..
```
If this fails, show the error and stop — do not proceed past a publish failure.

### 5. Generate TypeScript Bindings
```
spacetime generate --lang typescript --out-dir src/module_bindings --project-path server/
```
Confirm the `src/module_bindings/` directory is populated.

### 6. Create `src/game/SpacetimeClient.ts`
A singleton module (not a class, just exported functions and a module-level connection variable):
```typescript
// src/game/SpacetimeClient.ts
// Singleton SpacetimeDB connection wrapper
```

It should:
- Import `DbConnection`, `Identity`, and the generated table/reducer types from `../module_bindings`
- Export a `connect(host: string, moduleName: string, onConnect: () => void, onDisconnect: () => void)` function
- Store the connection in a module-level `let conn` variable
- Export `getConn()` to retrieve it
- Export typed reducer call helpers: `callJoinGame(username, colorHex)`, `callFlap()`, `callSetReady()`, `callRequestStart()`
- Use `conn.reducers.joinGame(...)` etc. (match exact generated binding names)

### 7. Create `src/components/GameCanvas.tsx`
- Dynamic import wrapper (export default from this file is a `next/dynamic` import with `ssr: false`)
- The actual component inside creates a `Phaser.Game` instance inside `useEffect`
- Phaser config: `type: Phaser.AUTO`, `width: 480`, `height: 640`, parent: a div ref, `backgroundColor: '#70c5ce'`
- Single scene: `BootScene` — just displays text "Connecting…" then "Connected!" once SpacetimeDB connects
- On mount: call `SpacetimeClient.connect(...)` with env vars, update scene text on connect callback
- On unmount: destroy the Phaser game instance

### 8. Update `src/app/page.tsx`
- Import `GameCanvas` dynamically
- Render it centered on the page
- No other UI needed for Phase 1

### 9. Environment Variables
Create `.env.local`:
```
NEXT_PUBLIC_SPACETIMEDB_HOST=maincloud.spacetimedb.com
NEXT_PUBLIC_MODULE_NAME=flappy
```
Create `.env.example` with the same keys but empty values.

### 10. Verify & Build
Run `npm run build`. Fix any TypeScript errors. Do not leave type errors suppressed with `any` unless strictly unavoidable (and comment why).

### 11. Opus Audit
Use the Task tool to invoke an Opus subagent with the audit prompt from CLAUDE.md, filling in:
- Phase: 1
- Deliverables: the Phase 1 task list from ROADMAP.md
- File list: all files created/modified
- Build status: result of `npm run build`
- Rust compile status: result of `cd server && cargo build`

Only after STATUS: APPROVED:
- Mark Phase 1 as ✅ in ROADMAP.md

## Definition of Done
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] `cd server && cargo build` exits 0
- [ ] Module published to Maincloud (no publish error)
- [ ] `src/module_bindings/` populated with generated files
- [ ] Browser loads the page, Phaser canvas renders, console shows successful SpacetimeDB connection
- [ ] Opus audit returns STATUS: APPROVED