'use client'

/**
 * A GET form that submits itself when any select changes, so filters live in
 * the URL and the page stays a Server Component.
 */
export default function GamesFilters({ children }: { children: React.ReactNode }) {
  return (
    <form method="get" onChange={(event) => event.currentTarget.requestSubmit()}>
      {children}
    </form>
  )
}
