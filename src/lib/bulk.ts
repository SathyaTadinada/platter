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

// Writes changed field values to one record, skipping any it already has (which saves
// requests when most of a selection already matches). Returns the record's new fields,
// or undefined when nothing needed writing.
export async function applyFields(
  fields: Record<number, string>,
  changes: Record<number, string>,
  write: (fieldId: number, value: string) => Promise<unknown>,
): Promise<Record<number, string> | undefined> {
  const todo = Object.entries(changes).filter(([id, v]) => (fields[Number(id)] ?? '') !== v)
  for (const [id, v] of todo) await write(Number(id), v)
  return todo.length ? { ...fields, ...Object.fromEntries(todo) } : undefined
}
