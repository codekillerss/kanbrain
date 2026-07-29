import { describe, it, expect } from 'vitest';
import { renderRepositoriesBody } from './renderRepositories';
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

describe('renderRepositoriesBody', () => {
  it('shows a message when no repositories are mapped yet', () => {
    const html = renderRepositoriesBody(config());
    expect(html).toContain('No repositories mapped yet.');
  });

  it('shows one row per repository with the escaped name and path value', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'Fix <me>', path: 'C:\\repos\\kanbrain' } } }));
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('value="C:\\repos\\kanbrain"');
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('shows an empty path value for an unmapped repository', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('value=""');
  });

  it('includes a browse-folder button per row', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('data-action="pick-repository-folder"');
  });

  it('includes a clone button for a repository with no local path', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('data-action="clone-repository"');
  });

  it('does not include a clone button for a repository that already has a local path', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } } }));
    expect(html).not.toContain('data-action="clone-repository"');
  });
});
