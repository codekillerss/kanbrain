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

  it('shows "Unassigned" when the work item has no assignee', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: null }), config, 'kb-main-card');
    expect(html).toContain('kb-assignee-row');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name when the work item is assigned', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image when one is provided for the assignee', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderWorkItemCard(item, config, 'kb-main-card', true, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row entirely when config.showAssignedTo is false', () => {
    const html = renderWorkItemCard(workItem(), { ...config, showAssignedTo: false }, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });

  it('shows the assignee row before the status row', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');

    const assigneeIndex = html.indexOf('kb-assignee-row');
    const statusIndex = html.indexOf('kb-status-row');

    expect(assigneeIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThan(assigneeIndex);
  });

  it('does not make the title clickable by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('data-action="open-work-item-detail"');
    expect(html).not.toContain('kb-title-clickable');
  });

  it('makes the title clickable when clickableTitle is true', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, true);
    expect(html).toContain('class="kb-title kb-title-clickable"');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="482"');
  });
});
