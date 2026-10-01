// Content generation (engine-heavy, reads the local DB). Not part of `npm test`.
const config = {
  test: { environment: 'node', include: ['scripts/**/*.run.ts'], testTimeout: 4 * 3_600_000, maxWorkers: 4 },
}

export default config
