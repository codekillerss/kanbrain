import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';
import { renderDiscoveredTypes, renderDiscoveredBoards } from './renderDiscoveredBoardInfo';

export function buildSkillsAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Skills Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## Scope

This file is scoped to **skills only** — don't touch \`.kanbrain/config.json\`'s \`repositories\` or \`profiles\` while following it.

## Step 0 — sync first

Run the **Kanbrain: Sync Board Configuration** command yourself before doing anything else, so the statuses/types below are guaranteed fresh. Skip this only if you already ran it moments before this file was generated.

## This project's real configuration

### Work item types and statuses

${renderDiscoveredTypes(types)}

### Boards and columns

${renderDiscoveredBoards(boards)}

## What to do

1. Kanbrain maps one skill per status, per work item type (\`.kanbrain/config.json\`'s \`skills\`) — never per board column. If multiple statuses share a board column, point them at the same skill file.
2. Propose a first draft of the real flow step for every status yourself: for each status, check which board column it's listed under above, and use that column's name when it reads as a clear step name. Group statuses that share a column under one skill file.
3. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries.
4. Once confirmed, update every entry's \`label\` in \`.kanbrain/config.json\`'s \`skills\` map to the agreed real step name.
5. Before writing each skill file's real instructions, think through a concrete **Definition of Done** for a card sitting in that status — what "finished with this step" actually looks like for that kind of work item. You don't need to write the DoD down anywhere structured; use it purely to decide what the skill file should ask the agent working that card to actually verify or do. Skill files can use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders.
6. Delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` entry pointing at it.
7. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
