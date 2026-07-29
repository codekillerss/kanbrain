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
  it('does not show its own Home button (that lives in the footer now)', () => {
    const html = renderConfig(state());
    expect(html).not.toContain('id="kb-home-btn"');
  });

  it('shows Setup and Configure with AI buttons in a Project section', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-run-setup-btn"');
    expect(html).toContain('id="kb-run-configure-ai-btn"');
    expect(html).toContain('>Project<');
  });

  it('renders the config editor', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Task"');
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

  it('wraps Profiles in its own parent section, before Skill Configuration', () => {
    const html = renderConfig(
      state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } }, skills: { Task: { 'To Do': null } } }) }),
    );

    const profilesHeaderIndex = html.indexOf('>Profiles<');
    const profilesRowIndex = html.indexOf('data-profile-id="developer"');
    const skillHeaderIndex = html.indexOf('Skill Configuration');

    expect(profilesHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(profilesRowIndex).toBeGreaterThan(profilesHeaderIndex);
    expect(skillHeaderIndex).toBeGreaterThan(profilesRowIndex);
  });

  it('shows the Profiles section even when there are no profiles configured', () => {
    const html = renderConfig(state());
    expect(html).toContain('>Profiles<');
    expect(html).toContain('data-action="add-profile"');
  });

  it('wraps the Display label and assignee checkbox in a bordered section card', () => {
    const html = renderConfig(state());

    const cardIndex = html.indexOf('kb-section-card');
    const labelIndex = html.indexOf('>Display<');
    const checkboxIndex = html.indexOf('id="kb-show-assignee-toggle"');

    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThan(cardIndex);
    expect(checkboxIndex).toBeGreaterThan(labelIndex);
  });

  it('does not show a team selector — it lives on the Home screen instead', () => {
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
    expect(html).not.toContain('id="kb-team-select"');
  });
});
