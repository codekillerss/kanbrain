import type { SkillEntry, WorkflowStepConfig } from '../types';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from '../view/badgeColor';

export interface PresetPlan {
  skills: Record<string, SkillEntry>;
  workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);
const NEUTRAL_BUTTON_COLOR = 'b2b2b2';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(typeName: string, statusName: string): string {
  return `# Skill: ${typeName} — ${statusName}

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
  const skills: Record<string, SkillEntry> = {};
  const workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const idByKey = new Map<string, string>();

  for (const [typeName, statuses] of Object.entries(discovered)) {
    const statusSteps: Record<string, WorkflowStepConfig | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSteps[statusName] = null;
        continue;
      }

      const key = `${typeName}::${statusName}`;
      let id = idByKey.get(key);
      if (!id) {
        id = `${slugify(typeName)}-${slugify(statusName)}`;
        const relativePath = `.kanbrain/skills/${id}.md`;
        idByKey.set(key, id);
        filesToWrite.push({ relativePath, content: skillSkeleton(typeName, statusName) });
        skills[id] = buildStatusSkillEntry(relativePath, statusName, statusColors);
      }
      statusSteps[statusName] = { skillId: id };
    }

    workflowSteps[typeName] = statusSteps;
  }

  return { skills, workflowSteps, filesToWrite };
}
