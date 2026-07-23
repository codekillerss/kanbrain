import type { SkillEntry } from '../types';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from '../view/badgeColor';

export interface PresetPlan {
  skills: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);
const NEUTRAL_BUTTON_COLOR = 'b2b2b2';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(typeName: string, statusName: string): string {
  return `# Skill: ${typeName} — ${statusName}

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
  discovered: Record<string, Record<string, string>>,
  generateFiles: boolean,
  statusColors: Record<string, string>,
): PresetPlan {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [typeName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, SkillEntry | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${typeName}::${statusName}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(typeName)}-${slugify(statusName)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(typeName, statusName) });
      }
      statusSkills[statusName] = buildStatusSkillEntry(relativePath, statusName, statusColors);
    }

    skills[typeName] = statusSkills;
  }

  return { skills, filesToWrite };
}
