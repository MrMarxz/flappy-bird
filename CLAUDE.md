# CLAUDE.md — Multiplayer Flappy Bird

## Project Identity
Multiplayer Flappy Bird clone built with:
- **Frontend:** Next.js (T3 starter, no auth, no Prisma), Phaser.js 3
- **Backend:** SpacetimeDB Maincloud — Rust module (authoritative game server)
- **SDK:** @clockworklabs/spacetimedb-sdk (WebSocket, auto-generated bindings)

## Repository Layout
```
/
├── server/                  # Rust SpacetimeDB module
│   ├── src/lib.rs
│   └── Cargo.toml
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── game/                # All Phaser.js code
│   │   ├── scenes/          # Phaser Scenes (Boot, Menu, Game, Spectate, UI)
│   │   ├── entities/        # Bird, Pipe renderers
│   │   └── SpacetimeClient.ts  # Singleton SDK wrapper
│   ├── module_bindings/     # AUTO-GENERATED — never edit manually
│   └── components/          # React components (lobby, overlays)
├── CLAUDE.md
├── ROADMAP.md
└── .env.local               # NEXT_PUBLIC_SPACETIMEDB_HOST, NEXT_PUBLIC_MODULE_NAME
```

## Environment Variables
```
NEXT_PUBLIC_SPACETIMEDB_HOST=maincloud.spacetimedb.com
NEXT_PUBLIC_MODULE_NAME=flappy
```

## SpacetimeDB Workflow
- Module source lives in `server/`
- Publish: `spacetime publish --server maincloud flappy` (run from `server/`)
- Generate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path server/` (run from repo root)
- **Never edit `src/module_bindings/` by hand**
- Bindings must be regenerated after every change to `server/src/lib.rs`

## Key Architectural Rules
1. **Server is authoritative.** Collision detection, pipe positions, scoring, and round state all live in the Rust module. The client only sends flap inputs and renders received state.
2. **No client-side physics simulation.** Bird Y position and velocity come from server state. Do not reimplement physics in Phaser — only interpolate for visual smoothness.
3. **Phaser inside Next.js.** Phaser must be instantiated inside a `useEffect` with `typeof window !== 'undefined'` guard. Use dynamic import (`next/dynamic`, `ssr: false`) for any component that creates a Phaser.Game instance.
4. **SpacetimeClient is a singleton.** One SDK connection per browser tab. Keep it in a module-level variable, not React state.
5. **Module bindings are the contract.** All table names, column names, and reducer names in TypeScript must exactly match what was generated from the Rust module.

## SpacetimeDB Table & Reducer Naming Conventions (Rust → TypeScript)
- Rust `snake_case` table names become TypeScript PascalCase class names in bindings
- Rust reducer `fn my_reducer` becomes `MyReducerReducer.call(conn, ...)` in the SDK
- Always check generated bindings before calling reducers

## Development Commands
```bash
# Install deps
npm install

# Run Next.js dev server
npm run dev

# Publish Rust module to Maincloud
cd server && spacetime publish --server maincloud flappy

# Regenerate TypeScript bindings
spacetime generate --lang typescript --out-dir src/module_bindings --project-path server/

# Build check (TypeScript)
npm run build
```

## Git Bash on Windows — Known Gotchas
- Use forward slashes in all paths
- `spacetime` CLI works in Git Bash; if a command hangs, try a new terminal
- Phaser must not be imported at the module top level in any Next.js server-rendered file

## Opus Audit Protocol

Before considering any phase done, Claude Code MUST follow this sequence:

### Step 1 — Pre-audit checks
Run both of these and record the results:
```bash
npm run build
cd server && cargo build
```

### Step 2 — Invoke Opus subagent via Task tool (PRIMARY trigger)
Use the Task tool to spin up an Opus subagent. Pass it the audit prompt below,
filled in with the actual phase number, deliverables, changed files, and build results.

Do NOT wait for the Stop hook. Actively invoke this yourself before stopping.

### Step 3 — Act on the result
- If Opus returns `STATUS: APPROVED` → mark the phase ✅ in ROADMAP.md, then stop.
- If Opus returns `STATUS: ISSUES` → fix every listed issue, re-run builds, invoke
  the Opus subagent again. Repeat until APPROVED. Do not mark the phase complete
  until APPROVED is received.

### Audit Prompt Template
```
You are a senior engineer auditing Phase [N] of a multiplayer Flappy Bird clone.

Stack: Next.js T3 (no auth, no Prisma), Phaser.js 3, SpacetimeDB Maincloud (Rust module).

Architectural rules to verify:
- Server is authoritative: no client-side physics, no client-side collision
- SpacetimeClient is a singleton (module-level variable, not React state)
- Phaser.Game only instantiated inside useEffect with SSR guard
- src/module_bindings/ was not manually edited
- All reducers called using generated binding classes (conn.reducers.*)
- No hardcoded module addresses or hostnames (must use env vars)

Phase [N] deliverables:
[PASTE PHASE CHECKLIST FROM ROADMAP.md]

Files created or modified this phase:
[LIST FILES]

Build status (npm run build): [PASS / FAIL — paste errors if FAIL]
Rust compile status (cargo build): [PASS / FAIL — paste errors if FAIL]

Return exactly one of:
STATUS: APPROVED
or
STATUS: ISSUES
[bullet list of specific issues to fix]
```

### Stop Hook (safety net)
`.claude/settings.json` contains a Stop hook with `type: agent` and `model: claude-opus-4-6`.
This fires automatically if Claude Code stops without having gone through the above sequence.
It is a backstop — the Task tool invocation above is the primary and preferred path.

## Phaser ↔ React Communication
- React → Phaser: call methods on the singleton SpacetimeClient or emit Phaser events via `game.events.emit()`
- Phaser → React: use a lightweight event emitter or Zustand slice (no prop drilling)
- Never put Phaser Scene instances in React state

## Performance Notes
- SpacetimeDB subscription queries should be as narrow as possible — subscribe to active session rows only
- Bird position updates will arrive at server tick rate; use Phaser's `preUpdate` to interpolate between last two received positions
- Target 60fps client render; server tick rate ~20Hz is sufficient