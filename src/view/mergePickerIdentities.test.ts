import { describe, it, expect } from 'vitest';
import { mergePickerIdentities } from './mergePickerIdentities';
import type { IdentitySearchResult } from '../azureDevOps/client';

function identity(overrides: Partial<IdentitySearchResult> = {}): IdentitySearchResult {
  return { id: 'id', displayName: 'Name', uniqueName: 'name@example.com', imageUrl: null, ...overrides };
}

const me = identity({ id: 'me', displayName: 'Me Myself', uniqueName: 'me@example.com' });
const jane = identity({ id: 'u1', displayName: 'Jane Doe', uniqueName: 'jane@example.com' });
const john = identity({ id: 'u2', displayName: 'John Roe', uniqueName: 'john@example.com' });

describe('mergePickerIdentities', () => {
  it('offers the current user first, then the team, when nothing is typed', () => {
    const merged = mergePickerIdentities(me, [jane, john], [], '');

    expect(merged.map(i => i.uniqueName)).toEqual(['me@example.com', 'jane@example.com', 'john@example.com']);
  });

  it('does not repeat the current user when they are also in the team', () => {
    const merged = mergePickerIdentities(me, [jane, me], [], '');

    expect(merged.map(i => i.uniqueName)).toEqual(['me@example.com', 'jane@example.com']);
  });

  it('omits the current user when there is none, rather than failing', () => {
    const merged = mergePickerIdentities(null, [jane], [], '');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com']);
  });

  it('filters the team by display name, ignoring case', () => {
    const merged = mergePickerIdentities(null, [jane, john], [], 'JANE');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com']);
  });

  it('filters the team by unique name too, so typing an address works', () => {
    const merged = mergePickerIdentities(null, [jane, john], [], 'john@ex');

    expect(merged.map(i => i.uniqueName)).toEqual(['john@example.com']);
  });

  it('filters the current user out when they do not match the query', () => {
    const merged = mergePickerIdentities(me, [jane], [], 'jane');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com']);
  });

  it('appends search results after the team ones', () => {
    const outsider = identity({ id: 'u3', displayName: 'Outside Person', uniqueName: 'out@example.com' });
    const merged = mergePickerIdentities(null, [jane], [outsider], 'o');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com', 'out@example.com']);
  });

  it('does not repeat someone who is both in the team and in the search results', () => {
    const merged = mergePickerIdentities(null, [jane], [jane, john], 'e');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com', 'john@example.com']);
  });

  it('matches duplicates on unique name regardless of case', () => {
    const shouty = identity({ id: 'other', displayName: 'Jane Doe', uniqueName: 'JANE@EXAMPLE.COM' });
    const merged = mergePickerIdentities(null, [jane], [shouty], '');

    expect(merged).toHaveLength(1);
  });

  it('keeps the team entry when the same person also comes back from search', () => {
    const fromSearch = identity({ id: 'u1', displayName: 'Jane Doe', uniqueName: 'jane@example.com', imageUrl: 'https://avatar.example/jane.png' });
    const teamJane = identity({ id: 'u1', displayName: 'Jane Doe', uniqueName: 'jane@example.com', imageUrl: 'https://team.example/jane.png' });
    const merged = mergePickerIdentities(null, [teamJane], [fromSearch], '');

    expect(merged[0].imageUrl).toBe('https://team.example/jane.png');
  });

  it('drops anyone without a unique name, from any source', () => {
    const broken = identity({ id: 'x', displayName: 'No Address', uniqueName: '' });
    const merged = mergePickerIdentities(null, [broken], [broken], '');

    expect(merged).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    const merged = mergePickerIdentities(null, [jane, john], [], '  jane  ');

    expect(merged.map(i => i.uniqueName)).toEqual(['jane@example.com']);
  });

  it('never filters the search results, which the server already matched', () => {
    const unrelated = identity({ id: 'u9', displayName: 'Zed', uniqueName: 'zed@example.com' });
    const merged = mergePickerIdentities(null, [], [unrelated], 'jane');

    expect(merged.map(i => i.uniqueName)).toEqual(['zed@example.com']);
  });
});
