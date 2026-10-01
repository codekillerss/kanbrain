import { describe, it, expect, vi } from 'vitest';
import { collectSearchPage } from './collectSearchPage';
import type { WorkItem } from '../types';

function workItem(id: number, type = 'Task'): WorkItem {
  return { id, title: `#${id}`, description: '', status: 'New', type, url: '', parentId: null, childIds: [], assignedTo: null, development: [] };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function fetcher(types: Record<number, string> = {}, missing: number[] = []) {
  return vi.fn(async (ids: number[]) => ids.filter(id => !missing.includes(id)).map(id => workItem(id, types[id])));
}

describe('collectSearchPage', () => {
  it('fetches only the next page of ids and advances the cursor past them', async () => {
    const fetchBatch = fetcher();

    const page = await collectSearchPage(range(1, 120), 0, fetchBatch, new Set());

    expect(page.items.map(i => i.id)).toEqual(range(1, 50));
    expect(page.cursor).toBe(50);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith(range(1, 50));
  });

  it('continues from the cursor without repeating or skipping ids', async () => {
    const ids = range(1, 120);
    const seen = new Set<number>();
    const loaded: number[] = [];
    let cursor = 0;
    while (cursor < ids.length) {
      const page = await collectSearchPage(ids, cursor, fetcher(), seen);
      loaded.push(...page.items.map(i => i.id));
      cursor = page.cursor;
    }

    expect(loaded).toEqual(ids);
  });

  it('keeps the order of the id list even if the fetch returns items in another order', async () => {
    const fetchBatch = vi.fn(async (ids: number[]) => [...ids].reverse().map(id => workItem(id)));

    const page = await collectSearchPage([3, 1, 2], 0, fetchBatch, new Set());

    expect(page.items.map(i => i.id)).toEqual([3, 1, 2]);
  });

  it('never returns an id that was already loaded, nor the same id twice', async () => {
    const page = await collectSearchPage([1, 2, 2, 3], 0, fetcher(), new Set([1]));

    expect(page.items.map(i => i.id)).toEqual([2, 3]);
  });

  it('records the returned ids in the seen set', async () => {
    const seen = new Set<number>();

    await collectSearchPage([1, 2], 0, fetcher(), seen);

    expect([...seen]).toEqual([1, 2]);
  });

  it('tops the page up with the next ids when some no longer exist', async () => {
    const page = await collectSearchPage(range(1, 60), 0, fetcher({}, [2, 3]), new Set(), { pageSize: 5 });

    expect(page.items.map(i => i.id)).toEqual([1, 4, 5, 6, 7]);
    expect(page.cursor).toBe(7);
  });

  it('applies the matcher and scans further batches until the page is full', async () => {
    const types: Record<number, string> = { 3: 'Epic', 250: 'Epic', 260: 'Epic' };
    const fetchBatch = fetcher(types);

    const page = await collectSearchPage(range(1, 400), 0, fetchBatch, new Set(), {
      pageSize: 3,
      matches: item => item.type === 'Epic',
    });

    expect(page.items.map(i => i.id)).toEqual([3, 250, 260]);
    // Stops right after the item that filled the page, so the rest of that batch is scanned again
    // next time instead of being dropped.
    expect(page.cursor).toBe(260);
    expect(fetchBatch).toHaveBeenCalledWith(range(1, 200));
  });

  it('stops scanning after maxScan ids even if the page is not full, so the caller can offer more', async () => {
    const fetchBatch = fetcher();

    const page = await collectSearchPage(range(1, 5000), 0, fetchBatch, new Set(), {
      matches: () => false,
      maxScan: 400,
    });

    expect(page.items).toEqual([]);
    expect(page.cursor).toBe(400);
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });

  it('returns an empty page without fetching when the cursor is at the end', async () => {
    const fetchBatch = fetcher();

    const page = await collectSearchPage([1, 2], 2, fetchBatch, new Set());

    expect(page).toEqual({ items: [], cursor: 2 });
    expect(fetchBatch).not.toHaveBeenCalled();
  });
});
