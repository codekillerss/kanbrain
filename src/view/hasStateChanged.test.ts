import { describe, it, expect } from 'vitest';
import { serializeState, hasStateChanged } from './hasStateChanged';

describe('hasStateChanged', () => {
  it('is false when the serialized state is identical', () => {
    const config = { a: 1 };
    const workItem = { id: 1, title: 'A' };
    const subtasks = [{ id: 2, title: 'B' }];
    const previous = serializeState(config, workItem, subtasks);

    expect(hasStateChanged(previous, { a: 1 }, { id: 1, title: 'A' }, [{ id: 2, title: 'B' }])).toBe(false);
  });

  it('is true when a field changes', () => {
    const previous = serializeState(null, { id: 1, title: 'A' }, []);

    expect(hasStateChanged(previous, null, { id: 1, title: 'A (edited)' }, [])).toBe(true);
  });

  it('is true when the subtasks array changes', () => {
    const previous = serializeState(null, { id: 1 }, []);

    expect(hasStateChanged(previous, null, { id: 1 }, [{ id: 2 }])).toBe(true);
  });

  it('is true when config changes from null to a value, even if workItem and subtasks stay the same', () => {
    const previous = serializeState(null, null, []);

    expect(hasStateChanged(previous, { organization: 'org' }, null, [])).toBe(true);
  });

  it('is true when only the avatars map changes', () => {
    const previous = serializeState(null, { id: 1 }, [], {});

    expect(hasStateChanged(previous, null, { id: 1 }, [], { 'https://example.com/a.png': 'data:image/png;base64,X' })).toBe(true);
  });

  it('is false when avatars is omitted on both sides (defaults to the same empty object)', () => {
    const previous = serializeState(null, { id: 1 }, []);

    expect(hasStateChanged(previous, null, { id: 1 }, [])).toBe(false);
  });
});
