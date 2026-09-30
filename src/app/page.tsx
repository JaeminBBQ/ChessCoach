import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">ChessCoach</h1>
      <p className="max-w-md text-center text-lg text-zinc-600 dark:text-zinc-400">
        A chess coach that learns from your games.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
          href="/games"
        >
          Games →
        </Link>
        <Link
          className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          href="/accounts"
        >
          Accounts
        </Link>
        <Link
          className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          href="/board"
        >
          Board
        </Link>
      </div>
    </main>
  );
}
