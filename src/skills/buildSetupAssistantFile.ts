import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function renderTypes(types: DiscoveredWorkItemType[]): string {
  return types
    .map(type => {
      const stateLines = type.states.map(state => `  - ${state.name} (${state.category})`).join('\n');
      return `### ${type.name}\n\n${stateLines}`;
    })
    .join('\n\n');
}

function renderBoards(boards: DiscoveredBoard[]): string {
  if (boards.length === 0) {
    return '_No boards were found for this team._';
  }
  return boards
    .map(board => {
      const columnsSection = board.columns
        .map(column => {
          const mappingLines = Object.entries(column.stateMappings)
            .map(([type, state]) => `  - ${type}: ${state}`)
            .join('\n');
          return `- **${column.name}** (${column.columnType})\n${mappingLines}`;
        })
        .join('\n');
      return `### ${board.name}\n\n${columnsSection}`;
    })
    .join('\n\n');
}

export function buildSetupAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Setup Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item in a VS Code side panel, with per-status "skill" buttons. Each button generates a context file — this file was generated the exact same way — and sends a "read this file" command to an agent running in an integrated terminal. That agent is you. \`.kanbrain/config.json\`'s \`skills\` map links each **status** (\`System.State\`), per work item type, to a skill file. The result we're aiming for is one skill for each real step of the team's flow — not necessarily one per raw status name.

## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) per work item type — \`skills\` maps exactly **one skill per status, per work item type**. There is no board-column mode to choose between; board columns aren't a real Kanbrain configuration option, they're listed below purely for your reference. Many teams still think and work in terms of **board columns** rather than raw statuses (common, and often the more natural mental model) — a column can group several statuses together, or have a name that doesn't match any status. When that's the case here, the way to honor it is to point every status that belongs to the same column at the *same* skill file — not to look for a column-level setting that doesn't exist.

## This project's real configuration

### Work item types and statuses

${renderTypes(types)}

### Boards and columns

${renderBoards(boards)}

## What to do

1. Read and understand the data above — the real statuses per work item type, and the real board columns each status maps into.
2. Explain to the user, in your own words, that Kanbrain maps one skill per status (never per board column) — and that if they think in board columns, multiple statuses sharing a column should simply share the same skill file.
3. Propose a first draft of the real flow step for every status yourself, before asking the user anything: for each status, check which board column it's listed under in the "Boards and columns" section above, and use that column's name directly when it already reads as a clear step name (e.g. a status listed under a "Code Review" column becomes "Code Review"; one under "QA" becomes "QA"). Group statuses that share a column under one skill file.
4. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries — don't make them name every status from scratch. Only fall back to asking open-ended for a status when no board column mapping exists for it, the column name is generic or unhelpful (e.g. "Column 1"), or different boards disagree on its column.
5. Once confirmed, update every entry's \`label\` in \`.kanbrain/config.json\`'s \`skills\` map to the agreed real step name — not the auto-generated \`"Execute {status} skill"\` placeholder Setup fills in by default.
6. For every skill file that stays in use, write real, useful instructions for that flow step into it — not a placeholder. Skill files can use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders, resolved with the real work item's data every time a skill button runs.
7. Once the final mapping is settled, delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` entry pointing at it — don't leave unused skill files behind.
8. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks for that, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
