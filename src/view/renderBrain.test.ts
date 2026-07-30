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

  it('defaults to only the Repositories segment expanded when openBrainSegment is omitted', () => {
    const html = renderBrain(state());
    const repositoriesBodyStart = html.indexOf('kb-collapsible-body');
    const repositoriesBodyTag = html.slice(html.lastIndexOf('<div', repositoriesBodyStart), html.indexOf('>', repositoriesBodyStart) + 1);
    expect(repositoriesBodyTag).not.toContain('kb-hidden');
  });

  it('defaults to the Skills and Profiles segments collapsed when openBrainSegment is omitted', () => {
    const html = renderBrain(state({ config: config({ skills: { Task: { 'To Do': null } }, profiles: { developer: { label: 'Developer', description: 'x' } } }) }));

    const skillsBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-level="Task"'));
    const skillsBodyTag = html.slice(html.lastIndexOf('<div', skillsBodyStart), html.indexOf('>', skillsBodyStart) + 1);
    expect(skillsBodyTag).toContain('kb-hidden');

    const profilesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-profile-id="developer"'));
    const profilesBodyTag = html.slice(html.lastIndexOf('<div', profilesBodyStart), html.indexOf('>', profilesBodyStart) + 1);
    expect(profilesBodyTag).toContain('kb-hidden');
  });

  it('tags each segment toggle button with a matching data-segment (not just the AI button)', () => {
    const html = renderBrain(state());
    expect(html).toContain('data-action="toggle-group" data-segment="repositories"');
    expect(html).toContain('data-action="toggle-group" data-segment="skills"');
    expect(html).toContain('data-action="toggle-group" data-segment="profiles"');
  });

  it('expands Skills and collapses the others when openBrainSegment is "skills"', () => {
    const html = renderBrain(
      state({
        openBrainSegment: 'skills',
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } }, skills: { Task: { 'To Do': null } } }),
      }),
    );

    const repositoriesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-repository-id="repo-1"'));
    const repositoriesBodyTag = html.slice(html.lastIndexOf('<div', repositoriesBodyStart), html.indexOf('>', repositoriesBodyStart) + 1);
    expect(repositoriesBodyTag).toContain('kb-hidden');

    const skillsBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-level="Task"'));
    const skillsBodyTag = html.slice(html.lastIndexOf('<div', skillsBodyStart), html.indexOf('>', skillsBodyStart) + 1);
    expect(skillsBodyTag).not.toContain('kb-hidden');
  });

  it('expands Profiles and collapses the others when openBrainSegment is "profiles"', () => {
    const html = renderBrain(state({ openBrainSegment: 'profiles', config: config({ profiles: { developer: { label: 'Developer', description: 'x' } } }) }));

    const repositoriesBodyStart = html.indexOf('kb-collapsible-body');
    const repositoriesBodyTag = html.slice(html.lastIndexOf('<div', repositoriesBodyStart), html.indexOf('>', repositoriesBodyStart) + 1);
    expect(repositoriesBodyTag).toContain('kb-hidden');

    const profilesBodyStart = html.lastIndexOf('kb-collapsible-body', html.indexOf('data-profile-id="developer"'));
    const profilesBodyTag = html.slice(html.lastIndexOf('<div', profilesBodyStart), html.indexOf('>', profilesBodyStart) + 1);
    expect(profilesBodyTag).not.toContain('kb-hidden');
  });

  it('collapses all three segments when openBrainSegment is null', () => {
    const html = renderBrain(state({ openBrainSegment: null }));
    expect(html.split('kb-hidden').length - 1).toBe(3);
  });
});
