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

1. Kanbrain keeps skills in two places: a flat registry (\`.kanbrain/config.json\`'s \`skills\`, one entry per skill file with its own \`label\`/colors) and a per-(work item type, status) map (\`workflowSteps\`) that points each status at a \`skillId\` from that registry — never per board column. If multiple statuses share a board column, point their \`workflowSteps\` entries at the same \`skillId\` rather than creating duplicate registry entries. A registry entry that genuinely spans the whole flow rather than one status (e.g. "explain this card", "estimate Effort") should be created with \`isGlobal: true\` instead of being wired into \`workflowSteps\` — it then shows in the "▾" menu on every card regardless of status. Only ask the user for these if there's a clear signal one would help; don't invent them speculatively.
2. Propose a first draft of the real flow step for every status yourself: for each status, check which board column it's listed under above, and use that column's name when it reads as a clear step name. Group statuses that share a column under one skill.
3. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries.
4. Once confirmed, update each skill's \`label\` in \`.kanbrain/config.json\`'s \`skills\` registry to the agreed real step name — a skill shared by several statuses only needs its label set once.
5. Before writing each skill file's real instructions, think through a concrete **Definition of Done** for a card sitting in that status — what "finished with this step" actually looks like for that kind of work item. You can write that DoD (and any expected artifacts) directly into the matching \`workflowSteps\` entry's \`definitionOfDone\`/\`artifacts\` arrays, and also use it to decide what the skill file itself should ask the agent working that card to actually verify or do. Every generated context file already starts with a card info block (id, title, type, status, description, parent, subtasks), so skill files don't need to restate that — just write the instructions. If an instruction needs to reference a specific field inline, skill files can still use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders.
6. Delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` registry entry pointing at it.
7. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks, and only using your own tools/credentials. The one thing Kanbrain writes on its own is the work item's status, when the user changes it from a Flow card; everything else is still yours to do.
`;
}
