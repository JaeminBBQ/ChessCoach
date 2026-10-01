import { it } from 'vitest'

import { generateShard } from './generate'

it('repertoire shard 0', () => generateShard(0, 4), 4 * 3_600_000)
