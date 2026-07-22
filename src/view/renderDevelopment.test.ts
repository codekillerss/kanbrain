import { describe, it, expect } from 'vitest';
import { renderDevelopmentSection } from './renderDevelopment';
import type { DevelopmentLink, PullRequestDetails } from '../types';

describe('renderDevelopmentSection', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentSection([], {})).toBe('');
  });

  it('renders the "Development" label with the branch-fork icon when there is at least one link', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'main' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('Development');
    expect(html).toContain('<svg');
  });

  it('renders a branch link by its escaped name', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/<xss>' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-dev-item');
    expect(html).toContain('feature/&lt;xss&gt;');
  });

  it('renders a pull request with its resolved title and capitalized status', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const prDetails: Record<string, PullRequestDetails> = { 'repo-1:57': { title: 'Fix <login> bug', status: 'active' } };
    const html = renderDevelopmentSection(links, prDetails);
    expect(html).toContain('#57 Fix &lt;login&gt; bug (Active)');
  });

  it('renders only the #id when the pull request details were not resolved', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('#57');
    expect(html).not.toContain('(Active)');
  });

  it('renders multiple links (branch and pull request) in the same section', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
    ];
    const html = renderDevelopmentSection(links, {});
    expect(html.split('kb-dev-item').length - 1).toBe(2);
    expect(html).toContain('main');
    expect(html).toContain('#57');
  });
});
