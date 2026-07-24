import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cloneRepository } from './cloneRepository';

let sourceRepo: string;
let parentDir: string;

beforeEach(() => {
  sourceRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-clone-source-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: sourceRepo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: sourceRepo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: sourceRepo });
  fs.writeFileSync(path.join(sourceRepo, 'file.txt'), 'hello', 'utf-8');
  execFileSync('git', ['add', 'file.txt'], { cwd: sourceRepo });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: sourceRepo });

  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-clone-parent-'));
});

afterEach(() => {
  fs.rmSync(sourceRepo, { recursive: true, force: true });
  fs.rmSync(parentDir, { recursive: true, force: true });
});

describe('cloneRepository', () => {
  it('clones the repository into a subfolder named after it, returning that path', async () => {
    const result = await cloneRepository(parentDir, sourceRepo, 'my-repo');

    expect(result).toBe(path.join(parentDir, 'my-repo'));
    expect(fs.existsSync(path.join(result, '.git'))).toBe(true);
    expect(fs.readFileSync(path.join(result, 'file.txt'), 'utf-8')).toBe('hello');
  });

  it('rejects when the clone URL is invalid', async () => {
    await expect(cloneRepository(parentDir, path.join(parentDir, 'does-not-exist'), 'my-repo')).rejects.toThrow();
  });
});
