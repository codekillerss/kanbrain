import type { KanbrainConfig, SkillEntry } from '../types';

interface LegacyKanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  showAssignedTo?: boolean;
}

function isLegacyConfig(raw: unknown): raw is LegacyKanbrainConfig {
  return !!raw && typeof raw === 'object' && 'typeToBacklogLevel' in raw && 'backlogLevels' in raw && !('skills' in raw);
}

export function migrateConfig(raw: unknown): KanbrainConfig {
  if (!isLegacyConfig(raw)) {
    return raw as KanbrainConfig;
  }

  const skills: Record<string, Record<string, SkillEntry | null>> = {};
  for (const [type, level] of Object.entries(raw.typeToBacklogLevel)) {
    skills[type] = { ...(raw.backlogLevels[level] ?? {}) };
  }

  return {
    organization: raw.organization,
    project: raw.project,
    defaultTeam: '',
    skills,
    statusColors: raw.statusColors,
    typeColors: raw.typeColors,
    typeIcons: raw.typeIcons,
    showAssignedTo: raw.showAssignedTo,
  };
}
