import type { KanbrainConfig, SkillEntry, WorkflowStepConfig } from '../types';
import { compareVersions } from './compareVersions';

export interface ConfigMigration {
  version: string;
  detect: (raw: unknown) => boolean;
  migrate: (raw: unknown) => unknown;
}

function isOlderThan(configVersion: string | undefined, threshold: string): boolean {
  if (!configVersion) {
    return true;
  }
  return compareVersions(configVersion, threshold) < 0;
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

interface PreWorkflowStepsConfig {
  skills: Record<string, Record<string, SkillEntry | null>>;
  globalSkills?: Record<string, SkillEntry>;
  lastSyncedVersion?: string;
  [key: string]: unknown;
}

function isPreWorkflowStepsShape(raw: unknown): raw is PreWorkflowStepsConfig {
  return !!raw && typeof raw === 'object' && 'skills' in raw && !('workflowSteps' in raw);
}

// Introduced in 0.12.0: split the per-(type, status) skill mapping (skills) in two — a flat,
// id-keyed skill registry (skills, replacing the old flat globalSkills) and a per-(type, status)
// workflow-step mapping (workflowSteps) that references a skill by id and adds a Definition of
// Done / expected artifacts. Skill entries that were identical (same path, label, colors) across
// multiple status cells collapse into a single registry entry; anything else gets its own id so no
// per-status label/color override is lost. Former globalSkills entries carry isGlobal forward so
// they keep showing in the card's "other skills" menu after migrating.
const migrateWorkflowSteps: ConfigMigration = {
  version: '0.12.0',
  detect: raw => isPreWorkflowStepsShape(raw) && isOlderThan(raw.lastSyncedVersion, '0.12.0'),
  migrate: raw => {
    const legacy = raw as PreWorkflowStepsConfig;
    const skills: Record<string, SkillEntry> = {};
    for (const [id, entry] of Object.entries(legacy.globalSkills ?? {})) {
      skills[id] = { ...entry, isGlobal: true };
    }
    const idByEntryKey = new Map<string, string>(Object.entries(skills).map(([id, entry]) => [JSON.stringify(entry), id]));
    let nextIndex = 1;

    const workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>> = {};
    for (const [type, statuses] of Object.entries(legacy.skills)) {
      const steps: Record<string, WorkflowStepConfig | null> = {};
      for (const [status, entry] of Object.entries(statuses)) {
        if (!entry) {
          steps[status] = null;
          continue;
        }
        const entryKey = JSON.stringify(entry);
        let id = idByEntryKey.get(entryKey);
        if (!id) {
          do {
            id = `skill-${nextIndex++}`;
          } while (id in skills);
          skills[id] = entry;
          idByEntryKey.set(entryKey, id);
        }
        steps[status] = { skillId: id };
      }
      workflowSteps[type] = steps;
    }

    const { globalSkills: _globalSkills, skills: _oldSkills, ...rest } = legacy;
    return { ...rest, skills, workflowSteps };
  },
};

export const migrations: ConfigMigration[] = [migrateSkillsByType, migrateWorkflowSteps];

export function runMigrations(raw: unknown): KanbrainConfig {
  let current = raw;
  for (const migration of migrations) {
    if (migration.detect(current)) {
      current = migration.migrate(current);
    }
  }
  return current as KanbrainConfig;
}
