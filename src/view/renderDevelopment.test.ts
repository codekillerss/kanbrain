import { describe, it, expect } from 'vitest';
import { renderDevelopmentSection, renderDevelopmentBadge } from './renderDevelopment';
import type { DevelopmentLink, PullRequestDetails, RepositoryPathEntry } from '../types';

const MAPPED: Record<string, RepositoryPathEntry> = { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } };

describe('renderDevelopmentSection', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentSection([], {}, MAPPED)).toBe('');
  });

  it('wraps the section in the same bordered group used by other detail fields', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'main' }];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('kb-detail-group');
    expect(html).toContain('kb-detail-group-label');
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('Development');
    expect(html).toContain('<svg');
  });

  it('renders a branch as an escaped tag with a hover tooltip', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/<xss>' }];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('kb-branch-tag');
    expect(html).toContain('feature/&lt;xss&gt;');
    expect(html).toContain('title="Check out feature/&lt;xss&gt;"');
  });

  it('links a branch item to a checkoutBranch command URI with repositoryId and branchName', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/x' }];
    const html = renderDevelopmentSection(links, {}, MAPPED);

    const hrefMatch = html.match(/href="(command:kanbrain\.checkoutBranch\?[^"]+)"/);
    expect(hrefMatch).not.toBeNull();

    const [, href] = hrefMatch!;
    const [command, encodedArgs] = href.split('?');
    expect(command).toBe('command:kanbrain.checkoutBranch');
    expect(JSON.parse(decodeURIComponent(encodedArgs))).toEqual(['repo-1', 'feature/x']);
  });

  it('links a pull request item to an openPullRequestDetail command URI with repositoryId and pullRequestId', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {}, MAPPED);

    const hrefMatch = html.match(/href="(command:kanbrain\.openPullRequestDetail\?[^"]+)"/);
    expect(hrefMatch).not.toBeNull();

    const [, href] = hrefMatch!;
    const [command, encodedArgs] = href.split('?');
    expect(command).toBe('command:kanbrain.openPullRequestDetail');
    expect(JSON.parse(decodeURIComponent(encodedArgs))).toEqual(['repo-1', 57]);
  });

  it('renders a pull request with its resolved title and capitalized status', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const prDetails: Record<string, PullRequestDetails> = { 'repo-1:57': { title: 'Fix <login> bug', status: 'active' } };
    const html = renderDevelopmentSection(links, prDetails, MAPPED);
    expect(html).toContain('#57 Fix &lt;login&gt; bug (Active)');
  });

  it('renders only the #id when the pull request details were not resolved', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('#57');
    expect(html).not.toContain('(Active)');
  });

  it('renders multiple links (branch and pull request) in the same section', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
    ];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html.split('class="kb-dev-row"').length - 1).toBe(2);
    expect(html).toContain('main');
    expect(html).toContain('#57');
  });

  it('uses a visually distinct icon for branch vs pull request items', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
    ];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('M11 5.5'); // branch fork icon signature
    expect(html).toContain('<circle'); // pull request icon signature, absent from the branch icon
  });

  it('does not paginate when there are 3 or fewer links', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'a' },
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'b' },
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'c' },
    ];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).not.toContain('kb-dev-more-toggle');
    expect(html).not.toContain('See more');
  });

  it('shows only 3 items plus a "See more" control when there are more than 3 links', () => {
    const links: DevelopmentLink[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'branch' as const,
      repositoryId: 'repo-1',
      branchName: `branch-${i}`,
    }));
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html.split('class="kb-dev-row"').length - 1).toBe(5);
    expect(html.split('kb-dev-more-toggle').length - 1).toBe(1);
    expect(html.split('See more').length - 1).toBe(1);
  });

  it('adds one more repeatable "See more" batch per additional 5 items beyond the first 3', () => {
    const links: DevelopmentLink[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'branch' as const,
      repositoryId: 'repo-1',
      branchName: `branch-${i}`,
    }));
    const html = renderDevelopmentSection(links, {}, MAPPED);
    // 10 items - 3 initial = 7 remaining -> ceil(7 / 5) = 2 batches/buttons.
    expect(html.split('class="kb-dev-row"').length - 1).toBe(10);
    expect(html.split('kb-dev-more-toggle').length - 1).toBe(2);
    expect(html.split('See more').length - 1).toBe(2);
  });

  it('shows the branch as a disabled, non-clickable tag when the repository has no mapped path', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/x' }];
    const html = renderDevelopmentSection(links, {}, { 'repo-1': { name: 'kanbrain', path: '' } });

    expect(html).not.toContain('command:kanbrain.checkoutBranch');
    expect(html).toContain('kb-branch-tag-disabled');
    expect(html).toContain('feature/x');
  });

  it('shows the branch as disabled when the repository is entirely unmapped', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/x' }];
    const html = renderDevelopmentSection(links, {}, {});

    expect(html).not.toContain('command:kanbrain.checkoutBranch');
    expect(html).toContain('kb-branch-tag-disabled');
  });

  it('never disables a pull request item, even when the repository is unmapped', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {}, {});

    expect(html).toContain('command:kanbrain.openPullRequestDetail');
    expect(html).not.toContain('kb-branch-tag-disabled');
  });

  it('shows a repository tag next to a branch item when the repository is known', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/x' }];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('kanbrain');
  });

  it('shows a repository tag next to a pull request item when the repository is known', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {}, MAPPED);
    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('kanbrain');
  });

  it('omits the repository tag entirely when the repository is unknown', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/x' }];
    const html = renderDevelopmentSection(links, {}, {});
    expect(html).not.toContain('kb-repo-tag');
  });
});

describe('renderDevelopmentBadge', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentBadge([])).toBe('');
  });

  it('renders the fork icon and the combined count of branches and pull requests', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 58 },
    ];
    const html = renderDevelopmentBadge(links);
    expect(html).toContain('kb-dev-badge');
    expect(html).toContain('<svg');
    expect(html).toContain('>3<');
  });

  it('shows only the count, not any PR id or title', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentBadge(links);
    expect(html).toContain('>1<');
    expect(html).not.toContain('#57');
  });
});
