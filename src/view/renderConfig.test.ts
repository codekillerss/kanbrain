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

  it('does not show Skill Configuration or Profiles — they live on the Brain screen now', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } }, profiles: { developer: { label: 'Developer', description: 'x' } } }) }));
    expect(html).not.toContain('Skill Configuration');
    expect(html).not.toContain('data-level="Task"');
    expect(html).not.toContain('data-profile-id="developer"');
  });
});
