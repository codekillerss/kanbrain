import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

export function renderDiscoveredTypes(types: DiscoveredWorkItemType[]): string {
  return types
    .map(type => {
      const stateLines = type.states.map(state => `  - ${state.name} (${state.category})`).join('\n');
      return `### ${type.name}\n\n${stateLines}`;
    })
    .join('\n\n');
}

export function renderDiscoveredBoards(boards: DiscoveredBoard[]): string {
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
