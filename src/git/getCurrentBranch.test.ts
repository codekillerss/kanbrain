import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCurrentBranch } from './getCurrentBranch';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-git-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('getCurrentBranch', () => {
  it('returns the current branch name for a git repository', () => {
    execFileSync('git', ['init', '-b', 'known-branch'], { cwd: workspaceRoot });

    return getCurrentBranch(workspaceRoot).then(branch => {
      expect(branch).toBe('known-branch');
    });
  });

  it('returns an empty string when the directory is not a git repository', () => {
    return getCurrentBranch(workspaceRoot).then(branch => {
      expect(branch).toBe('');
    });
  });
});
