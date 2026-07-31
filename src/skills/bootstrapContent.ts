import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, SkillEntry, ProfileEntry } from '../types';
import { pickReadableTextColor } from '../view/badgeColor';

export const EXPLAIN_CARD_SKILL_ID = 'explain-card';
export const EXPLAIN_CARD_SKILL_RELATIVE_PATH = '.kanbrain/skills/explain-card.md';
const EXPLAIN_CARD_BUTTON_COLOR = 'b2b2b2';

export const EXPLAIN_CARD_SKILL_CONTENT = `# Skill: Explain Card

## Instructions
Explain this work item to the user in your own words: what it's asking for, why it likely matters given its type/description/parent (if any), and how far along it is based on its status and subtasks (if any). Keep it clear and concise — a short paragraph or a few bullet points, not a restatement of the raw fields above. This is an explanation only — don't take any action on the work item or the Azure DevOps board.
`;

export function buildExplainCardSkillEntry(): SkillEntry {
  return {
    path: EXPLAIN_CARD_SKILL_RELATIVE_PATH,
    label: 'Explain Card',
    buttonColor: EXPLAIN_CARD_BUTTON_COLOR,
    textColor: pickReadableTextColor(`#${EXPLAIN_CARD_BUTTON_COLOR}`).replace(/^#/, ''),
  };
}

export function ensureExplainCardGlobalSkill(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry> {
  if (existing?.[EXPLAIN_CARD_SKILL_ID]) {
    return existing;
  }
  return { ...(existing ?? {}), [EXPLAIN_CARD_SKILL_ID]: buildExplainCardSkillEntry() };
}

export const DEFAULT_PROFILES: Record<string, ProfileEntry> = {
  developer: {
    label: 'Developer',
    description:
      'I am a software developer. I focus on code quality, automated tests, and architecture. ' +
      'Prioritize clear technical instructions, with code context and implementation trade-offs.',
  },
  qa: {
    label: 'QA',
    description: 'I am responsible for quality and testing. Prioritize test scenarios, edge cases, and clear acceptance criteria.',
  },
  designer: {
    label: 'Designer',
    description:
      'I am a product/UX designer. I focus on usability, visual consistency, and user flows. ' +
      'Prioritize the user-facing impact of any change, and call out UX implications I should weigh in on.',
  },
  po: {
    label: 'Product Owner',
    description:
      'I am a Product Owner. I focus on business value, priorities, and acceptance criteria rather than implementation details. ' +
      'Prioritize plain-language explanations and trade-offs framed in terms of user/business impact.',
  },
};

export function ensureDefaultProfiles(existing: Record<string, ProfileEntry> | undefined): Record<string, ProfileEntry> {
  const merged = { ...(existing ?? {}) };
  for (const [id, entry] of Object.entries(DEFAULT_PROFILES)) {
    if (!(id in merged)) {
      merged[id] = entry;
    }
  }
  return merged;
}

export const USAGE_GUIDE_RELATIVE_PATH = '.kanbrain/USAGE.md';

export const USAGE_GUIDE_CONTENT = `# Kanbrain Usage Guide

This file is generated once by \`Kanbrain: Setup\` (and backfilled by \`Kanbrain: Sync Board Configuration\` if it's missing) and is meant to be read by anyone — human or AI agent — working in this workspace who wants to understand how Kanbrain is wired up here.

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item (and its children) in a VS Code side panel. Buttons on that panel generate a context file describing the work item and send a "read this file" command to an agent running in an integrated terminal — that agent is you, if you're reading a file Kanbrain generated.

There are two kinds of skill:

- **Status skills** — \`.kanbrain/config.json\`'s \`skills\` map links one skill file to each (work item type, status) pair. The button shown on the active work item's card always reflects that work item's current status.
- **Global skills** — \`.kanbrain/config.json\`'s \`globalSkills\` map holds skills that aren't tied to any status. They show up as a small "▾" menu next to the status skill button (or alone, if the current status has no skill mapped) — pick one to run it against the active work item regardless of its status. Useful for actions that make sense across the whole flow, like the auto-generated \`explain-card\` skill (explain the current work item in plain language), or a custom one like "estimate Effort for this Backlog item."

Every generated context file always starts with a card info block (work item id/title/type/status/description, parent, subtasks) ahead of the skill's own content — skill files don't need to restate any of that. Both kinds also resolve the same placeholders inside the skill file's own content, if you want to reference a specific field directly in your instructions: \`{{id}}\` \`{{title}}\` \`{{description}}\` \`{{status}}\` \`{{type}}\` \`{{url}}\` \`{{branch}}\` \`{{parent.id}}\` \`{{parent.title}}\` \`{{parent.description}}\` \`{{subtasks}}\`.

## Azure DevOps access

Kanbrain authenticates using the same Microsoft account session VS Code already has for this workspace. That means: if you're an agent reading this because a Kanbrain skill button sent you here, you're running in a workspace that already has real, live access to this project's Azure DevOps board — the active work item's real id, title, status, description, parent, and subtasks are already in the context file you were pointed to.

Because of that, feel free to suggest concrete actions on the board to the user when a skill's instructions call for it (e.g. "this looks done, want me to move it to Closed?", or "should I fill in the Effort field with X?"). Kanbrain itself stays strictly read-only — it never writes to Azure DevOps. Any actual change to the board has to go through your own tools/credentials (the Azure DevOps CLI, an MCP server, the REST API, or the web UI), with the user's confirmation — never by editing Kanbrain's own files.

## Where things live

- \`.kanbrain/config.json\` — the shared config: organization/project, \`skills\`, \`globalSkills\`, colors, icons, team settings. Commit this.
- \`.kanbrain/config.local.json\` — per-machine repository paths and display preferences (gitignored, never commit this).
- \`.kanbrain/skills/*.md\` — the skill files themselves. Commit these too.
- \`.kanbrain/generated/\` — context files Kanbrain writes each time a skill runs (gitignored, one-off/disposable).

Edit skills directly, or use the Config screen in the Kanbrain panel — both status skills and global skills have a path/label/color editor there.
`;

export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const explainCardEntryMissing = !config.globalSkills?.[EXPLAIN_CARD_SKILL_ID];
  const defaultProfilesMissing = Object.keys(DEFAULT_PROFILES).some(id => !config.profiles?.[id]);
  return usageGuideMissing || explainCardEntryMissing || defaultProfilesMissing;
}
