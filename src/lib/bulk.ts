export type BulkResult<T> = { done: T[]; failed: { item: T; error: string }[] }

// Runs fn over items one at a time (the client already rate-limits), carrying
// on past failures so one bad item doesn't stop the rest.
export async function runBulk<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<BulkResult<T>> {
  const result: BulkResult<T> = { done: [], failed: [] }
  for (const [i, item] of items.entries()) {
    if (shouldStop?.()) break
    try {
      await fn(item)
      result.done.push(item)
    } catch (e) {
      result.failed.push({ item, error: (e as Error).message })
    }
    onProgress?.(i + 1, items.length)
  }
  return result
}
