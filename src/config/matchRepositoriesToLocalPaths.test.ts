import { describe, it, expect } from 'vitest';
import { matchRepositoriesToLocalPaths } from './matchRepositoriesToLocalPaths';

describe('matchRepositoriesToLocalPaths', () => {
  it('sets the path when a local repo matches by name', () => {
    const result = matchRepositoriesToLocalPaths(
      [{ id: 'repo-1', name: 'kanbrain' }],
      new Map([['kanbrain', 'C:\\repos\\kanbrain']]),
    );
    expect(result).toEqual({ 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } });
  });

  it('leaves the path empty when no local repo matches', () => {
    const result = matchRepositoriesToLocalPaths([{ id: 'repo-1', name: 'kanbrain' }], new Map());
    expect(result).toEqual({ 'repo-1': { name: 'kanbrain', path: '' } });
  });

  it('matches case-insensitively', () => {
    const result = matchRepositoriesToLocalPaths(
      [{ id: 'repo-1', name: 'KanBrain' }],
      new Map([['kanbrain', 'C:\\repos\\kanbrain']]),
    );
    expect(result['repo-1'].path).toBe('C:\\repos\\kanbrain');
  });
});
