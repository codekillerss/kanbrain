import type { KanbrainConfig, ProfileEntry } from '../types';

export function resolveActiveProfile(config: KanbrainConfig): ProfileEntry | null {
  if (!config.selectedProfileId) {
    return null;
  }
  return config.profiles?.[config.selectedProfileId] ?? null;
}
