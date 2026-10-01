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
  const positions = new Map<string, number>();
  // The server already matched the search results against the query, so they are never filtered
  // again here — only deduplicated against what the local list has already offered.
  for (const identity of [...local, ...searchResults]) {
    const key = identity.uniqueName.toLowerCase();
    if (!key) {
      continue;
    }
    const existing = positions.get(key);
    if (existing !== undefined) {
      // The signed-in user's profile carries no picture, so the duplicate that arrives later —
      // from the team, or from the search — is what gives them a face. Keep the first position.
      if (!merged[existing].imageUrl && identity.imageUrl) {
        merged[existing] = { ...merged[existing], imageUrl: identity.imageUrl };
      }
      continue;
    }
    positions.set(key, merged.length);
    merged.push(identity);
  }
  return merged;
}
