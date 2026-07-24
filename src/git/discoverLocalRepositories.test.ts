import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverLocalRepositories } from './discoverLocalRepositories';

let workspaceRoot: string;

function initRepo(dir: string, remoteUrl: string): void {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: dir });
}

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-discover-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('discoverLocalRepositories', () => {
  it('finds a repository at the workspace root itself', async () => {
    initRepo(workspaceRoot, 'https://dev.azure.com/org/proj/_git/kanbrain');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('kanbrain')).toBe(workspaceRoot);
  });

  it('finds repositories in first-level subdirectories', async () => {
    const repoDir = path.join(workspaceRoot, 'other-repo');
    initRepo(repoDir, 'https://dev.azure.com/org/proj/_git/other-repo');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('other-repo')).toBe(repoDir);
  });

  it('ignores subdirectories that are not git repositories', async () => {
    fs.mkdirSync(path.join(workspaceRoot, 'not-a-repo'));

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.size).toBe(0);
  });

  it('ignores repositories nested two levels deep', async () => {
    const nestedDir = path.join(workspaceRoot, 'level1', 'level2');
    initRepo(nestedDir, 'https://dev.azure.com/org/proj/_git/nested');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.has('nested')).toBe(false);
  });

  it('matches repo names case-insensitively via lowercased keys', async () => {
    initRepo(workspaceRoot, 'https://dev.azure.com/org/proj/_git/KanBrain');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('kanbrain')).toBe(workspaceRoot);
  });
});
