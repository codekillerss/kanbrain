import { describe, it, expect } from 'vitest';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';

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
  it('renders the escaped repository name with an icon', () => {
    const html = renderRepoTag('Fix <me>');
    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('<svg');
  });

  it('is never a link (purely informational)', () => {
    const html = renderRepoTag('kanbrain');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });
});
