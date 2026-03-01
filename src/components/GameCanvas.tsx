"use client";

import dynamic from "next/dynamic";

// Dynamically import the inner component with SSR disabled.
// Phaser requires browser APIs and must never run on the server.
const GameCanvasInner = dynamic(() => import("./GameCanvasInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[640px] w-[480px] items-center justify-center bg-[#70c5ce] text-white">
      Loading…
    </div>
  ),
});

export default function GameCanvas() {
  return <GameCanvasInner />;
}
