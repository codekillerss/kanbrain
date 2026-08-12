import { describe, it, expect } from 'vitest';
import { renderSavedQueryOptions } from './renderSavedQueryOptions';
import type { SavedQuery } from '../types';

describe('renderSavedQueryOptions', () => {
  it('renders an empty state when there are no queries', () => {
    expect(renderSavedQueryOptions([])).toContain('No saved queries found.');
  });

  it('renders a flat query as a selectable, non-disabled option', () => {
    const queries: SavedQuery[] = [{ id: 'q1', path: 'Shared Queries/Bugs Abertos', queryType: 'flat' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-action="select-query" data-id="q1" data-path="Shared Queries/Bugs Abertos"');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Shared Queries/Bugs Abertos');
  });

  it('renders a tree query as disabled with a type badge', () => {
    const queries: SavedQuery[] = [{ id: 'q2', path: 'Shared Queries/Bugs and Parents', queryType: 'tree' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-id="q2" data-path="Shared Queries/Bugs and Parents" disabled');
    expect(html).toContain('kb-query-type-badge');
    expect(html).toContain('tree');
  });

  it('renders a oneHop query as disabled', () => {
    const queries: SavedQuery[] = [{ id: 'q3', path: 'Shared Queries/Linked Items', queryType: 'oneHop' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-id="q3" data-path="Shared Queries/Linked Items" disabled');
    expect(html).toContain('oneHop');
  });

  it('escapes HTML in the query path', () => {
    const queries: SavedQuery[] = [{ id: 'q4', path: '<script>alert(1)</script>', queryType: 'flat' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
