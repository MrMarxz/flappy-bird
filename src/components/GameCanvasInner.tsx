"use client";

import { useEffect, useRef } from "react";
import type { Game as PhaserGame } from "phaser";
import * as SpacetimeClient from "@/game/SpacetimeClient";

export default function GameCanvasInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserGame | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (gameRef.current) return;

    // Dynamically import Phaser + GameScene to avoid SSR issues
    void Promise.all([
      import("phaser"),
      import("@/game/scenes/GameScene"),
    ]).then(([Phaser, { GameScene }]) => {
      // Guard against Strict Mode double-invocation completing after cleanup
      if (gameRef.current) return;

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 480,
        height: 640,
        parent: containerRef.current ?? undefined,
        backgroundColor: "#70c5ce",
        scene: new GameScene(),
      };

      gameRef.current = new Phaser.Game(config);

      const host = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "";
      const moduleName = process.env.NEXT_PUBLIC_MODULE_NAME ?? "";

      SpacetimeClient.connect(
        host,
        moduleName,
        () => {
          console.log("[GameCanvas] SpacetimeDB connected");
        },
        () => {
          console.log("[GameCanvas] SpacetimeDB disconnected");
        },
      );
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: 480, height: 640 }}
    />
  );
}
