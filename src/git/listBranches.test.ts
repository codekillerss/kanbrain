import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listLocalBranches } from './listBranches';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-git-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('listLocalBranches', () => {
  it('returns all local branch names', async () => {
    execFileSync('git', ['init', '-b', 'main'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'initial commit'], { cwd: workspaceRoot });
    execFileSync('git', ['branch', 'feature/x'], { cwd: workspaceRoot });
    execFileSync('git', ['branch', 'feature/y'], { cwd: workspaceRoot });

    const branches = await listLocalBranches(workspaceRoot);

    expect(branches.sort()).toEqual(['feature/x', 'feature/y', 'main']);
  });

  it('returns an empty array when the directory is not a git repository', async () => {
    const branches = await listLocalBranches(workspaceRoot);

    expect(branches).toEqual([]);
  });
});
