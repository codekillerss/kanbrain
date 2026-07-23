import { describe, it, expect } from 'vitest';
import { isSameRepository } from './isSameRepository';

describe('isSameRepository', () => {
  it('returns null when the local remote URL is null', () => {
    expect(isSameRepository('kanbrain', null)).toBeNull();
  });

  it('matches an HTTPS remote URL against the repo name', () => {
    expect(isSameRepository('kanbrain', 'https://codekillers@dev.azure.com/codekillers/Code%20Killers/_git/kanbrain')).toBe(true);
  });

  it('matches an SSH remote URL against the repo name', () => {
    expect(isSameRepository('kanbrain', 'git@ssh.dev.azure.com:v3/codekillers/Code Killers/kanbrain')).toBe(true);
  });

  it('matches regardless of a trailing .git suffix', () => {
    expect(isSameRepository('kanbrain', 'https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain.git')).toBe(true);
  });

  it('matches regardless of a trailing slash', () => {
    expect(isSameRepository('kanbrain', 'https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain/')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isSameRepository('KanBrain', 'https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain')).toBe(true);
  });

  it('matches a repo name containing a URL-encoded space', () => {
    expect(isSameRepository('my repo', 'https://dev.azure.com/codekillers/Code%20Killers/_git/my%20repo')).toBe(true);
  });

  it('returns false when the repo names differ', () => {
    expect(isSameRepository('kanbrain', 'https://dev.azure.com/codekillers/Code%20Killers/_git/other-repo')).toBe(false);
  });
});
