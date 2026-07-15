import { describe, it, expect } from 'vitest';
import { buildSearchQuery, buildTypeCountQuery } from './wiql';

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

describe('buildTypeCountQuery', () => {
  it('filters by a single work item type', () => {
    const query = buildTypeCountQuery(['Epic']);
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain("[System.WorkItemType] IN ('Epic')");
    expect(query).not.toContain('CONTAINS');
    expect(query).not.toContain('ORDER BY');
  });

  it('filters by multiple work item types', () => {
    const query = buildTypeCountQuery(['User Story', 'Bug']);
    expect(query).toContain("[System.WorkItemType] IN ('User Story', 'Bug')");
  });

  it('escapes single quotes in type names', () => {
    const query = buildTypeCountQuery(["Tester's Task"]);
    expect(query).toContain("IN ('Tester''s Task')");
  });
});
