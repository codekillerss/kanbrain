import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRemoteUrl } from './getRemoteUrl';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

export async function discoverLocalRepositories(workspaceRoot: string): Promise<Map<string, string>> {
  const candidates = [workspaceRoot];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(path.join(workspaceRoot, entry.name));
    }
  }

  const result = new Map<string, string>();
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, '.git'))) {
      continue;
    }
    const remoteUrl = await getRemoteUrl(candidate);
    const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
    if (repoName && !result.has(repoName.toLowerCase())) {
      result.set(repoName.toLowerCase(), candidate);
    }
  }
  return result;
}
