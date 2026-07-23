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
    development: [],
    ...overrides,
  };
}

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
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
    const commandsSectionEnd = html.indexOf('kb-section-card', commandsIndex + 1);
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
    expect(html).not.toContain('id="kb-open-flow-btn"');
  });

  it('shows icon switch/clear buttons and an Open Flow button on the active work item card', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).toContain('kb-main-card');
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('id="kb-clear-btn"');
    expect(html).toContain('kb-icon-btn');
    expect(html).toContain('id="kb-open-flow-btn"');
    expect(html).toContain('Open Flow');
  });

  it('does not show the skill action button on the active work item card, even when a skill is configured', () => {
    const html = renderHome(
      state({
        workItem: workItem(),
        config: config({
          skills: { Task: { Active: { path: 'skills/fix.md' } } },
        }),
      }),
    );

    expect(html).toContain('kb-main-card');
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('does not render a config editor section', () => {
    const html = renderHome(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));

    expect(html).not.toContain('data-level="Task"');
  });

  it('passes avatars through to the active work item card', () => {
    const html = renderHome(
      state({
        workItem: workItem({ assignedTo: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' } }),
        avatars: { 'https://example.com/jane.png': 'data:image/png;base64,JANE' },
        config: config({ cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: true } } } } }),
      }),
    );

    expect(html).toContain('data:image/png;base64,JANE');
  });

  it('does not make the title clickable on the home screen card', () => {
    const html = renderHome(state({ workItem: workItem() }));
    expect(html).not.toContain('kb-title-clickable');
  });

  it('does not show a Team section when there are 0 teams in cardSettingsByTeam', () => {
    const html = renderHome(state());

    expect(html).not.toContain('id="kb-team-select"');
  });

  it('shows a Team section styled as a card when there is at least one team in cardSettingsByTeam', () => {
    const html = renderHome(
      state({ config: config({ cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } } } }) }),
    );

    expect(html).toContain('kb-team-card');
    expect(html).toContain('id="kb-team-select"');
    expect(html).toContain('<option value="Team 1"');
  });

  it('shows every team as an option when there is more than one team in cardSettingsByTeam', () => {
    const html = renderHome(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );

    expect(html).toContain('<option value="Team 1"');
    expect(html).toContain('<option value="Team 2"');
  });

  it('marks the selected team as selected in the dropdown', () => {
    const html = renderHome(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
        selectedTeam: 'Team 2',
      }),
    );

    expect(html).toMatch(/<option value="Team 2" selected>/);
  });

  it('marks defaultTeam as selected when no explicit selection was made', () => {
    const html = renderHome(
      state({
        config: config({
          defaultTeam: 'Team 1',
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );

    expect(html).toMatch(/<option value="Team 1" selected>/);
  });

  it('places the Team section after Flow and before Commands', () => {
    const html = renderHome(
      state({ config: config({ cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } } } }) }),
    );

    const flowIndex = html.indexOf('>Flow<');
    const teamIndex = html.indexOf('>Team<');
    const commandsIndex = html.indexOf('>Commands<');

    expect(flowIndex).toBeGreaterThanOrEqual(0);
    expect(teamIndex).toBeGreaterThan(flowIndex);
    expect(commandsIndex).toBeGreaterThan(teamIndex);
  });
});
