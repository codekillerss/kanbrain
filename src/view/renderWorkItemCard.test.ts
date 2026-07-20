import { describe, it, expect } from 'vitest';
import { renderWorkItemCard } from './renderWorkItemCard';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' } } },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('renderWorkItemCard', () => {
  it('shows the skill action button by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).toContain('data-action="run-skill"');
  });

  it('hides the skill action button when showActionButton is false', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', false);
    expect(html).not.toContain('data-action="run-skill"');
  });
});
