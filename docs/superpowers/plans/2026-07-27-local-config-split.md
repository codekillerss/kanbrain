# Split machine-local state out of `config.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `repositories` and `showAssignedTo` out of the shared, committed `.kanbrain/config.json` into a new gitignored `.kanbrain/config.local.json`, so `config.json` is always safe to commit as-is.

**Architecture:** `KanbrainConfig` stays the same shape in memory. Only `src/config/config.ts` changes: `readConfig`/`readConfigWithDiagnostics` overlay `config.local.json` on top of `config.json` after migrations run; `writeConfig` splits the incoming `KanbrainConfig` into the two files. `setup.ts` and `syncBoardConfig.ts` get one added `ensureGitignoreEntry` call each. No other call site of `readConfig`/`writeConfig` changes.

**Tech Stack:** TypeScript, Vitest, Node `fs`/`path`.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-27-local-config-split-design.md` — read it before starting; this plan implements it exactly.
- Zero changes to any of the ~15 call sites of `readConfig`/`readConfigWithDiagnostics`/`writeConfig` outside of `src/config/config.ts`.
- Local file wins over `config.json` for `repositories`/`showAssignedTo` whenever `config.local.json` defines the key, even if `config.json` also has a (stale) value for it.
- Never create `config.local.json` when neither `repositories` nor `showAssignedTo` is set on the config being written.
- A malformed `config.local.json` must fall back silently to `config.json`'s value, never fail the whole read.
- `src/commands/setup.ts` and `src/commands/syncBoardConfig.ts` have no existing unit tests (same as every other file in `src/commands/`) — don't add a new test harness for them; verify their changes manually.

---

### Task 1: Split `repositories`/`showAssignedTo` into `config.local.json` in `src/config/config.ts`

**Files:**
- Modify: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Produces: `getConfigLocalPath(workspaceRoot: string): string` — new exported function, mirrors `getConfigPath`.
- `readConfig`, `readConfigWithDiagnostics`, `writeConfig` keep their existing exported signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/config/config.test.ts` (after the existing `readConfigWithDiagnostics` describe block, before the closing of the file):

```ts
import { getConfigLocalPath, getConfigPath, readConfig, writeConfig, ensureGitignoreEntry, readConfigWithDiagnostics } from './config';
// (this import line already exists — just add getConfigLocalPath to it)

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

  it('falls back to legacy inline values when config.local.json does not exist', () => {
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — `getConfigLocalPath` is not exported, and the split behavior doesn't exist yet (writes still put `repositories`/`showAssignedTo` into `config.json`).

- [ ] **Step 3: Implement the split in `src/config/config.ts`**

Replace the full file contents with:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, RepositoryPathEntry } from '../types';
import { runMigrations } from './migrations';

interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
}

export function getConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.json');
}

export function getConfigLocalPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.local.json');
}

function readLocalConfig(workspaceRoot: string): LocalConfig {
  const localPath = getConfigLocalPath(workspaceRoot);
  if (!fs.existsSync(localPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  } catch {
    return {};
  }
}

function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
  const local = readLocalConfig(workspaceRoot);
  const result = { ...config };
  if ('repositories' in local) {
    result.repositories = local.repositories;
  }
  if ('showAssignedTo' in local) {
    result.showAssignedTo = local.showAssignedTo;
  }
  return result;
}

export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    return applyLocalOverlay(runMigrations(JSON.parse(raw)), workspaceRoot);
  } catch {
    return null;
  }
}

export type ConfigReadResult = { status: 'ok'; config: KanbrainConfig } | { status: 'missing' } | { status: 'invalid'; error: string };

export function readConfigWithDiagnostics(workspaceRoot: string): ConfigReadResult {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return { status: 'missing' };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    const config = applyLocalOverlay(runMigrations(JSON.parse(raw)), workspaceRoot);
    return { status: 'ok', config };
  } catch (error) {
    return { status: 'invalid', error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeConfig(workspaceRoot: string, config: KanbrainConfig): void {
  const configPath = getConfigPath(workspaceRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const { repositories, showAssignedTo, ...shared } = config;
  fs.writeFileSync(configPath, `${JSON.stringify(shared, null, 2)}\n`, 'utf-8');

  const local: LocalConfig = {};
  if (repositories !== undefined) {
    local.repositories = repositories;
  }
  if (showAssignedTo !== undefined) {
    local.showAssignedTo = showAssignedTo;
  }
  if (Object.keys(local).length > 0) {
    fs.writeFileSync(getConfigLocalPath(workspaceRoot), `${JSON.stringify(local, null, 2)}\n`, 'utf-8');
  }
}

export function ensureGitignoreEntry(workspaceRoot: string, entry: string): void {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const lines = content.split(/\r?\n/);
  if (lines.includes(entry)) {
    return;
  }
  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gitignorePath, `${prefix}${entry}\n`, 'utf-8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS — all tests in the file, including the 6 new ones.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — in particular `src/config/syncConfig.test.ts` and `src/config/migrations.test.ts`, which don't touch `config.ts` directly but exercise the same `KanbrainConfig` type.

- [ ] **Step 6: Commit**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "feat: split repositories/showAssignedTo into gitignored config.local.json"
```

---

### Task 2: Gitignore `config.local.json` from `setup.ts` and `syncBoardConfig.ts`

**Files:**
- Modify: `src/commands/setup.ts:155`
- Modify: `src/commands/syncBoardConfig.ts` (after the existing bootstrap-backfill block, around line 52)

**Interfaces:**
- Consumes: `ensureGitignoreEntry(workspaceRoot: string, entry: string): void` from Task 1 (unchanged signature, already imported in both files).

- [ ] **Step 1: Add the entry in `setup.ts`**

In `src/commands/setup.ts`, change:

```ts
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    onSetupComplete();
```

to:

```ts
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');
    ensureGitignoreEntry(workspaceRoot, '.kanbrain/config.local.json');

    onSetupComplete();
```

- [ ] **Step 2: Add the same backfill in `syncBoardConfig.ts`**

In `src/commands/syncBoardConfig.ts`, change:

```ts
    const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
    if (!fs.existsSync(usageGuidePath)) {
      fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
    }

    const freshStatusColors = discoverStatusColors(types);
```

to:

```ts
    const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
    if (!fs.existsSync(usageGuidePath)) {
      fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
    }

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/config.local.json');

    const freshStatusColors = discoverStatusColors(types);
```

And add `ensureGitignoreEntry` to the existing import from `../config/config` at the top of the file:

```ts
import { readConfigWithDiagnostics, writeConfig, ensureGitignoreEntry } from '../config/config';
```

- [ ] **Step 3: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors (this catches the import/signature wiring; there's no unit test harness for these two command files).

- [ ] **Step 4: Manually verify**

In the Extension Development Host (`F5`), against a scratch workspace with a `.kanbrain/config.json`:
- Run `Kanbrain: Setup` on a fresh workspace → `.gitignore` gets both `.kanbrain/generated/` and `.kanbrain/config.local.json`.
- Delete the `.kanbrain/config.local.json` line from `.gitignore`, then run `Kanbrain: Sync Board Configuration` → the line reappears.

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts src/commands/syncBoardConfig.ts
git commit -m "feat: gitignore config.local.json from setup and sync"
```

---

### Task 3: Document `config.local.json` in the generated usage guide

**Files:**
- Modify: `src/skills/bootstrapContent.ts:67`

**Interfaces:**
- None — this only changes the `USAGE_GUIDE_CONTENT` string constant. No function signatures involved.

- [ ] **Step 1: Add the new bullet**

In `src/skills/bootstrapContent.ts`, change:

```ts
- \`.kanbrain/config.json\` — the shared config: organization/project, \`skills\`, \`globalSkills\`, colors, icons, team settings. Commit this.
- \`.kanbrain/skills/*.md\` — the skill files themselves. Commit these too.
- \`.kanbrain/generated/\` — context files Kanbrain writes each time a skill runs (gitignored, one-off/disposable).
```

to:

```ts
- \`.kanbrain/config.json\` — the shared config: organization/project, \`skills\`, \`globalSkills\`, colors, icons, team settings. Commit this.
- \`.kanbrain/config.local.json\` — per-machine repository paths and display preferences (gitignored, never commit this).
- \`.kanbrain/skills/*.md\` — the skill files themselves. Commit these too.
- \`.kanbrain/generated/\` — context files Kanbrain writes each time a skill runs (gitignored, one-off/disposable).
```

- [ ] **Step 2: Run the existing bootstrap content tests to confirm no regression**

Run: `npx vitest run src/skills/bootstrapContent.test.ts`
Expected: PASS — these tests don't assert on the literal `USAGE_GUIDE_CONTENT` string, only on `ensureExplainCardGlobalSkill`/`isBootstrapContentMissing` behavior, so they aren't affected by this change; this step just confirms that.

- [ ] **Step 3: Commit**

```bash
git add src/skills/bootstrapContent.ts
git commit -m "docs: mention config.local.json in the generated usage guide"
```
