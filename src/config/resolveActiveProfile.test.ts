import { describe, it, expect } from 'vitest';
import { resolveActiveProfile } from './resolveActiveProfile';
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

describe('resolveActiveProfile', () => {
  it('returns null when no profile is selected', () => {
    expect(resolveActiveProfile(config())).toBeNull();
  });

  it('returns the matching profile entry when selectedProfileId resolves', () => {
    const result = resolveActiveProfile(
      config({
        profiles: { developer: { label: 'Developer', description: 'I am a developer.' } },
        selectedProfileId: 'developer',
      }),
    );
    expect(result).toEqual({ label: 'Developer', description: 'I am a developer.' });
  });

  it('returns null when selectedProfileId does not match any entry in profiles', () => {
    const result = resolveActiveProfile(
      config({
        profiles: { developer: { label: 'Developer', description: 'I am a developer.' } },
        selectedProfileId: 'removed-profile',
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when selectedProfileId is set but profiles is undefined', () => {
    expect(resolveActiveProfile(config({ selectedProfileId: 'developer' }))).toBeNull();
  });
});
