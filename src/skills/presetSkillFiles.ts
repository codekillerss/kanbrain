import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';
import type { SkillEntry } from '../types';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from '../view/badgeColor';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);
const NEUTRAL_BUTTON_COLOR = 'b2b2b2';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(levelName: string, statusName: string): string {
  return `# Skill: ${levelName} — ${statusName}

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;
}

function buildStatusSkillEntry(
  relativePath: string,
  statusName: string,
  statusColors: Record<string, string>,
): SkillEntry {
  const rawColor = statusColors[statusName];
  const buttonColor = rawColor && isValidHexColor(rawColor) ? rawColor.replace(/^#/, '') : NEUTRAL_BUTTON_COLOR;
  const textColor = pickReadableTextColor(normalizeHex(buttonColor)).replace(/^#/, '');
  return {
    path: relativePath,
    label: `Execute ${statusName} skill`,
    textColor,
    buttonColor,
  };
}

export function buildPresetPlan(
  discovered: DiscoveredBacklogLevels,
  generateFiles: boolean,
  statusColors: Record<string, string>,
): PresetPlan {
  const backlogLevels: Record<string, Record<string, SkillEntry | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [levelName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, SkillEntry | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${levelName}::${statusName}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(levelName)}-${slugify(statusName)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(levelName, statusName) });
      }
      statusSkills[statusName] = buildStatusSkillEntry(relativePath, statusName, statusColors);
    }

    backlogLevels[levelName] = statusSkills;
  }

  return { backlogLevels, filesToWrite };
}
