import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfigLocalPath, writeConfig } from './config';
import { bootstrapLocalRepositoriesIfNeeded } from './bootstrapLocalRepositories';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-bootstrap-repos-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

const baseConfig = {
  organization: 'my-org',
  project: 'MyProject',
  defaultTeam: 'MyProject Team',
  skills: {},
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('bootstrapLocalRepositoriesIfNeeded', () => {
  it('returns false and makes no calls when config.local.json already exists', async () => {
    writeConfig(workspaceRoot, { ...baseConfig, showAssignedTo: true });
    const listAzureRepositories = vi.fn();
    const discoverLocalRepos = vi.fn();

    const result = await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, { listAzureRepositories, discoverLocalRepos });

    expect(result).toBe(false);
    expect(listAzureRepositories).not.toHaveBeenCalled();
    expect(discoverLocalRepos).not.toHaveBeenCalled();
  });

  it('returns false when there is no config.json', async () => {
    const listAzureRepositories = vi.fn();
    const discoverLocalRepos = vi.fn();

    const result = await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, { listAzureRepositories, discoverLocalRepos });

    expect(result).toBe(false);
    expect(listAzureRepositories).not.toHaveBeenCalled();
  });

  it('discovers, matches, and writes config.local.json when config.json exists but config.local.json does not', async () => {
    writeConfig(workspaceRoot, baseConfig);
    const listAzureRepositories = vi.fn().mockResolvedValue([{ id: 'repo-1', name: 'Kanbrain' }]);
    const discoverLocalRepos = vi.fn().mockResolvedValue(new Map([['kanbrain', 'C:\\repos\\kanbrain']]));

    const result = await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, { listAzureRepositories, discoverLocalRepos });

    expect(result).toBe(true);
    expect(listAzureRepositories).toHaveBeenCalledWith('my-org', 'MyProject');
    const localRaw = JSON.parse(fs.readFileSync(getConfigLocalPath(workspaceRoot), 'utf-8'));
    expect(localRaw).toEqual({ repositories: { 'repo-1': { name: 'Kanbrain', path: 'C:\\repos\\kanbrain' } } });
  });

  it('returns false and does not write config.local.json when Azure DevOps returns no repositories', async () => {
    writeConfig(workspaceRoot, baseConfig);
    const listAzureRepositories = vi.fn().mockResolvedValue([]);
    const discoverLocalRepos = vi.fn().mockResolvedValue(new Map());

    const result = await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, { listAzureRepositories, discoverLocalRepos });

    expect(result).toBe(false);
    expect(fs.existsSync(getConfigLocalPath(workspaceRoot))).toBe(false);
  });

  it('passes the configured repoScanDepth to discoverLocalRepos, defaulting when unset', async () => {
    writeConfig(workspaceRoot, { ...baseConfig, repoScanDepth: 4 });
    const listAzureRepositories = vi.fn().mockResolvedValue([{ id: 'repo-1', name: 'Kanbrain' }]);
    const discoverLocalRepos = vi.fn().mockResolvedValue(new Map());

    await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, { listAzureRepositories, discoverLocalRepos });

    expect(discoverLocalRepos).toHaveBeenCalledWith(workspaceRoot, 4);
  });
});
