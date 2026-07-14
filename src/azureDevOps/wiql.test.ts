import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from './wiql';

describe('buildSearchQuery', () => {
  it('returns a title-ordered query with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });

  it('returns the same unfiltered query as an empty search when the search text is numeric (id filtering happens client-side)', () => {
    expect(buildSearchQuery('482')).toBe(buildSearchQuery(''));
  });

  it('filters by title CONTAINS when the search text is not numeric', () => {
    const query = buildSearchQuery('login bug');
    expect(query).toContain("[System.Title] CONTAINS 'login bug'");
  });

  it('escapes single quotes in the search text', () => {
    const query = buildSearchQuery("user's login");
    expect(query).toContain("CONTAINS 'user''s login'");
  });
});
