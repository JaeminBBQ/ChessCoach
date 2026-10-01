import { it } from 'vitest'

import { generateShard } from './generate'

it('repertoire shard 1', () => generateShard(1, 4), 4 * 3_600_000)
