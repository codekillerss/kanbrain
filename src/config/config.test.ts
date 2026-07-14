import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfigPath, readConfig, writeConfig, ensureGitignoreEntry } from './config';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-config-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('getConfigPath', () => {
  it('points at .kanbrain/config.json under the workspace root', () => {
    expect(getConfigPath(workspaceRoot)).toBe(path.join(workspaceRoot, '.kanbrain', 'config.json'));
  });
});

describe('readConfig', () => {
  it('returns null when no config file exists', () => {
    expect(readConfig(workspaceRoot)).toBeNull();
  });

  it('returns the parsed config when the file exists', () => {
    const config = { organization: 'my-org', project: 'MyProject', statusSkills: { New: 'skills/a.md' } };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
});

describe('writeConfig', () => {
  it('creates the .kanbrain directory if missing', () => {
    writeConfig(workspaceRoot, { organization: 'o', project: 'p', statusSkills: {} });
    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain'))).toBe(true);
  });
});

describe('ensureGitignoreEntry', () => {
  it('creates .gitignore with the entry when the file does not exist', () => {
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');
    const content = fs.readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(content.split(/\r?\n/)).toContain('.kanbrain/generated/');
  });

  it('appends the entry when .gitignore exists without it', () => {
    fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), 'node_modules/\n');
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');
    const content = fs.readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(content.split(/\r?\n/)).toEqual(['node_modules/', '.kanbrain/generated/', '']);
  });

  it('does not duplicate the entry when it already exists', () => {
    fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), '.kanbrain/generated/\n');
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');
    const content = fs.readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(content.match(/\.kanbrain\/generated\//g)?.length).toBe(1);
  });
});
