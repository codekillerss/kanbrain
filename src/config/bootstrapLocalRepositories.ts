import * as fs from 'node:fs';
import { readConfig, getConfigLocalPath, writeLocalRepositories, DEFAULT_REPO_SCAN_DEPTH } from './config';
import { matchRepositoriesToLocalPaths } from './matchRepositoriesToLocalPaths';

export interface BootstrapLocalRepositoriesDeps {
  listAzureRepositories: (organization: string, project: string) => Promise<{ id: string; name: string }[]>;
  discoverLocalRepos: (workspaceRoot: string, maxDepth: number) => Promise<Map<string, string>>;
}

// Runs once per machine: teammates cloning an already-configured project have config.json
// (committed) but no config.local.json (gitignored, machine-specific repo paths). Nothing else
// generates it for them short of re-running the full interactive Setup wizard. Mirrors
// migrateLegacyLocalConfigIfNeeded's "automatic on activation" pattern instead. Skips writing
// when Azure DevOps returns zero repositories, since the client swallows request failures into
// an empty array - writing an empty file here would be indistinguishable from "no repos exist"
// and would stop this from retrying on the next activation.
export async function bootstrapLocalRepositoriesIfNeeded(
  workspaceRoot: string,
  deps: BootstrapLocalRepositoriesDeps,
): Promise<boolean> {
  if (fs.existsSync(getConfigLocalPath(workspaceRoot))) {
    return false;
  }
  const config = readConfig(workspaceRoot);
  if (!config) {
    return false;
  }
  const azureRepos = await deps.listAzureRepositories(config.organization, config.project);
  if (azureRepos.length === 0) {
    return false;
  }
  const repoScanDepth = Math.max(1, config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH);
  const localRepos = await deps.discoverLocalRepos(workspaceRoot, repoScanDepth);
  const repositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
  writeLocalRepositories(workspaceRoot, repositories);
  return true;
}
