const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
const ORDER_BY = 'ORDER BY [System.ChangedDate] DESC';

export function buildSearchQuery(searchText: string): string {
  const trimmed = searchText.trim();

  if (!trimmed) {
    return `${BASE_QUERY} ${ORDER_BY}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${BASE_QUERY} AND [System.Id] = ${trimmed} ${ORDER_BY}`;
  }

  const escaped = trimmed.replace(/'/g, "''");
  return `${BASE_QUERY} AND [System.Title] CONTAINS '${escaped}' ${ORDER_BY}`;
}
