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
    assignedTo: null,
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
  it('shows buttons for Setup, Check Board Configuration, and Sync Board Configuration', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-setup-home-btn"');
    expect(html).toContain('id="kb-run-check-board-config-btn"');
    expect(html).toContain('id="kb-run-sync-board-config-btn"');
  });

  it('shows a Configure with AI button in Commands', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-configure-ai-btn"');
  });

  it('shows the Configuration button in its own section, not inside Commands', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-show-config-btn"');
    const commandsIndex = html.indexOf('Commands');
    const commandsSectionEnd = html.indexOf('kb-home-section', commandsIndex + 1);
    const configButtonIndex = html.indexOf('id="kb-show-config-btn"');
    expect(configButtonIndex).toBeGreaterThan(commandsSectionEnd);
  });

  it('orders sections as Flow, then Commands, then Configuration', () => {
    const html = renderHome(state());

    const flowIndex = html.indexOf('Flow');
    const commandsIndex = html.indexOf('Commands');
    const configurationLabelIndex = html.indexOf('>Configuration<');

    expect(flowIndex).toBeGreaterThanOrEqual(0);
    expect(commandsIndex).toBeGreaterThan(flowIndex);
    expect(configurationLabelIndex).toBeGreaterThan(commandsIndex);
  });

  it('does not make its own work item header sticky (only the Flow/Config screens get that)', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).not.toContain('kb-page-header');
  });

  it('shows a "Select Work Item" button (not the search box directly) when there is no active work item', () => {
    const html = renderHome(state({ workItem: null }));

    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Select Work Item');
    expect(html).toContain('kb-search-overlay');
    expect(html).not.toContain('id="kb-clear-btn"');
    expect(html).not.toContain('id="kb-view-details-btn"');
  });

  it('shows icon switch/clear buttons and a view-details button on the active work item card', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).toContain('kb-main-card');
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('id="kb-clear-btn"');
    expect(html).toContain('kb-icon-btn');
    expect(html).toContain('id="kb-view-details-btn"');
  });

  it('does not show the skill action button on the active work item card, even when a skill is configured', () => {
    const html = renderHome(
      state({
        workItem: workItem(),
        config: config({
          typeToBacklogLevel: { Task: 'Tasks' },
          backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' } } },
        }),
      }),
    );

    expect(html).toContain('kb-main-card');
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('does not render a config editor section', () => {
    const html = renderHome(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    expect(html).not.toContain('data-level="Tasks"');
  });

  it('passes avatars through to the active work item card', () => {
    const html = renderHome(
      state({
        workItem: workItem({ assignedTo: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' } }),
        avatars: { 'https://example.com/jane.png': 'data:image/png;base64,JANE' },
        config: config({ cardSettingsByBoard: { Tasks: { Task: { parent: false, assignedTo: true } } } }),
      }),
    );

    expect(html).toContain('data:image/png;base64,JANE');
  });

  it('does not make the title clickable on the home screen card', () => {
    const html = renderHome(state({ workItem: workItem() }));
    expect(html).not.toContain('kb-title-clickable');
  });
});
