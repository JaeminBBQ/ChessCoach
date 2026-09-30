import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChessCoach",
  description: "A chess coach that learns from your games.",
};

const navLinkClass =
  "rounded-md px-2 py-1 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/5 hover:text-foreground dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-foreground";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="mx-auto flex w-full max-w-5xl items-baseline gap-3 px-4 py-3">
            <Link href="/" className="text-base font-semibold tracking-tight">
              ChessCoach
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
              ·
            </span>
            <Link href="/coach" className={navLinkClass}>
              Coach
            </Link>
            <Link href="/train" className={navLinkClass}>
              Train
            </Link>
            <Link href="/games" className={navLinkClass}>
              Games
            </Link>
            <Link href="/insights" className={navLinkClass}>
              Insights
            </Link>
            <Link href="/accounts" className={navLinkClass}>
              Accounts
            </Link>
            <Link href="/board" className={navLinkClass}>
              Board
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
