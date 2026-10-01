import type { IdentitySearchResult } from '../azureDevOps/client';

function matches(identity: IdentitySearchResult, query: string): boolean {
  if (!query) {
    return true;
  }
  return identity.displayName.toLowerCase().includes(query) || identity.uniqueName.toLowerCase().includes(query);
}

export function mergePickerIdentities(
  currentUser: IdentitySearchResult | null,
  teamMembers: IdentitySearchResult[],
  searchResults: IdentitySearchResult[],
  query: string,
): IdentitySearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const local = [...(currentUser ? [currentUser] : []), ...teamMembers].filter(i => matches(i, normalizedQuery));

  const merged: IdentitySearchResult[] = [];
  const seen = new Set<string>();
  // The server already matched the search results against the query, so they are never filtered
  // again here — only deduplicated against what the local list has already offered.
  for (const identity of [...local, ...searchResults]) {
    const key = identity.uniqueName.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(identity);
  }
  return merged;
}
