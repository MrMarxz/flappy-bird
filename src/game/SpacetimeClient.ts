// Singleton SpacetimeDB client — one connection per browser tab.
// Keep this as module-level state, not React state.

import { DbConnection } from "@/module_bindings";

let conn: DbConnection | null = null;

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
    .onConnect((_connection, _identity, _token) => {
      console.log("[SpacetimeClient] Connected to SpacetimeDB");
      onConnect();
    })
    .onDisconnect((_ctx, error) => {
      console.log("[SpacetimeClient] Disconnected", error ?? "");
      conn = null;
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
