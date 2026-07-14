export interface BacklogLevel {
  name: string;
  workItemTypes: string[];
}

export interface WorkItemTypeState {
  name: string;
  category: string;
}

export type DiscoveredBacklogLevels = Record<string, Record<string, string>>;

export function discoverBacklogLevelStates(
  levels: BacklogLevel[],
  statesByType: Record<string, WorkItemTypeState[]>,
): DiscoveredBacklogLevels {
  const result: DiscoveredBacklogLevels = {};

  for (const level of levels) {
    const statuses: Record<string, string> = {};
    for (const type of level.workItemTypes) {
      const states = statesByType[type];
      if (!states) {
        continue;
      }
      for (const state of states) {
        statuses[state.name] = state.category;
      }
    }
    if (Object.keys(statuses).length > 0) {
      result[level.name] = statuses;
    }
  }

  return result;
}

export function buildTypeToBacklogLevel(levels: BacklogLevel[], knownTypes: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const level of levels) {
    for (const type of level.workItemTypes) {
      if (knownTypes.has(type)) {
        result[type] = level.name;
      }
    }
  }
  return result;
}
