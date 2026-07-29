import { describe, it, expect } from 'vitest';
import { buildRepositoriesAssistantContent } from './buildRepositoriesAssistantFile';

describe('buildRepositoriesAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('lists a repository with a local path under "found locally"', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {
      'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' },
    });
    const foundIndex = content.indexOf('Repositories found locally');
    const notFoundIndex = content.indexOf('Repositories NOT found locally');
    const entryIndex = content.indexOf('**kanbrain**');

    expect(entryIndex).toBeGreaterThan(foundIndex);
    expect(entryIndex).toBeLessThan(notFoundIndex);
    expect(content).toContain('C:\\repos\\kanbrain');
  });

  it('lists a repository with no local path under "NOT found locally"', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {
      'repo-1': { name: 'other-repo', path: '' },
    });
    const notFoundIndex = content.indexOf('Repositories NOT found locally');
    const entryIndex = content.indexOf('other-repo');

    expect(entryIndex).toBeGreaterThan(notFoundIndex);
  });

  it('instructs the agent not to run git clone itself', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('Do not run `git clone` yourself.');
  });

  it('scopes the agent to repositories only', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('repositories only');
  });
});
