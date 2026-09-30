import { connection } from 'next/server'

import BatchAnalyzer from '@/components/analysis/batch-analyzer'
import EngineCredit from '@/components/analysis/engine-credit'
import { getDb } from '@/lib/db/client'
import { analysisCounts } from '@/lib/server/analyses'
import { getCurrentUserId } from '@/lib/server/session'

export default async function AnalyzePage() {
  await connection()
  const db = getDb()
  const { analyzed, total } = analysisCounts(db, getCurrentUserId(db))
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Analyze games</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {analyzed.toLocaleString()} of {total.toLocaleString()} games analyzed. Newest games go first.
        </p>
      </div>
      <BatchAnalyzer />
      <EngineCredit />
    </main>
  )
}
