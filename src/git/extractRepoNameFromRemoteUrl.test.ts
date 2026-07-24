import { describe, it, expect } from 'vitest';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

describe('extractRepoNameFromRemoteUrl', () => {
  it('extracts the repo name from an HTTPS remote URL', () => {
    expect(extractRepoNameFromRemoteUrl('https://codekillers@dev.azure.com/codekillers/Code%20Killers/_git/kanbrain')).toBe('kanbrain');
  });

  it('extracts the repo name from an SSH remote URL', () => {
    expect(extractRepoNameFromRemoteUrl('git@ssh.dev.azure.com:v3/codekillers/Code Killers/kanbrain')).toBe('kanbrain');
  });

  it('strips a trailing .git suffix', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain.git')).toBe('kanbrain');
  });

  it('strips a trailing slash', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain/')).toBe('kanbrain');
  });

  it('decodes a URL-encoded space in the repo name', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/my%20repo')).toBe('my repo');
  });

  it('returns null for an empty string', () => {
    expect(extractRepoNameFromRemoteUrl('')).toBeNull();
  });
});
