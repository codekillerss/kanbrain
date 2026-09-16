import { describe, it, expect } from 'vitest';
import { compareVersions, isExtensionOutdated } from './compareVersions';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('0.12.0', '0.12.0')).toBe(0);
  });

  it('returns negative when a is older than b', () => {
    expect(compareVersions('0.11.1', '0.12.0')).toBeLessThan(0);
  });

  it('returns positive when a is newer than b', () => {
    expect(compareVersions('0.12.0', '0.11.1')).toBeGreaterThan(0);
  });

  it('treats missing trailing segments as 0', () => {
    expect(compareVersions('0.12', '0.12.0')).toBe(0);
  });

  it('compares numerically, not lexicographically (0.9 < 0.10)', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0);
  });
});

describe('isExtensionOutdated', () => {
  it('is false when there is no lastSyncedVersion recorded', () => {
    expect(isExtensionOutdated('0.12.0', undefined)).toBe(false);
  });

  it('is false when the config was last synced by an older or equal extension version', () => {
    expect(isExtensionOutdated('0.12.0', '0.11.1')).toBe(false);
    expect(isExtensionOutdated('0.12.0', '0.12.0')).toBe(false);
  });

  it('is true when the config was last synced by a newer extension version', () => {
    expect(isExtensionOutdated('0.11.1', '0.12.0')).toBe(true);
  });
});
