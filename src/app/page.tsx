export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">ChessCoach</h1>
      <p className="max-w-md text-center text-lg text-zinc-600 dark:text-zinc-400">
        A chess coach that learns from your games.
      </p>
      <a
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
        href="/board"
      >
        Open the board →
      </a>
    </main>
  );
}
