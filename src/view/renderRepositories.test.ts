import { describe, it, expect } from 'vitest';
import { renderRepositories } from './renderRepositories';
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
    screen: 'repositories',
    ...overrides,
  };
}

describe('renderRepositories', () => {
  it('shows a message when no repositories are mapped yet', () => {
    const html = renderRepositories(state());
    expect(html).toContain('No repositories mapped yet.');
  });

  it('shows one row per repository with the escaped name and path value', () => {
    const html = renderRepositories(
      state({ config: config({ repositories: { 'repo-1': { name: 'Fix <me>', path: 'C:\\repos\\kanbrain' } } }) }),
    );
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('value="C:\\repos\\kanbrain"');
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('shows an empty path value for an unmapped repository', () => {
    const html = renderRepositories(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }));
    expect(html).toContain('value=""');
  });

  it('includes a browse-folder button per row', () => {
    const html = renderRepositories(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }));
    expect(html).toContain('data-action="pick-repository-folder"');
  });
});
