import type { KanbrainConfig } from '../types';

export interface BoardConfigDiff {
  typesAdded: string[];
  typesRemoved: string[];
  statusesAdded: { type: string; status: string }[];
  statusesRemoved: { type: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(config: KanbrainConfig, discovered: Record<string, Record<string, string>>): BoardConfigDiff {
  const typesAdded: string[] = [];
  const typesRemoved: string[] = [];
  const statusesAdded: { type: string; status: string }[] = [];
  const statusesRemoved: { type: string; status: string; skillPath: string | null }[] = [];

  for (const type of Object.keys(config.skills)) {
    if (!(type in discovered)) {
      typesRemoved.push(type);
      continue;
    }
    for (const status of Object.keys(config.skills[type])) {
      if (!(status in discovered[type])) {
        statusesRemoved.push({ type, status, skillPath: config.skills[type][status]?.path ?? null });
      }
    }
  }
  for (const [type, statuses] of Object.entries(discovered)) {
    if (!(type in config.skills)) {
      typesAdded.push(type);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.skills[type])) {
        statusesAdded.push({ type, status });
      }
    }
  }

  return { typesAdded, typesRemoved, statusesAdded, statusesRemoved };
}

export function isDiffEmpty(diff: BoardConfigDiff): boolean {
  return (
    diff.typesAdded.length === 0 &&
    diff.typesRemoved.length === 0 &&
    diff.statusesAdded.length === 0 &&
    diff.statusesRemoved.length === 0
  );
}

export function summarizeDiff(diff: BoardConfigDiff): string {
  const parts: string[] = [];
  if (diff.typesAdded.length) parts.push(`${diff.typesAdded.length} new work item type(s)`);
  if (diff.typesRemoved.length) parts.push(`${diff.typesRemoved.length} work item type(s) no longer found`);
  if (diff.statusesAdded.length) parts.push(`${diff.statusesAdded.length} new status(es)`);
  if (diff.statusesRemoved.length) parts.push(`${diff.statusesRemoved.length} status(es) no longer found (skill mappings preserved)`);
  return parts.join(', ');
}
