import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, string | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(levelName: string, category: string): string {
  return `# Skill: ${levelName} — ${category}

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;
}

export function buildPresetPlan(discovered: DiscoveredBacklogLevels, generateFiles: boolean): PresetPlan {
  const backlogLevels: Record<string, Record<string, string | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [levelName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, string | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${levelName}::${category}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(levelName)}-${slugify(category)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(levelName, category) });
      }
      statusSkills[statusName] = relativePath;
    }

    backlogLevels[levelName] = statusSkills;
  }

  return { backlogLevels, filesToWrite };
}
