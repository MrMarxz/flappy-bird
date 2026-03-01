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

    // Dynamically import Phaser to avoid SSR issues
    void import("phaser").then((Phaser) => {
      // Guard against Strict Mode second invocation completing after cleanup
      if (gameRef.current) return;

      class BootScene extends Phaser.Scene {
        private statusText!: Phaser.GameObjects.Text;

        constructor() {
          super({ key: "BootScene" });
        }

        create() {
          this.statusText = this.add
            .text(240, 320, "Connecting…", {
              fontSize: "24px",
              color: "#ffffff",
              fontFamily: "Arial",
            })
            .setOrigin(0.5);
        }

        setConnected() {
          this.statusText.setText("Connected!");
        }
      }

      const bootScene = new BootScene();

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 480,
        height: 640,
        parent: containerRef.current ?? undefined,
        backgroundColor: "#70c5ce",
        scene: bootScene,
      };

      gameRef.current = new Phaser.Game(config);

      const host = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "";
      const moduleName = process.env.NEXT_PUBLIC_MODULE_NAME ?? "";

      SpacetimeClient.connect(
        host,
        moduleName,
        () => {
          // onConnect — update the BootScene text
          bootScene.setConnected();
        },
        () => {
          // onDisconnect
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
