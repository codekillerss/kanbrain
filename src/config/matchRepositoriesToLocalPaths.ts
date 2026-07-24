import type { RepositoryPathEntry } from '../types';

export function matchRepositoriesToLocalPaths(
  azureRepos: { id: string; name: string }[],
  localRepos: Map<string, string>,
): Record<string, RepositoryPathEntry> {
  const result: Record<string, RepositoryPathEntry> = {};
  for (const repo of azureRepos) {
    result[repo.id] = { name: repo.name, path: localRepos.get(repo.name.toLowerCase()) ?? '' };
  }
  return result;
}
