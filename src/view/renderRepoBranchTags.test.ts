import { describe, it, expect } from 'vitest';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';
import type { RepositoryPathEntry } from '../types';

describe('renderBranchTag', () => {
  it('renders a clickable tag linking to the checkoutBranch command when args are given', () => {
    const html = renderBranchTag('feature/x', ['repo-1', 'feature/x']);

    expect(html).toContain('kb-branch-tag');
    expect(html).not.toContain('kb-branch-tag-disabled');
    expect(html).toContain('feature/x');

    const match = html.match(/href="(command:kanbrain\.checkoutBranch\?[^"]+)"/);
    expect(match).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(match![1].split('?')[1]))).toEqual(['repo-1', 'feature/x']);
  });

  it('renders a disabled, non-clickable tag when args are null', () => {
    const html = renderBranchTag('feature/x', null);

    expect(html).toContain('kb-branch-tag-disabled');
    expect(html).not.toContain('command:kanbrain.checkoutBranch');
    expect(html).toContain('feature/x');
  });

  it('escapes the branch name', () => {
    const html = renderBranchTag('feature/<xss>', null);
    expect(html).not.toContain('<xss>');
    expect(html).toContain('feature/&lt;xss&gt;');
  });

  it('includes a branch icon in both the enabled and disabled states', () => {
    expect(renderBranchTag('x', ['repo-1', 'x'])).toContain('<svg');
    expect(renderBranchTag('x', null)).toContain('<svg');
  });
});

describe('renderRepoTag', () => {
  it('renders a non-interactive tag with the escaped repository name when mapped', () => {
    const entry: RepositoryPathEntry = { name: 'Fix <me>', path: 'C:\\repos\\kanbrain' };
    const html = renderRepoTag('repo-1', entry);

    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('kb-repo-tag-mapped');
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('<svg');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });

  it('renders a clickable, dashed tag with the repository name when known but unmapped', () => {
    const entry: RepositoryPathEntry = { name: 'kanbrain', path: '' };
    const html = renderRepoTag('repo-1', entry);

    expect(html).toContain('kb-repo-tag-unmapped');
    expect(html).toContain('kanbrain');

    const match = html.match(/href="(command:kanbrain\.resolveRepositoryTag\?[^"]+)"/);
    expect(match).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(match![1].split('?')[1]))).toEqual(['repo-1']);
  });

  it('renders a clickable, dashed "Unknown repository" tag when the repository is not in config at all', () => {
    const html = renderRepoTag('repo-1', undefined);

    expect(html).toContain('kb-repo-tag-unmapped');
    expect(html).toContain('Unknown repository');

    const match = html.match(/href="(command:kanbrain\.resolveRepositoryTag\?[^"]+)"/);
    expect(match).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(match![1].split('?')[1]))).toEqual(['repo-1']);
  });

  it('escapes the repository name in the unmapped state', () => {
    const entry: RepositoryPathEntry = { name: '<xss>', path: '' };
    const html = renderRepoTag('repo-1', entry);
    expect(html).not.toContain('<xss>');
    expect(html).toContain('&lt;xss&gt;');
  });
});
