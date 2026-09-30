import { it } from 'vitest'

import { generateShard } from './generate'

it('repertoire shard 3', () => generateShard(3, 4), 3_600_000)
