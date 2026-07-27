import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getConfigLocalPath,
  getConfigPath,
  migrateLegacyLocalConfigIfNeeded,
  readConfig,
  writeConfig,
  ensureGitignoreEntry,
  readConfigWithDiagnostics,
} from './config';

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
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      defaultTeam: 'MyProject Team',
      skills: { Task: { New: { path: '.kanbrain/skills/a.md' } } },
      statusColors: { New: 'b2b2b2' },
      typeColors: { Task: 'f2cb1d' },
      typeIcons: { Task: '<svg></svg>' },
    };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });

  it('returns null when the config file is malformed JSON', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), '{ not valid json', 'utf-8');
    expect(readConfig(workspaceRoot)).toBeNull();
  });

  it('migrates a legacy backlogLevels/typeToBacklogLevel config.json into the new skills shape', () => {
    const legacy = {
      organization: 'my-org',
      project: 'MyProject',
      typeToBacklogLevel: { Task: 'Tasks' },
      backlogLevels: { Tasks: { New: { path: '.kanbrain/skills/a.md' } } },
      statusColors: { New: 'b2b2b2' },
      typeColors: { Task: 'f2cb1d' },
      typeIcons: { Task: '<svg></svg>' },
    };
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), JSON.stringify(legacy), 'utf-8');

    const config = readConfig(workspaceRoot);

    expect(config?.skills).toEqual({ Task: { New: { path: '.kanbrain/skills/a.md' } } });
    expect(config?.defaultTeam).toBe('');
  });
});

describe('writeConfig', () => {
  it('creates the .kanbrain directory if missing', () => {
    writeConfig(workspaceRoot, {
      organization: 'o',
      project: 'p',
      defaultTeam: '',
      skills: {},
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    });
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

describe('readConfigWithDiagnostics', () => {
  it('returns status "missing" when no config file exists', () => {
    expect(readConfigWithDiagnostics(workspaceRoot)).toEqual({ status: 'missing' });
  });

  it('returns status "ok" with the parsed config when the file is valid', () => {
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      defaultTeam: '',
      skills: {},
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    };
    writeConfig(workspaceRoot, config);
    expect(readConfigWithDiagnostics(workspaceRoot)).toEqual({ status: 'ok', config });
  });

  it('returns status "invalid" with the parse error message when the file is malformed JSON', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), '{ not valid json', 'utf-8');
    const result = readConfigWithDiagnostics(workspaceRoot);
    expect(result.status).toBe('invalid');
    expect((result as { status: 'invalid'; error: string }).error.length).toBeGreaterThan(0);
  });
});

describe('machine-local config split', () => {
  const baseConfig = {
    organization: 'my-org',
    project: 'MyProject',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
  };

  it('writes repositories/showAssignedTo to config.local.json, not config.json', () => {
    writeConfig(workspaceRoot, {
      ...baseConfig,
      repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } },
      showAssignedTo: false,
    });

    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.repositories).toBeUndefined();
    expect(sharedRaw.showAssignedTo).toBeUndefined();

    const localRaw = JSON.parse(fs.readFileSync(getConfigLocalPath(workspaceRoot), 'utf-8'));
    expect(localRaw).toEqual({
      repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } },
      showAssignedTo: false,
    });
  });

  it('round-trips repositories/showAssignedTo through readConfig', () => {
    const config = {
      ...baseConfig,
      repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } },
      showAssignedTo: false,
    };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });

  it('does not create config.local.json when repositories and showAssignedTo are both absent', () => {
    writeConfig(workspaceRoot, baseConfig);
    expect(fs.existsSync(getConfigLocalPath(workspaceRoot))).toBe(false);
    expect(readConfig(workspaceRoot)).toEqual(baseConfig);
  });

  it('returns legacy inline values when config.local.json does not exist yet', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(
      getConfigPath(workspaceRoot),
      JSON.stringify({
        ...baseConfig,
        repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } },
        showAssignedTo: true,
      }),
      'utf-8',
    );

    const config = readConfig(workspaceRoot);
    expect(config?.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } });
    expect(config?.showAssignedTo).toBe(true);
  });

  it('prefers config.local.json over a stale value still inline in config.json', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), JSON.stringify({ ...baseConfig, showAssignedTo: true }), 'utf-8');
    fs.writeFileSync(getConfigLocalPath(workspaceRoot), JSON.stringify({ showAssignedTo: false }), 'utf-8');

    expect(readConfig(workspaceRoot)?.showAssignedTo).toBe(false);
  });

  it('falls back to config.json when config.local.json is malformed JSON', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), JSON.stringify({ ...baseConfig, showAssignedTo: true }), 'utf-8');
    fs.writeFileSync(getConfigLocalPath(workspaceRoot), '{ not valid json', 'utf-8');

    expect(readConfig(workspaceRoot)?.showAssignedTo).toBe(true);
  });
});

describe('migrateLegacyLocalConfigIfNeeded', () => {
  const baseConfig = {
    organization: 'my-org',
    project: 'MyProject',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
  };

  it('migrates legacy inline values into config.local.json, strips config.json, and returns true', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(
      getConfigPath(workspaceRoot),
      JSON.stringify({
        ...baseConfig,
        repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } },
        showAssignedTo: true,
      }),
      'utf-8',
    );

    const migrated = migrateLegacyLocalConfigIfNeeded(workspaceRoot);

    expect(migrated).toBe(true);
    const localRaw = JSON.parse(fs.readFileSync(getConfigLocalPath(workspaceRoot), 'utf-8'));
    expect(localRaw).toEqual({
      repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } },
      showAssignedTo: true,
    });

    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.repositories).toBeUndefined();
    expect(sharedRaw.showAssignedTo).toBeUndefined();
    expect(sharedRaw.organization).toBe('my-org');

    const gitignore = fs.readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(gitignore.split(/\r?\n/)).toContain('.kanbrain/config.local.json');

    const config = readConfig(workspaceRoot);
    expect(config?.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } });
    expect(config?.showAssignedTo).toBe(true);
  });

  it('returns false and changes nothing once config.local.json already exists', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(
      getConfigPath(workspaceRoot),
      JSON.stringify({
        ...baseConfig,
        repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } },
        showAssignedTo: true,
      }),
      'utf-8',
    );
    fs.mkdirSync(path.dirname(getConfigLocalPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigLocalPath(workspaceRoot), JSON.stringify({ showAssignedTo: false }), 'utf-8');

    const migrated = migrateLegacyLocalConfigIfNeeded(workspaceRoot);

    expect(migrated).toBe(false);
    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: 'D:\\legacy\\path' } });
  });

  it('returns false when config.json has neither repositories nor showAssignedTo', () => {
    writeConfig(workspaceRoot, baseConfig);
    expect(migrateLegacyLocalConfigIfNeeded(workspaceRoot)).toBe(false);
    expect(fs.existsSync(getConfigLocalPath(workspaceRoot))).toBe(false);
  });

  it('returns false when there is no config.json at all', () => {
    expect(migrateLegacyLocalConfigIfNeeded(workspaceRoot)).toBe(false);
  });
});
