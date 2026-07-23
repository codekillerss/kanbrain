import { describe, it, expect } from 'vitest';
import { renderConfig } from './renderConfig';
import type { RenderState } from './render';
import type { KanbrainConfig } from '../types';

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
    screen: 'config',
    ...overrides,
  };
}

describe('renderConfig', () => {
  it('shows a Home button', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-home-btn"');
  });

  it('renders the config editor', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Task"');
  });

  it('makes the header sticky', () => {
    const html = renderConfig(state());
    expect(html).toContain('kb-header kb-page-header');
  });

  it('shows a "Show assignee in search results" checkbox, checked by default', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-show-assignee-toggle"');
    expect(html).toContain('Show assignee in search results');
    expect(html).toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('unchecks the checkbox when showAssignedTo is false', () => {
    const html = renderConfig(state({ config: config({ showAssignedTo: false }) }));
    expect(html).not.toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('wraps Skill Configuration in a parent section container around the config editor', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));

    const parentIndex = html.indexOf('kb-config-parent-section');
    const headerIndex = html.indexOf('Skill Configuration');
    const levelIndex = html.indexOf('data-level="Task"');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(parentIndex);
    expect(levelIndex).toBeGreaterThan(headerIndex);
  });

  it('does not show a team selector when there are 0 or 1 teams in cardSettingsByTeam', () => {
    const html = renderConfig(state({ config: config({ cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } } } }) }));
    expect(html).not.toContain('id="kb-team-select"');
  });

  it('shows a team selector when there is more than one team in cardSettingsByTeam', () => {
    const html = renderConfig(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );
    expect(html).toContain('id="kb-team-select"');
    expect(html).toContain('<option value="Team 1"');
    expect(html).toContain('<option value="Team 2"');
  });

  it('marks the selected team as selected in the dropdown', () => {
    const html = renderConfig(
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
    const html = renderConfig(
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
});
