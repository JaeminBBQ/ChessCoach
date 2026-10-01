// Imports the generated repertoire trees into the DB (`repertoires`,
// `repertoire_nodes`), then clears the per-game match cache. Run with
// `npm run repertoire:import` (env REPERTOIRE_SET, default 'owner';
// REPERTOIRE_USER_ID, default 1). Idempotent.
import path from 'node:path'
import { it } from 'vitest'

import { getDb } from '../../src/lib/db/client'
import { importRepertoireSet } from '../../src/lib/server/repertoire'

const SET = process.env.REPERTOIRE_SET ?? 'owner'
const USER_ID = Number(process.env.REPERTOIRE_USER_ID ?? 1)

it('repertoire import', () => {
  importRepertoireSet(getDb(), USER_ID, path.resolve('content/repertoire', SET))
  console.log(`Imported repertoire set '${SET}' for user ${USER_ID}`)
})
