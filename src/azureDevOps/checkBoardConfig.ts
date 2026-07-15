import type { KanbrainConfig } from '../types';
import type { DiscoveredBacklogLevels } from './backlogLevels';

export interface BoardConfigDiff {
  typesRemoved: string[];
  typesAdded: string[];
  typesMoved: { type: string; from: string; to: string }[];
  levelsAdded: string[];
  levelsRemoved: string[];
  statusesAdded: { level: string; status: string }[];
  statusesRemoved: { level: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
): BoardConfigDiff {
  const typesRemoved: string[] = [];
  const typesAdded: string[] = [];
  const typesMoved: { type: string; from: string; to: string }[] = [];

  for (const [type, level] of Object.entries(config.typeToBacklogLevel)) {
    const freshLevel = freshTypeToBacklogLevel[type];
    if (!freshLevel) {
      typesRemoved.push(type);
    } else if (freshLevel !== level) {
      typesMoved.push({ type, from: level, to: freshLevel });
    }
  }
  for (const type of Object.keys(freshTypeToBacklogLevel)) {
    if (!(type in config.typeToBacklogLevel)) {
      typesAdded.push(type);
    }
  }

  const levelsAdded: string[] = [];
  const levelsRemoved: string[] = [];
  const statusesAdded: { level: string; status: string }[] = [];
  const statusesRemoved: { level: string; status: string; skillPath: string | null }[] = [];

  for (const level of Object.keys(config.backlogLevels)) {
    if (!(level in discovered)) {
      levelsRemoved.push(level);
      continue;
    }
    for (const status of Object.keys(config.backlogLevels[level])) {
      if (!(status in discovered[level])) {
        statusesRemoved.push({ level, status, skillPath: config.backlogLevels[level][status]?.path ?? null });
      }
    }
  }
  for (const [level, statuses] of Object.entries(discovered)) {
    if (!(level in config.backlogLevels)) {
      levelsAdded.push(level);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.backlogLevels[level])) {
        statusesAdded.push({ level, status });
      }
    }
  }

  return { typesRemoved, typesAdded, typesMoved, levelsAdded, levelsRemoved, statusesAdded, statusesRemoved };
}

export function isDiffEmpty(diff: BoardConfigDiff): boolean {
  return (
    diff.typesRemoved.length === 0 &&
    diff.typesAdded.length === 0 &&
    diff.typesMoved.length === 0 &&
    diff.levelsAdded.length === 0 &&
    diff.levelsRemoved.length === 0 &&
    diff.statusesAdded.length === 0 &&
    diff.statusesRemoved.length === 0
  );
}

export function summarizeDiff(diff: BoardConfigDiff): string {
  const parts: string[] = [];
  if (diff.typesAdded.length) parts.push(`${diff.typesAdded.length} new work item type(s)`);
  if (diff.typesRemoved.length) parts.push(`${diff.typesRemoved.length} work item type(s) no longer found`);
  if (diff.typesMoved.length) parts.push(`${diff.typesMoved.length} work item type(s) moved to a different backlog level`);
  if (diff.levelsAdded.length) parts.push(`${diff.levelsAdded.length} new backlog level(s)`);
  if (diff.levelsRemoved.length) parts.push(`${diff.levelsRemoved.length} backlog level(s) no longer found`);
  if (diff.statusesAdded.length) parts.push(`${diff.statusesAdded.length} new status(es)`);
  if (diff.statusesRemoved.length) parts.push(`${diff.statusesRemoved.length} status(es) no longer found (skill mappings preserved)`);
  return parts.join(', ');
}
