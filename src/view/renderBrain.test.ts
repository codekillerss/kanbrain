import { describe, it, expect } from 'vitest';
import { renderBrain } from './renderBrain';
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
    screen: 'brain',
    ...overrides,
  };
}

describe('renderBrain', () => {
  it('shows Repositories, Skills, and Profiles section titles in that order', () => {
    const html = renderBrain(state());
    const repositoriesIndex = html.indexOf('Repositories');
    const skillsIndex = html.indexOf('Skills');
    const profilesIndex = html.indexOf('>Profiles<');

    expect(repositoriesIndex).toBeGreaterThanOrEqual(0);
    expect(skillsIndex).toBeGreaterThan(repositoriesIndex);
    expect(profilesIndex).toBeGreaterThan(skillsIndex);
  });

  it('gives each segment a "Configure with AI" button tagged with the right data-segment', () => {
    const html = renderBrain(state());
    expect(html).toContain('data-action="run-segment-ai" data-segment="repositories"');
    expect(html).toContain('data-action="run-segment-ai" data-segment="skills"');
    expect(html).toContain('data-action="run-segment-ai" data-segment="profiles"');
  });

  it('gives each segment a collapse toggle with a chevron', () => {
    const html = renderBrain(state());
    expect(html.split('data-action="toggle-group"').length - 1).toBe(3);
    expect(html.split('kb-chevron').length - 1).toBe(3);
  });

  it('wraps each segment body in kb-collapsible-body', () => {
    const html = renderBrain(state());
    expect(html.split('kb-collapsible-body').length - 1).toBe(3);
  });

  it('renders repository rows in the Repositories segment', () => {
    const html = renderBrain(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } } }) }));
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('renders skill type groups in the Skills segment', () => {
    const html = renderBrain(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Task"');
  });

  it('renders profile rows in the Profiles segment', () => {
    const html = renderBrain(state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } } }) }));
    expect(html).toContain('data-profile-id="developer"');
  });
});
