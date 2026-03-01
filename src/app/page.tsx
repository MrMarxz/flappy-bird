import GameCanvas from "@/components/GameCanvas";

export default function HomePage() {
  return (
    <main className="flex items-center justify-center w-screen h-screen overflow-hidden bg-black">
      <GameCanvas />
    </main>
  );
}
