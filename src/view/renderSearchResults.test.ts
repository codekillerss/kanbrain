import { describe, it, expect } from 'vitest';
import { renderSearchResults } from './renderSearchResults';
import type { WorkItem } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'T',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    ...overrides,
  };
}

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([])).toContain('Nenhum work item encontrado.');
  });

  it('groups results into status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items);

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Corrigir <bug>' })]);

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Corrigir &lt;bug&gt;');
    expect(html).not.toContain('Corrigir <bug>');
  });
});
