import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfigPath, readConfig, writeConfig, ensureGitignoreEntry, readConfigWithDiagnostics } from './config';

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
