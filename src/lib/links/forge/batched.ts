/** Fetches `items` `size` at a time, one page per query. */
export async function* batched<T, P>(items: T[], size: number, fetch: (batch: T[]) => Promise<P>) {
  for (let start = 0; start < items.length; start += size) {
    const page = await fetch(items.slice(start, start + size));
    yield { ...page, hasNextPage: start + size < items.length };
  }
}
