/**
 * Map `items` through an async `fn` with a bounded number of in-flight tasks.
 *
 * Why: some flows (e.g. Eduvia sync) issue one or more network round-trips per
 * item. Running them strictly sequentially makes wall-time O(N) and risks the
 * function timeout for large tenants; running them all at once hammers the
 * upstream API. A small fixed pool gives most of the speedup while staying
 * polite.
 *
 * - Preserves input order in the returned array (result[i] === fn(items[i])).
 * - A rejecting task rejects the whole call. Callers that need best-effort
 *   per-item behaviour must catch inside `fn` (the Eduvia sync does exactly
 *   this: it records per-item errors and never throws out of `fn`).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
