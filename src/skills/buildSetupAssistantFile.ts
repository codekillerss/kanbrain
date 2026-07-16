import type { BoardState } from '../azureDevOps/discoverBoardState';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function renderLevels(discovered: BoardState): string {
  return discovered.levels
    .map(level => {
      const typesSection = level.workItemTypes
        .map(type => {
          const states = discovered.statesByType[type] ?? [];
          const stateLines = states.map(state => `  - ${state.name} (${state.category})`).join('\n');
          return `- **${type}**\n${stateLines}`;
        })
        .join('\n');
      return `### ${level.name}\n\n${typesSection}`;
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
  discovered: BoardState,
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Setup Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item in a VS Code side panel, with per-status "skill" buttons. Each button generates a context file — this file was generated the exact same way — and sends a "read this file" command to an agent running in an integrated terminal. That agent is you. \`.kanbrain/config.json\`'s \`backlogLevels\` map links each **status** (\`System.State\`) to a skill file. The result we're aiming for is one skill for each real step of the team's flow — not necessarily one per raw status name.

## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) — it has no board-column API access at all. Many teams, though, think and work in terms of **board columns**, not raw statuses, and that's common and often the more natural mental model. A board column can group several statuses together, or have a name that doesn't match any status. Before configuring anything, read both the status list and the board column list below, explain this difference to the user in your own words, and ask them how they want Kanbrain to behave: one skill per status, or one skill shared across every status a column groups together.

## This project's real configuration

### Backlog levels, types, and statuses

${renderLevels(discovered)}

### Boards and columns

${renderBoards(boards)}

## What to do

1. Read and understand the data above.
2. Explain the status-vs-column difference to the user, using this project's real levels/types/statuses/boards/columns as examples.
3. Ask the user how they want Kanbrain to work: one skill per status, or one skill per board column (shared across every status that column maps to).
4. Based on their answer, edit \`.kanbrain/config.json\`'s \`backlogLevels\` map and the skill files under \`.kanbrain/skills/\` directly — they're regular workspace files, edit them the same way the user would by hand. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks for that, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
