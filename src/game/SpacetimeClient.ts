// Singleton SpacetimeDB client — one connection per browser tab.
// Keep this as module-level state, not React state.

import type { Identity } from "spacetimedb";
import { DbConnection } from "@/module_bindings";
import type { Player, Bird, Pipe, Session, GameConfig, RoundResult } from "@/module_bindings/types";

let conn: DbConnection | null = null;
let localIdentity: Identity | null = null;

// ─── Callbacks ────────────────────────────────────────────────────────────────

let sessionCb: ((s: Session) => void) | null = null;
let playerCb: ((players: Player[]) => void) | null = null;
let roundResultCb: ((r: RoundResult) => void) | null = null;

export function onSessionUpdate(cb: (s: Session) => void): void {
  sessionCb = cb;
}
export function onPlayerUpdate(cb: (players: Player[]) => void): void {
  playerCb = cb;
}
export function onRoundResult(cb: (r: RoundResult) => void): void {
  roundResultCb = cb;
}

// ─── Getters (read from local cache) ─────────────────────────────────────────

export function getLocalIdentity(): Identity | null {
  return localIdentity;
}
export function getPlayers(): Player[] {
  return conn ? [...conn.db.player.iter()] : [];
}
export function getBirds(): Bird[] {
  return conn ? [...conn.db.bird.iter()] : [];
}
export function getPipes(): Pipe[] {
  return conn ? [...conn.db.pipe.iter()] : [];
}
export function getSession(): Session | undefined {
  return conn ? [...conn.db.session.iter()][0] : undefined;
}
export function getGameConfig(): GameConfig | undefined {
  return conn ? [...conn.db.game_config.iter()][0] : undefined;
}

// ─── Connection ───────────────────────────────────────────────────────────────

export function connect(
  host: string,
  moduleName: string,
  onConnect: () => void,
  onDisconnect: () => void,
): void {
  if (conn) return; // already connected

  const uri = host.startsWith("http") ? host : `https://${host}`;

  conn = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(moduleName)
    .onConnect((connection, identity, _token) => {
      console.log("[SpacetimeClient] Connected to SpacetimeDB");
      localIdentity = identity;

      // Subscribe to all game tables
      connection
        .subscriptionBuilder()
        .onApplied(() => {
          console.log("[SpacetimeClient] Subscription applied");
          const session = [...connection.db.session.iter()][0];
          const playerCount = [...connection.db.player.iter()].length;
          // Safety net: if the server is stuck in RoundOver with no players
          // (e.g. stale state from a previous dev session), reset it.
          if (session?.state === "RoundOver" && playerCount === 0) {
            console.log("[SpacetimeClient] Stale RoundOver detected — calling requestStart");
            void connection.reducers.requestStart({});
          }
          if (session) sessionCb?.(session);
          playerCb?.([...connection.db.player.iter()]);
        })
        .subscribe([
          "SELECT * FROM player",
          "SELECT * FROM bird",
          "SELECT * FROM pipe",
          "SELECT * FROM session",
          "SELECT * FROM game_config",
          "SELECT * FROM round_result",
        ]);

      // Table change event handlers
      connection.db.session.onUpdate((_ctx, _old, newRow) => {
        sessionCb?.(newRow);
      });
      connection.db.session.onInsert((_ctx, row) => {
        sessionCb?.(row);
      });

      connection.db.player.onInsert((_ctx, _row) => {
        if (!conn) return;
        playerCb?.([...conn.db.player.iter()]);
      });
      connection.db.player.onUpdate((_ctx, _old, _newRow) => {
        if (!conn) return;
        playerCb?.([...conn.db.player.iter()]);
      });
      connection.db.player.onDelete((_ctx, _row) => {
        if (!conn) return;
        playerCb?.([...conn.db.player.iter()]);
      });

      connection.db.round_result.onInsert((_ctx, row) => {
        roundResultCb?.(row);
      });

      onConnect();
    })
    .onDisconnect((_ctx, error) => {
      console.log("[SpacetimeClient] Disconnected", error ?? "");
      conn = null;
      localIdentity = null;
      onDisconnect();
    })
    .onConnectError((_ctx, error) => {
      console.error("[SpacetimeClient] Connection error", error);
    })
    .build();
}

export function getConn(): DbConnection | null {
  return conn;
}

// ─── Reducer helpers ──────────────────────────────────────────────────────────

export function callJoinGame(username: string, colorHex: string): void {
  void conn?.reducers.joinGame({ username, colorHex });
}

export function callFlap(): void {
  void conn?.reducers.flap({});
}

export function callSetReady(): void {
  void conn?.reducers.setReady({});
}

export function callRequestStart(): void {
  void conn?.reducers.requestStart({});
}
