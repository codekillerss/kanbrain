import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from './wiql';

describe('buildSearchQuery', () => {
  it('returns a title-ordered query capped at 50 results with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT TOP 50 [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by exact ID when the search text is numeric', () => {
    const query = buildSearchQuery('482');
    expect(query).toContain('[System.Id] = 482');
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
