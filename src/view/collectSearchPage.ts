import type { WorkItem } from '../types';

export interface SearchPage {
  items: WorkItem[];
  // Index into the id list where the next page starts.
  cursor: number;
}

interface CollectOptions {
  pageSize?: number;
  // Filter that the WIQL couldn't apply (saved queries), run on the fetched items.
  matches?: (item: WorkItem) => boolean;
  // Upper bound on ids examined per call when a matcher discards most of them, so a single "load
  // more" can't turn into dozens of requests. The caller offers another page if ids remain.
  maxScan?: number;
}

// getWorkItems accepts at most 200 ids per request.
const MAX_BATCH = 200;

// Pages through a fixed, already-ordered id list (the search's snapshot). Pages are consecutive
// slices of that list, so none overlaps another or skips an id; `seen` (mutated) is an extra guard
// against an id the list itself repeats.
export async function collectSearchPage(
  ids: number[],
  cursor: number,
  fetchBatch: (ids: number[]) => Promise<WorkItem[]>,
  seen: Set<number>,
  options: CollectOptions = {},
): Promise<SearchPage> {
  const pageSize = options.pageSize ?? 50;
  const maxScan = options.maxScan ?? 1000;
  const batchSize = options.matches ? MAX_BATCH : Math.min(pageSize, MAX_BATCH);
  const items: WorkItem[] = [];
  let position = cursor;
  let scanned = 0;

  while (position < ids.length && items.length < pageSize && scanned < maxScan) {
    const batchIds = ids.slice(position, position + batchSize);
    const byId = new Map((await fetchBatch(batchIds)).map(item => [item.id, item]));
    for (const id of batchIds) {
      position++;
      scanned++;
      const item = byId.get(id);
      if (!item || seen.has(id) || (options.matches && !options.matches(item))) {
        continue;
      }
      seen.add(id);
      items.push(item);
      if (items.length >= pageSize) {
        break;
      }
    }
  }

  return { items, cursor: position };
}
