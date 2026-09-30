import { it } from 'vitest'

import { generateShard } from './generate'

it('repertoire shard 2', () => generateShard(2, 4), 3_600_000)
