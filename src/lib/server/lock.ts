/**
 * A tiny keyed mutex: tasks under the same key run strictly one after the
 * other (queued, not rejected); different keys run concurrently. Used to
 * enforce one Lichess and one Chess.com sync at a time per server process.
 * DECISIONS D11: this lock becomes a persistent job queue later.
 */
export class KeyedLock {
  private tails = new Map<string, Promise<unknown>>()

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    // Chain the task after the previous one and record a settled promise so
    // the next caller waits regardless of whether this one rejects.
    const result = previous.then(task)
    this.tails.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    )
    return result
  }
}
