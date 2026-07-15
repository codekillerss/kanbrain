import { describe, it, expect } from 'vitest';
import { renderHome } from './renderHome';
import type { RenderState } from './render';
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
    ...overrides,
  };
}

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: {},
    backlogLevels: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'home',
    ...overrides,
  };
}

describe('renderHome', () => {
  it('shows buttons for Setup, Check Board Configuration, Sync Board Configuration, and Configuration', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-setup-home-btn"');
    expect(html).toContain('id="kb-run-check-board-config-btn"');
    expect(html).toContain('id="kb-run-sync-board-config-btn"');
    expect(html).toContain('id="kb-show-config-btn"');
  });

  it('shows a "Select Work Item" button (not the search box directly) when there is no active work item', () => {
    const html = renderHome(state({ workItem: null }));

    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Select Work Item');
    expect(html).toContain('kb-search-overlay');
    expect(html).not.toContain('id="kb-clear-btn"');
    expect(html).not.toContain('id="kb-view-details-btn"');
  });

  it('shows the active work item card with switch/clear/view-details buttons when one is active', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).toContain('kb-main-card');
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Switch work item');
    expect(html).toContain('id="kb-clear-btn"');
    expect(html).toContain('id="kb-view-details-btn"');
  });

  it('does not render a config editor section', () => {
    const html = renderHome(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    expect(html).not.toContain('data-level="Tasks"');
  });
});
