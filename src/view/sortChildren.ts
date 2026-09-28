import type { WorkItem, KanbrainConfig, ChildSortCriterion } from '../types';

export const DEFAULT_CHILD_SORT_CRITERIA: ChildSortCriterion[] = ['status', 'backlogLevel', 'stackRank', 'created'];

const ALL_CHILD_SORT_CRITERIA: readonly ChildSortCriterion[] = ['status', 'backlogLevel', 'workItemType', 'stackRank', 'created'];

// Sanitizes criteria coming from the webview: known values only, first occurrence wins.
export function parseChildSortCriteria(value: unknown): ChildSortCriterion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ChildSortCriterion[] = [];
  for (const item of value) {
    if (ALL_CHILD_SORT_CRITERIA.includes(item as ChildSortCriterion) && !result.includes(item as ChildSortCriterion)) {
      result.push(item as ChildSortCriterion);
    }
  }
  return result;
}

const CATEGORY_ORDER: Record<string, number> = { Proposed: 0, InProgress: 1, Resolved: 2, Completed: 3 };

type Comparator = (a: WorkItem, b: WorkItem) => number;

// Compares two optional keys, treating the criterion as a tie when either side has no data for it —
// with an older config (before a Sync that discovers categories/levels) we skip the criterion
// rather than guess.
function compareKnown(a: number | undefined, b: number | undefined): number {
  return a === undefined || b === undefined ? 0 : a - b;
}

// Unranked items sit below the ranked ones, as they do on the Azure DevOps backlog.
function compareBacklogOrder(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? 1 : -1;
  }
  return a - b;
}

function createdTime(item: WorkItem): number {
  return item.createdDate ? new Date(item.createdDate).getTime() : 0;
}

function buildComparators(config: KanbrainConfig, selectedTeam: string | undefined): Record<ChildSortCriterion, Comparator> {
  const levels =
    (selectedTeam && config.backlogLevelsByTeam?.[selectedTeam]) || config.backlogLevelsByTeam?.[config.defaultTeam] || {};
  const category = (item: WorkItem) => {
    const name = config.statusCategoriesByType?.[item.type]?.[item.status];
    return name === undefined ? undefined : CATEGORY_ORDER[name];
  };
  // Position of the status among its type's states in the same category, in process order (the
  // discovered states keep the order the API returns them in). Per type, since each type has its
  // own state list.
  const positionInCategory = (item: WorkItem) => {
    const states = config.statusCategoriesByType?.[item.type];
    const name = states?.[item.status];
    if (!states || name === undefined) {
      return undefined;
    }
    return Object.keys(states)
      .filter(state => states[state] === name)
      .indexOf(item.status);
  };
  return {
    // Lifecycle order (Proposed, InProgress, Resolved, Completed), then process order within it.
    status: (a, b) => compareKnown(category(a), category(b)) || compareKnown(positionInCategory(a), positionInCategory(b)),
    // Higher levels first, the most "child" types last.
    backlogLevel: (a, b) => compareKnown(levels[b.type], levels[a.type]),
    workItemType: (a, b) => a.type.localeCompare(b.type),
    stackRank: (a, b) => compareBacklogOrder(a.backlogOrder, b.backlogOrder),
    created: (a, b) => createdTime(a) - createdTime(b),
  };
}

// Sorts by the given criteria in priority order. Array.prototype.sort is stable, so whatever the
// criteria leave tied — everything, when none are selected — keeps the API's order.
export function sortChildren(
  items: WorkItem[],
  config: KanbrainConfig,
  selectedTeam: string | undefined,
  criteria: ChildSortCriterion[] = DEFAULT_CHILD_SORT_CRITERIA,
): WorkItem[] {
  const comparators = buildComparators(config, selectedTeam);
  const active = criteria.map(criterion => comparators[criterion]).filter((c): c is Comparator => !!c);
  return [...items].sort((a, b) => {
    for (const compare of active) {
      const result = compare(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}
