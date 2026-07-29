import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { ProfileEntry } from '../types';
import { renderDiscoveredTypes } from './renderDiscoveredBoardInfo';

function renderExistingProfiles(profiles: Record<string, ProfileEntry>): string {
  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    return '_No profiles configured yet._';
  }
  return entries.map(([id, entry]) => `- **${entry.label}** (id: \`${id}\`): ${entry.description}`).join('\n');
}

export function buildProfilesAssistantContent(
  organization: string,
  project: string,
  team: string,
  types: DiscoveredWorkItemType[],
  profiles: Record<string, ProfileEntry>,
): string {
  return `# Kanbrain Profiles Assistant

Organization: \`${organization}\`
Project: \`${project}\`
Team: \`${team}\`

## Scope

This file is scoped to **profiles only** — don't touch \`.kanbrain/config.json\`'s \`skills\`, \`globalSkills\`, or \`repositories\` while following it.

## What a profile is

\`.kanbrain/config.json\`'s \`profiles\` map holds labeled personas (\`label\` + \`description\`). Whichever one is selected on the Home screen gets its \`description\` prepended to every skill-generated context file — it's how Kanbrain tells you (the agent) who's asking, e.g. "I am a QA, prioritize test scenarios."

## Already configured

${renderExistingProfiles(profiles)}

## This project's real work item types

${renderDiscoveredTypes(types)}

## What to do

1. Look at the real work item types above and the \`${team}\` team's board. Decide whether the existing profiles are enough or whether this team has a distinct role not covered by them (e.g. a dedicated work item type suggests a role that doesn't fit any current profile).
2. Propose any new profile or adjusted description to the user in one message, explain your reasoning, and ask them to confirm before writing anything.
3. Once confirmed, add or update entries in \`.kanbrain/config.json\`'s \`profiles\` map (\`label\` + \`description\` only) for whatever was agreed. Don't remove existing profiles unless the user explicitly asks.
`;
}
