import * as Phaser from "phaser";
import type { RoundResult, Session } from "@/module_bindings/types";
import * as SpacetimeClient from "../SpacetimeClient";

const CANVAS_W = 480;
const CANVAS_H = 640;
const BIRD_W = 34;
const BIRD_H = 24;
const PIPE_W = 52;
const LERP = 0.3;

const PRESET_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface RenderPos {
  x: number;
  y: number;
  rot: number;
}

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;

  // Bird username labels — keyed by identity hex string
  private birdLabels = new Map<string, Phaser.GameObjects.Text>();

  // Interpolated render positions — keyed by identity hex string
  private birdRenderPos = new Map<string, RenderPos>();

  // Overlays
  private lobbyOverlay!: Phaser.GameObjects.Container;
  private deathOverlay!: Phaser.GameObjects.Container;
  private deathScoreText!: Phaser.GameObjects.Text;
  private roundOverOverlay!: Phaser.GameObjects.Container;
  private roundOverWinnerText!: Phaser.GameObjects.Text;

  // Local session state (mirrored from SpacetimeDB for overlay logic)
  private sessionState = "Waiting";
  private localAlive = false;
  private localScore = 0;
  private latestRoundResult: RoundResult | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Main graphics layer (cleared + redrawn every frame)
    this.gfx = this.add.graphics();

    // Score HUD (top centre)
    this.scoreText = this.add
      .text(CANVAS_W / 2, 20, "0", {
        fontSize: "36px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    this.createLobbyOverlay();
    this.createDeathOverlay();
    this.createRoundOverOverlay();

    // Input
    this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());
    this.input.on("pointerdown", () => this.handleInput());

    // SpacetimeDB callbacks
    SpacetimeClient.onSessionUpdate((session: Session) => {
      this.sessionState = session.state;
      this.updateOverlays();
    });

    SpacetimeClient.onPlayerUpdate(() => {
      this.refreshLocalPlayer();
      this.updateOverlays();
    });

    SpacetimeClient.onRoundResult((result: RoundResult) => {
      this.latestRoundResult = result;
      this.updateRoundOverText();
    });

    // Join the game immediately with a default identity
    const colorHex =
      PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] ??
      "#FF6B6B";
    SpacetimeClient.callJoinGame("Player", colorHex);

    // Show initial overlay
    this.updateOverlays();
  }

  update() {
    this.gfx.clear();

    if (this.sessionState === "Waiting") return;

    this.drawGround();
    this.drawPipes();
    this.drawBirds();

    // Update score display
    this.scoreText.setText(String(this.localScore));
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private drawGround() {
    this.gfx.fillStyle(0x8b4513);
    this.gfx.fillRect(0, CANVAS_H - 30, CANVAS_W, 30);
  }

  private drawPipes() {
    const config = SpacetimeClient.getGameConfig();
    const gapSize = config?.gapSize ?? 160;

    this.gfx.fillStyle(0x2ecc71);
    for (const pipe of SpacetimeClient.getPipes()) {
      const left = pipe.x - PIPE_W / 2;
      const topPipeBottom = pipe.gapY - gapSize / 2;
      const botPipeTop = pipe.gapY + gapSize / 2;

      // Top pipe
      if (topPipeBottom > 0) {
        this.gfx.fillRect(left, 0, PIPE_W, topPipeBottom);
      }
      // Bottom pipe
      if (botPipeTop < CANVAS_H) {
        this.gfx.fillRect(left, botPipeTop, PIPE_W, CANVAS_H - botPipeTop);
      }
    }
  }

  private drawBirds() {
    const birds = SpacetimeClient.getBirds();
    const players = SpacetimeClient.getPlayers();
    const localId = SpacetimeClient.getLocalIdentity();

    const activeBirdIds = new Set<string>();

    for (const bird of birds) {
      const idStr = bird.playerIdentity.toHexString();
      activeBirdIds.add(idStr);

      const player = players.find((p) =>
        p.identity.isEqual(bird.playerIdentity),
      );
      if (!player) continue;

      // Interpolate position
      const target: RenderPos = {
        x: bird.x,
        y: bird.y,
        rot: bird.rotation,
      };
      const current = this.birdRenderPos.get(idStr) ?? target;
      const renderPos: RenderPos = {
        x: Phaser.Math.Linear(current.x, target.x, LERP),
        y: Phaser.Math.Linear(current.y, target.y, LERP),
        rot: Phaser.Math.Linear(current.rot, target.rot, LERP),
      };
      this.birdRenderPos.set(idStr, renderPos);

      const alpha = player.isAlive ? 1 : 0.35;
      const colorInt = parseInt(player.colorHex.replace("#", ""), 16);
      this.gfx.fillStyle(colorInt, alpha);
      this.gfx.fillRect(
        renderPos.x - BIRD_W / 2,
        renderPos.y - BIRD_H / 2,
        BIRD_W,
        BIRD_H,
      );

      // White outline for local player
      const isLocal = localId?.isEqual(bird.playerIdentity);
      if (isLocal) {
        this.gfx.lineStyle(2, 0xffffff, alpha);
        this.gfx.strokeRect(
          renderPos.x - BIRD_W / 2,
          renderPos.y - BIRD_H / 2,
          BIRD_W,
          BIRD_H,
        );
      }

      // Username label
      if (!this.birdLabels.has(idStr)) {
        const label = this.add
          .text(renderPos.x, renderPos.y - BIRD_H / 2 - 4, player.username, {
            fontSize: "12px",
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
            stroke: "#000000",
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.birdLabels.set(idStr, label);
      } else {
        const label = this.birdLabels.get(idStr)!;
        label.setPosition(renderPos.x, renderPos.y - BIRD_H / 2 - 4);
        label.setAlpha(alpha);
      }
    }

    // Destroy labels for birds no longer present
    for (const [id, label] of this.birdLabels) {
      if (!activeBirdIds.has(id)) {
        label.destroy();
        this.birdLabels.delete(id);
        this.birdRenderPos.delete(id);
      }
    }
  }

  // ─── Overlays ───────────────────────────────────────────────────────────────

  private createLobbyOverlay() {
    const bg = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, 420, 220, 0x000000, 0.75);
    const title = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 50, "Waiting for players…", {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 + 10, "Press SPACE or click to Ready up", {
        fontSize: "16px",
        color: "#ffff88",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.lobbyOverlay = this.add
      .container(0, 0, [bg, title, hint])
      .setDepth(20);
  }

  private createDeathOverlay() {
    const bg = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, 380, 180, 0x000000, 0.75);
    this.deathScoreText = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 30, "You died — Score: 0", {
        fontSize: "22px",
        color: "#ff6666",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 + 20, "Waiting for round to end…", {
        fontSize: "15px",
        color: "#cccccc",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.deathOverlay = this.add
      .container(0, 0, [bg, this.deathScoreText, hint])
      .setDepth(20)
      .setVisible(false);
  }

  private createRoundOverOverlay() {
    const bg = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, 420, 260, 0x000000, 0.8);
    const title = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 80, "Round Over!", {
        fontSize: "30px",
        color: "#ffff00",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    this.roundOverWinnerText = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 20, "Winner: — Score: 0", {
        fontSize: "18px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 + 50, "Press SPACE or click to Ready up", {
        fontSize: "15px",
        color: "#aaaaaa",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.roundOverOverlay = this.add
      .container(0, 0, [bg, title, this.roundOverWinnerText, hint])
      .setDepth(20)
      .setVisible(false);
  }

  private updateOverlays() {
    const state = this.sessionState;
    this.lobbyOverlay.setVisible(state === "Waiting");
    this.deathOverlay.setVisible(state === "Running" && !this.localAlive);
    this.roundOverOverlay.setVisible(state === "RoundOver");

    if (state === "Running" && !this.localAlive) {
      this.deathScoreText.setText(`You died — Score: ${this.localScore}`);
    }
  }

  private updateRoundOverText() {
    if (!this.latestRoundResult) return;
    const r = this.latestRoundResult;
    const players = SpacetimeClient.getPlayers();
    const winner = players.find((p) =>
      p.identity.isEqual(r.winnerIdentity),
    );
    const name = winner?.username ?? "Unknown";
    this.roundOverWinnerText.setText(
      `Winner: ${name} — Score: ${r.winnerScore}`,
    );
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private handleInput() {
    switch (this.sessionState) {
      case "Waiting":
        SpacetimeClient.callSetReady();
        break;
      case "Running":
        if (this.localAlive) {
          SpacetimeClient.callFlap();
        }
        break;
      case "RoundOver":
        SpacetimeClient.callRequestStart();
        break;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private refreshLocalPlayer() {
    const localId = SpacetimeClient.getLocalIdentity();
    if (!localId) return;
    const player = SpacetimeClient.getPlayers().find((p) =>
      p.identity.isEqual(localId),
    );
    if (player) {
      this.localAlive = player.isAlive;
      this.localScore = player.score;
    }
  }
}
