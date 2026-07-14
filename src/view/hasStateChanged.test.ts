import { describe, it, expect } from 'vitest';
import { serializeState, hasStateChanged } from './hasStateChanged';

describe('hasStateChanged', () => {
  it('is false when the serialized state is identical', () => {
    const workItem = { id: 1, title: 'A' };
    const subtasks = [{ id: 2, title: 'B' }];
    const previous = serializeState(workItem, subtasks);

    expect(hasStateChanged(previous, { id: 1, title: 'A' }, [{ id: 2, title: 'B' }])).toBe(false);
  });

  it('is true when a field changes', () => {
    const previous = serializeState({ id: 1, title: 'A' }, []);

    expect(hasStateChanged(previous, { id: 1, title: 'A (edited)' }, [])).toBe(true);
  });

  it('is true when the subtasks array changes', () => {
    const previous = serializeState({ id: 1 }, []);

    expect(hasStateChanged(previous, { id: 1 }, [{ id: 2 }])).toBe(true);
  });
});
