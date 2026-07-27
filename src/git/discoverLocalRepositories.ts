import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRemoteUrl } from './getRemoteUrl';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

export async function discoverLocalRepositories(workspaceRoot: string, maxDepth: number = 1): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const remoteUrl = await getRemoteUrl(dir);
      const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
      if (repoName && !result.has(repoName.toLowerCase())) {
        result.set(repoName.toLowerCase(), dir);
      }
      return;
    }
    if (depth >= maxDepth) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '.git') {
        await walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  await walk(workspaceRoot, 0);
  return result;
}
