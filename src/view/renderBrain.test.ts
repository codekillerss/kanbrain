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
  it('shows Skills, Profiles, and Repositories section titles in that order', () => {
    const html = renderBrain(state());
    const skillsIndex = html.indexOf('Skills');
    const profilesIndex = html.indexOf('Profiles');
    const repositoriesIndex = html.indexOf('Repositories');

    expect(skillsIndex).toBeGreaterThanOrEqual(0);
    expect(profilesIndex).toBeGreaterThan(skillsIndex);
    expect(repositoriesIndex).toBeGreaterThan(profilesIndex);
  });

  it('gives each segment an icon', () => {
    const html = renderBrain(state());
    expect(html).toContain('🛠️');
    expect(html).toContain('👤');
    expect(html).toContain('📁');
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

  it('wraps each segment body in kb-collapsible-body, with an inner kb-segment-scroll for the actual list', () => {
    const html = renderBrain(state());
    expect(html.split('kb-collapsible-body').length - 1).toBe(3);
    expect(html.split('kb-segment-scroll').length - 1).toBe(3);
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

  it('defaults to only the Skills segment expanded when openBrainSegment is omitted', () => {
    const html = renderBrain(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    const skillsBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-level="Task"'));
    const skillsBodyTag = html.slice(html.lastIndexOf('<div', skillsBodyStart), html.indexOf('>', skillsBodyStart) + 1);
    expect(skillsBodyTag).not.toContain('kb-hidden');
  });

  it('defaults to the Profiles and Repositories segments collapsed when openBrainSegment is omitted', () => {
    const html = renderBrain(
      state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } }, repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }),
    );

    const profilesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-profile-id="developer"'));
    const profilesBodyTag = html.slice(html.lastIndexOf('<div', profilesBodyStart), html.indexOf('>', profilesBodyStart) + 1);
    expect(profilesBodyTag).toContain('kb-hidden');

    const repositoriesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-repository-id="repo-1"'));
    const repositoriesBodyTag = html.slice(html.lastIndexOf('<div', repositoriesBodyStart), html.indexOf('>', repositoriesBodyStart) + 1);
    expect(repositoriesBodyTag).toContain('kb-hidden');
  });

  it('tags each segment toggle button with a matching data-segment (not just the AI button)', () => {
    const html = renderBrain(state());
    expect(html).toContain('data-action="toggle-group" data-segment="repositories"');
    expect(html).toContain('data-action="toggle-group" data-segment="skills"');
    expect(html).toContain('data-action="toggle-group" data-segment="profiles"');
  });

  it('expands Profiles and collapses the others when openBrainSegment is "profiles"', () => {
    const html = renderBrain(
      state({
        openBrainSegment: 'profiles',
        config: config({ profiles: { developer: { label: 'Developer', description: 'x' } }, skills: { Task: { 'To Do': null } } }),
      }),
    );

    const skillsBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-level="Task"'));
    const skillsBodyTag = html.slice(html.lastIndexOf('<div', skillsBodyStart), html.indexOf('>', skillsBodyStart) + 1);
    expect(skillsBodyTag).toContain('kb-hidden');

    const profilesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-profile-id="developer"'));
    const profilesBodyTag = html.slice(html.lastIndexOf('<div', profilesBodyStart), html.indexOf('>', profilesBodyStart) + 1);
    expect(profilesBodyTag).not.toContain('kb-hidden');
  });

  it('expands Repositories and collapses the others when openBrainSegment is "repositories"', () => {
    const html = renderBrain(
      state({ openBrainSegment: 'repositories', config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }),
    );

    const repositoriesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-repository-id="repo-1"'));
    const repositoriesBodyTag = html.slice(html.lastIndexOf('<div', repositoriesBodyStart), html.indexOf('>', repositoriesBodyStart) + 1);
    expect(repositoriesBodyTag).not.toContain('kb-hidden');
  });

  it('collapses all three segments when openBrainSegment is null', () => {
    const html = renderBrain(state({ openBrainSegment: null }));
    expect(html.split('kb-hidden').length - 1).toBe(3);
  });

  it('marks the currently open segment with kb-config-parent-section-expanded, exactly once', () => {
    const html = renderBrain(state({ openBrainSegment: 'profiles' }));
    expect(html.split('kb-config-parent-section-expanded').length - 1).toBe(1);
  });

  it('pins the Add Global Skill button after the scrollable list, inside the Skills segment', () => {
    const html = renderBrain(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    const scrollStart = html.indexOf('kb-segment-scroll');
    const addButtonIndex = html.indexOf('data-action="add-global-skill"');
    expect(addButtonIndex).toBeGreaterThan(scrollStart);
  });

  it('pins the Add Profile button after the scrollable list, inside the Profiles segment', () => {
    const html = renderBrain(state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } } }) }));
    const scrollStart = html.indexOf('kb-segment-scroll');
    const addButtonIndex = html.indexOf('data-action="add-profile"');
    expect(addButtonIndex).toBeGreaterThan(scrollStart);
  });

  it('does not show an Add button in the Repositories segment', () => {
    const html = renderBrain(state());
    expect(html).not.toContain('data-action="add-repository"');
  });
});
