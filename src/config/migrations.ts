import type { KanbrainConfig, SkillEntry } from '../types';

export interface ConfigMigration {
  version: string;
  detect: (raw: unknown) => boolean;
  migrate: (raw: unknown) => unknown;
}

function isOlderThan(configVersion: string | undefined, threshold: string): boolean {
  if (!configVersion) {
    return true;
  }
  const a = configVersion.split('.').map(Number);
  const b = threshold.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff < 0;
    }
  }
  return false;
}

interface LegacyKanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  showAssignedTo?: boolean;
  lastSyncedVersion?: string;
}

function isLegacyShape(raw: unknown): raw is LegacyKanbrainConfig {
  return !!raw && typeof raw === 'object' && 'typeToBacklogLevel' in raw && 'backlogLevels' in raw && !('skills' in raw);
}

// Introduced in 0.2.3: replaced per-backlog-level skill mapping (typeToBacklogLevel/backlogLevels)
// with a direct per-work-item-type mapping (skills), and per-board card settings with per-team
// (cardSettingsByBoard -> cardSettingsByTeam). Only runs for configs a version older than 0.2.3
// last touched — anyone already past that version was never written in the old shape.
const migrateSkillsByType: ConfigMigration = {
  version: '0.2.3',
  detect: raw => isLegacyShape(raw) && isOlderThan(raw.lastSyncedVersion, '0.2.3'),
  migrate: raw => {
    const legacy = raw as LegacyKanbrainConfig;
    const skills: Record<string, Record<string, SkillEntry | null>> = {};
    for (const [type, level] of Object.entries(legacy.typeToBacklogLevel)) {
      skills[type] = { ...(legacy.backlogLevels[level] ?? {}) };
    }

    return {
      organization: legacy.organization,
      project: legacy.project,
      defaultTeam: '',
      skills,
      statusColors: legacy.statusColors,
      typeColors: legacy.typeColors,
      typeIcons: legacy.typeIcons,
      showAssignedTo: legacy.showAssignedTo,
    };
  },
};

export const migrations: ConfigMigration[] = [migrateSkillsByType];

export function runMigrations(raw: unknown): KanbrainConfig {
  let current = raw;
  for (const migration of migrations) {
    if (migration.detect(current)) {
      current = migration.migrate(current);
    }
  }
  return current as KanbrainConfig;
}
