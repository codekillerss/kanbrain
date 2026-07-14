# Kanbrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Kanbrain, a standalone VS Code extension that shows the active Azure DevOps work item (and its subtasks) in a webview panel, with per-status "skill" buttons that write a resolved markdown context file and send a read command to an integrated terminal.

**Architecture:** A thin extension-host layer (auth, Azure DevOps REST client, webview provider, commands) wraps a set of pure, dependency-free modules (config I/O, WIQL building, work-item mapping, placeholder resolution, HTML rendering) that carry all the unit-testable logic. Pure modules never import `vscode`; anything that needs the VS Code API lives in a thin wrapper file that composes the pure modules.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode` ^1.85 engine), Node's built-in `fetch`/`fs`/`child_process`, Vitest for unit tests, `@vscode/test-electron` + Mocha for the one integration smoke test.

## Global Constraints

- No UI framework beyond vanilla HTML/CSS/JS inside the webview — matches the source pattern in mix-battle's backoffice.
- The webview never calls the Azure DevOps API directly; all network calls happen in the extension host and are pushed to the webview via `postMessage`/HTML re-render.
- Azure AD auth goes through `vscode.authentication.getSession('microsoft', ...)` only — never shell out to `az` CLI.
- Azure DevOps resource scope for token acquisition: `499b84ac-1321-427f-aa17-267ca6975798/.default`.
- `.kanbrain/config.json` is versioned (committed) — it is shared team config, not personal state.
- The active work item ID is stored in `context.workspaceState` — per-machine, never versioned.
- `.kanbrain/generated/` (skill output files) must be added to `.gitignore` automatically — it's transient, per-invocation output.
- Pure logic modules (config, wiql, mapWorkItem, resolvePlaceholders, generateContextFile, render, hasStateChanged, buildReadCommand) must not import `vscode`, so they can run under Vitest without the extension host.

---

## File Structure

```
kanbrain/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  media/
    icon.svg
  src/
    types.ts
    extension.ts
    config/
      config.ts
      config.test.ts
    azureDevOps/
      wiql.ts
      wiql.test.ts
      mapWorkItem.ts
      mapWorkItem.test.ts
      client.ts
      client.test.ts
    auth/
      ensureAzureSession.ts
      ensureAzureSession.test.ts
      vscodeSession.ts
    skills/
      resolvePlaceholders.ts
      resolvePlaceholders.test.ts
      generateContextFile.ts
      generateContextFile.test.ts
    git/
      getCurrentBranch.ts
      getCurrentBranch.test.ts
    terminal/
      buildReadCommand.ts
      buildReadCommand.test.ts
      kanbrainTerminal.ts
    view/
      render.ts
      render.test.ts
      hasStateChanged.ts
      hasStateChanged.test.ts
      KanbrainViewProvider.ts
    commands/
      setup.ts
      selectWorkItem.ts
  test/
    runTest.ts
    suite/
      index.ts
      extension.test.ts
  README.md
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/types.ts`
- Create: `src/extension.ts`

**Interfaces:**
- Produces: `WorkItem` and `KanbrainConfig` types from `src/types.ts`, consumed by every later task.
- Produces: `activate`/`deactivate` exports from `src/extension.ts`, replaced with real wiring in Task 15.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kanbrain",
  "displayName": "Kanbrain",
  "description": "Azure DevOps work item flow panel for VS Code",
  "version": "0.1.0",
  "publisher": "kanbrain",
  "engines": {
    "vscode": "^1.85.0",
    "node": ">=18"
  },
  "categories": ["Other"],
  "main": "./out/src/extension.js",
  "activationEvents": [],
  "contributes": {
    "commands": []
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "vscode:prepublish": "npm run compile",
    "pretest": "npm run compile",
    "test:unit": "vitest run",
    "test:integration": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/test-electron": "^2.3.9",
    "glob": "^10.3.10",
    "mocha": "^10.3.0",
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "node_modules", "out", ".vscode-test"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'test/**'],
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
out/
.vscode-test/
*.vsix
.kanbrain/generated/
```

- [ ] **Step 5: Create `src/types.ts`**

```ts
export interface WorkItem {
  id: number;
  title: string;
  description: string;
  status: string;
  type: string;
  url: string;
  parentId: number | null;
  childIds: number[];
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  statusSkills: Record<string, string | null>;
}
```

- [ ] **Step 6: Create `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  // Wired up fully in a later task.
}

export function deactivate(): void {}
```

- [ ] **Step 7: Install dependencies and verify the scaffold compiles**

```bash
npm install
npm run compile
```

Expected: no errors printed, exit code 0, `out/src/extension.js` exists.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/types.ts src/extension.ts
git commit -m "chore: project scaffold"
```

---

### Task 2: Config module

**Files:**
- Create: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig` from `src/types.ts` (Task 1).
- Produces: `getConfigPath(workspaceRoot)`, `readConfig(workspaceRoot)`, `writeConfig(workspaceRoot, config)`, `ensureGitignoreEntry(workspaceRoot, entry)` — consumed by `commands/setup.ts`, `commands/selectWorkItem.ts`, and `view/KanbrainViewProvider.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/config/config.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — `Cannot find module './config'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/config/config.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig } from '../types';

export function getConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.json');
}

export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as KanbrainConfig;
}

export function writeConfig(workspaceRoot: string, config: KanbrainConfig): void {
  const configPath = getConfigPath(workspaceRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "feat: config module for .kanbrain/config.json"
```

---

### Task 3: WIQL query builder

**Files:**
- Create: `src/azureDevOps/wiql.ts`
- Test: `src/azureDevOps/wiql.test.ts`

**Interfaces:**
- Produces: `buildSearchQuery(searchText: string): string` — consumed by `src/azureDevOps/client.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// src/azureDevOps/wiql.test.ts
import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from './wiql';

describe('buildSearchQuery', () => {
  it('returns a title-ordered query with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by exact ID when the search text is numeric', () => {
    const query = buildSearchQuery('482');
    expect(query).toContain('[System.Id] = 482');
  });

  it('filters by title CONTAINS when the search text is not numeric', () => {
    const query = buildSearchQuery('login bug');
    expect(query).toContain("[System.Title] CONTAINS 'login bug'");
  });

  it('escapes single quotes in the search text', () => {
    const query = buildSearchQuery("user's login");
    expect(query).toContain("CONTAINS 'user''s login'");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: FAIL — `Cannot find module './wiql'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/azureDevOps/wiql.ts
const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
const ORDER_BY = 'ORDER BY [System.ChangedDate] DESC';

export function buildSearchQuery(searchText: string): string {
  const trimmed = searchText.trim();

  if (!trimmed) {
    return `${BASE_QUERY} ${ORDER_BY}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${BASE_QUERY} AND [System.Id] = ${trimmed} ${ORDER_BY}`;
  }

  const escaped = trimmed.replace(/'/g, "''");
  return `${BASE_QUERY} AND [System.Title] CONTAINS '${escaped}' ${ORDER_BY}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/wiql.ts src/azureDevOps/wiql.test.ts
git commit -m "feat: WIQL search query builder"
```

---

### Task 4: Work item mapping

**Files:**
- Create: `src/azureDevOps/mapWorkItem.ts`
- Test: `src/azureDevOps/mapWorkItem.test.ts`

**Interfaces:**
- Consumes: `WorkItem` from `src/types.ts` (Task 1).
- Produces: `mapWorkItem(raw, organization, project): WorkItem`, `RawWorkItem` type — consumed by `src/azureDevOps/client.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// src/azureDevOps/mapWorkItem.test.ts
import { describe, it, expect } from 'vitest';
import { mapWorkItem, type RawWorkItem } from './mapWorkItem';

function raw(overrides: Partial<RawWorkItem> = {}): RawWorkItem {
  return {
    id: 482,
    fields: {
      'System.Title': 'Corrigir bug no login',
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.Description': '<div>Descrição <b>com</b> html&nbsp;aqui</div>',
    },
    relations: [],
    ...overrides,
  };
}

describe('mapWorkItem', () => {
  it('maps basic fields', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.id).toBe(482);
    expect(item.title).toBe('Corrigir bug no login');
    expect(item.status).toBe('Active');
    expect(item.type).toBe('Task');
  });

  it('strips HTML from the description', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.description).toBe('Descrição com html aqui');
  });

  it('builds the work item URL from organization and project', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.url).toBe('https://dev.azure.com/my-org/MyProject/_workitems/edit/482');
  });

  it('has no parentId when there is no Hierarchy-Reverse relation', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.parentId).toBeNull();
  });

  it('extracts parentId from a Hierarchy-Reverse relation', () => {
    const item = mapWorkItem(
      raw({ relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/90' }] }),
      'my-org',
      'MyProject',
    );
    expect(item.parentId).toBe(90);
  });

  it('extracts childIds from Hierarchy-Forward relations', () => {
    const item = mapWorkItem(
      raw({
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/101' },
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/102' },
          { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/999' },
        ],
      }),
      'my-org',
      'MyProject',
    );
    expect(item.childIds).toEqual([101, 102]);
  });

  it('defaults missing fields to empty strings', () => {
    const item = mapWorkItem(raw({ fields: {} }), 'my-org', 'MyProject');
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.status).toBe('');
    expect(item.type).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/mapWorkItem.test.ts`
Expected: FAIL — `Cannot find module './mapWorkItem'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/azureDevOps/mapWorkItem.ts
import type { WorkItem } from '../types';

export interface RawRelation {
  rel: string;
  url: string;
}

export interface RawWorkItem {
  id: number;
  fields: Record<string, unknown>;
  relations?: RawRelation[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdFromUrl(url: string): number {
  const match = url.match(/\/(\d+)$/);
  if (!match) {
    throw new Error(`Não foi possível extrair o ID do work item da URL: ${url}`);
  }
  return Number(match[1]);
}

export function mapWorkItem(raw: RawWorkItem, organization: string, project: string): WorkItem {
  const relations = raw.relations ?? [];
  const parentRelation = relations.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  const childRelations = relations.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward');

  return {
    id: raw.id,
    title: String(raw.fields['System.Title'] ?? ''),
    description: stripHtml(String(raw.fields['System.Description'] ?? '')),
    status: String(raw.fields['System.State'] ?? ''),
    type: String(raw.fields['System.WorkItemType'] ?? ''),
    url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${raw.id}`,
    parentId: parentRelation ? extractIdFromUrl(parentRelation.url) : null,
    childIds: childRelations.map(r => extractIdFromUrl(r.url)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/mapWorkItem.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/mapWorkItem.ts src/azureDevOps/mapWorkItem.test.ts
git commit -m "feat: map raw Azure DevOps work items to WorkItem"
```

---

### Task 5: Azure DevOps REST client

**Files:**
- Create: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `buildSearchQuery` (Task 3), `mapWorkItem`, `RawWorkItem` (Task 4), `WorkItem` (Task 1).
- Produces: `AzureDevOpsClient` class with `listOrganizations()`, `listProjects(organization)`, `searchWorkItems(organization, project, searchText)`, `getWorkItems(organization, project, ids)`, `getChildren(organization, project, workItem)`; `AzureDevOpsClientDeps` type — consumed by `extension.ts`, `commands/setup.ts`, `commands/selectWorkItem.ts`, `view/KanbrainViewProvider.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/azureDevOps/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AzureDevOpsClient } from './client';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

describe('AzureDevOpsClient', () => {
  it('lists organizations for the current user', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1' }))
      .mockResolvedValueOnce(jsonResponse({ value: [{ accountId: 'a1', accountName: 'my-org' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const orgs = await client.listOrganizations();

    expect(orgs).toEqual([{ id: 'a1', name: 'my-org' }]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://app.vssps.visualstudio.com/_apis/accounts?memberId=user-1&api-version=7.1',
      expect.anything(),
    );
  });

  it('lists projects for an organization', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ value: [{ id: 'p1', name: 'MyProject' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const projects = await client.listProjects('my-org');

    expect(projects).toEqual([{ id: 'p1', name: 'MyProject' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects?api-version=7.1',
      expect.anything(),
    );
  });

  it('searches work items and returns matched IDs', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 1 }, { id: 2 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const ids = await client.searchWorkItems('my-org', 'MyProject', 'login');

    expect(ids).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns an empty array from getWorkItems without calling fetch when ids is empty', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', []);

    expect(items).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches and maps work items by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 482, fields: { 'System.Title': 'Bug', 'System.State': 'Active', 'System.WorkItemType': 'Task' }, relations: [] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', [482]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(482);
    expect(items[0].title).toBe('Bug');
  });

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await expect(client.listProjects('my-org')).rejects.toThrow(/401/);
  });

  it('getChildren fetches work items for a parent childIds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: 101, fields: { 'System.Title': 'Sub', 'System.State': 'New', 'System.WorkItemType': 'Task' }, relations: [] }],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101] };

    const children = await client.getChildren('my-org', 'MyProject', parent);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(101);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/azureDevOps/client.ts
import type { WorkItem } from '../types';
import { buildSearchQuery } from './wiql';
import { mapWorkItem } from './mapWorkItem';

export interface AzureDevOpsClientDeps {
  fetchImpl: typeof fetch;
  getToken: () => Promise<string>;
}

export interface AzureDevOpsOrg {
  id: string;
  name: string;
}

export interface AzureDevOpsProject {
  id: string;
  name: string;
}

export class AzureDevOpsClient {
  constructor(private readonly deps: AzureDevOpsClientDeps) {}

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const token = await this.deps.getToken();
    const response = await this.deps.fetchImpl(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Azure DevOps request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async listOrganizations(): Promise<AzureDevOpsOrg[]> {
    const profile = await this.request<{ id: string }>(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
    );
    const accounts = await this.request<{ value: { accountId: string; accountName: string }[] }>(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1`,
    );
    return accounts.value.map(a => ({ id: a.accountId, name: a.accountName }));
  }

  async listProjects(organization: string): Promise<AzureDevOpsProject[]> {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`,
    );
    return data.value.map(p => ({ id: p.id, name: p.name }));
  }

  async searchWorkItems(organization: string, project: string, searchText: string): Promise<number[]> {
    const query = buildSearchQuery(searchText);
    const data = await this.request<{ workItems: { id: number }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return data.workItems.map(w => w.id);
  }

  async getWorkItems(organization: string, project: string, ids: number[]): Promise<WorkItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const data = await this.request<{ value: Parameters<typeof mapWorkItem>[0][] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.1`,
    );
    return data.value.map(raw => mapWorkItem(raw, organization, project));
  }

  async getChildren(organization: string, project: string, workItem: WorkItem): Promise<WorkItem[]> {
    return this.getWorkItems(organization, project, workItem.childIds);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: Azure DevOps REST client"
```

---

### Task 6: Auth module

**Files:**
- Create: `src/auth/ensureAzureSession.ts`
- Test: `src/auth/ensureAzureSession.test.ts`
- Create: `src/auth/vscodeSession.ts`

**Interfaces:**
- Produces: `AZURE_DEVOPS_SCOPE`, `GetSessionFn`, `ensureAzureSession(getSession)` — consumed by `extension.ts`. `getVscodeMicrosoftSession` (thin `vscode` wrapper, not unit tested) — consumed by `extension.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/auth/ensureAzureSession.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ensureAzureSession, AZURE_DEVOPS_SCOPE } from './ensureAzureSession';

describe('ensureAzureSession', () => {
  it('returns the access token when a session is granted', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'abc123' });

    const token = await ensureAzureSession(getSession);

    expect(token).toBe('abc123');
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  });

  it('throws a descriptive error when the session is undefined', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    await expect(ensureAzureSession(getSession)).rejects.toThrow(/login/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/auth/ensureAzureSession.test.ts`
Expected: FAIL — `Cannot find module './ensureAzureSession'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/auth/ensureAzureSession.ts
export const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

export type GetSessionFn = (
  scopes: string[],
  options: { createIfNone: boolean },
) => Promise<{ accessToken: string } | undefined>;

export async function ensureAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  if (!session) {
    throw new Error('Login com a Microsoft foi cancelado ou falhou.');
  }
  return session.accessToken;
}
```

```ts
// src/auth/vscodeSession.ts
import * as vscode from 'vscode';
import type { GetSessionFn } from './ensureAzureSession';

export const getVscodeMicrosoftSession: GetSessionFn = (scopes, options) =>
  vscode.authentication.getSession('microsoft', scopes, options) as Promise<{ accessToken: string } | undefined>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/auth/ensureAzureSession.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/ensureAzureSession.ts src/auth/ensureAzureSession.test.ts src/auth/vscodeSession.ts
git commit -m "feat: Azure AD session handling via VS Code auth provider"
```

---

### Task 7: Skill placeholder resolution

**Files:**
- Create: `src/skills/resolvePlaceholders.ts`
- Test: `src/skills/resolvePlaceholders.test.ts`

**Interfaces:**
- Consumes: `WorkItem` from `src/types.ts` (Task 1).
- Produces: `SkillTemplateContext` type, `resolvePlaceholders(template, context): string` — consumed by `src/skills/generateContextFile.ts` (Task 8).

- [ ] **Step 1: Write the failing tests**

```ts
// src/skills/resolvePlaceholders.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import type { WorkItem } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Corrigir bug no login',
    description: 'Descrição do bug',
    status: 'Active',
    type: 'Task',
    url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
    parentId: null,
    childIds: [],
    ...overrides,
  };
}

describe('resolvePlaceholders', () => {
  it('replaces simple placeholders with work item fields', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: 'feature/90' };
    const result = resolvePlaceholders('# {{title}} (#{{id}}) - {{status}}', context);
    expect(result).toBe('# Corrigir bug no login (#482) - Active');
  });

  it('replaces {{branch}} and {{url}}', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: 'feature/90' };
    const result = resolvePlaceholders('{{branch}} {{url}}', context);
    expect(result).toBe('feature/90 https://dev.azure.com/org/proj/_workitems/edit/482');
  });

  it('replaces parent placeholders with empty strings when there is no parent', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: '' };
    const result = resolvePlaceholders('Parent: [{{parent.id}}] {{parent.title}}', context);
    expect(result).toBe('Parent: [] ');
  });

  it('replaces parent placeholders with parent data when present', () => {
    const parent = workItem({ id: 90, title: 'PBI pai', description: 'desc pai' });
    const context: SkillTemplateContext = { workItem: workItem(), parent, subtasks: [], branch: '' };
    const result = resolvePlaceholders('{{parent.id}} {{parent.title}} {{parent.description}}', context);
    expect(result).toBe('90 PBI pai desc pai');
  });

  it('renders a checklist for subtasks, checking Done/Closed statuses', () => {
    const subtasks = [
      workItem({ id: 1, title: 'A', status: 'Done' }),
      workItem({ id: 2, title: 'B', status: 'Active' }),
      workItem({ id: 3, title: 'C', status: 'Closed' }),
    ];
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks, branch: '' };
    const result = resolvePlaceholders('{{subtasks}}', context);
    expect(result).toBe('- [x] #1 — A\n- [ ] #2 — B\n- [x] #3 — C');
  });

  it('shows a placeholder message when there are no subtasks', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: '' };
    const result = resolvePlaceholders('{{subtasks}}', context);
    expect(result).toBe('_Nenhuma subtask._');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/skills/resolvePlaceholders.test.ts`
Expected: FAIL — `Cannot find module './resolvePlaceholders'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/skills/resolvePlaceholders.ts
import type { WorkItem } from '../types';

export interface SkillTemplateContext {
  workItem: WorkItem;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  branch: string;
}

const DONE_STATUSES = new Set(['done', 'closed']);

function buildSubtasksChecklist(subtasks: WorkItem[]): string {
  if (subtasks.length === 0) {
    return '_Nenhuma subtask._';
  }
  return subtasks
    .map(s => `- [${DONE_STATUSES.has(s.status.toLowerCase()) ? 'x' : ' '}] #${s.id} — ${s.title}`)
    .join('\n');
}

export function resolvePlaceholders(template: string, context: SkillTemplateContext): string {
  const { workItem, parent, subtasks, branch } = context;
  const replacements: Record<string, string> = {
    '{{id}}': String(workItem.id),
    '{{title}}': workItem.title,
    '{{description}}': workItem.description,
    '{{status}}': workItem.status,
    '{{type}}': workItem.type,
    '{{url}}': workItem.url,
    '{{branch}}': branch,
    '{{parent.id}}': parent ? String(parent.id) : '',
    '{{parent.title}}': parent ? parent.title : '',
    '{{parent.description}}': parent ? parent.description : '',
    '{{subtasks}}': buildSubtasksChecklist(subtasks),
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/skills/resolvePlaceholders.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/skills/resolvePlaceholders.ts src/skills/resolvePlaceholders.test.ts
git commit -m "feat: skill template placeholder resolution"
```

---

### Task 8: Context file generation

**Files:**
- Create: `src/skills/generateContextFile.ts`
- Test: `src/skills/generateContextFile.test.ts`

**Interfaces:**
- Consumes: `resolvePlaceholders`, `SkillTemplateContext` (Task 7).
- Produces: `generateContextFile(workspaceRoot, skillTemplatePath, context, now?): string` (returns a path relative to `workspaceRoot`) — consumed by `view/KanbrainViewProvider.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/skills/generateContextFile.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateContextFile } from './generateContextFile';
import type { SkillTemplateContext } from './resolvePlaceholders';
import type { WorkItem } from '../types';

let workspaceRoot: string;

const workItem: WorkItem = {
  id: 482,
  title: 'Corrigir bug',
  description: 'desc',
  status: 'Active',
  type: 'Task',
  url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
  parentId: null,
  childIds: [],
};

const context: SkillTemplateContext = { workItem, parent: null, subtasks: [], branch: 'feature/90' };

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-ctx-'));
  fs.mkdirSync(path.join(workspaceRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'skills', 'fix.md'), 'Título: {{title}} (#{{id}})');
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('generateContextFile', () => {
  it('writes the resolved template under .kanbrain/generated', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, new Date('2026-07-14T10:00:00.000Z'));

    expect(relativePath.startsWith(path.join('.kanbrain', 'generated'))).toBe(true);
    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).toBe('Título: Corrigir bug (#482)');
  });

  it('names the file with the work item id and a filesystem-safe timestamp', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, new Date('2026-07-14T10:00:00.000Z'));

    expect(path.basename(relativePath)).toBe('482-2026-07-14T10-00-00-000Z.md');
  });

  it('creates the .kanbrain/generated directory if it does not exist', () => {
    generateContextFile(workspaceRoot, 'skills/fix.md', context, new Date('2026-07-14T10:00:00.000Z'));

    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain', 'generated'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/skills/generateContextFile.test.ts`
Expected: FAIL — `Cannot find module './generateContextFile'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/skills/generateContextFile.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);

  const generatedDir = path.join(workspaceRoot, '.kanbrain', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;
  fs.writeFileSync(path.join(generatedDir, fileName), resolved, 'utf-8');

  return path.join('.kanbrain', 'generated', fileName);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/skills/generateContextFile.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/skills/generateContextFile.ts src/skills/generateContextFile.test.ts
git commit -m "feat: generate resolved skill context files"
```

---

### Task 9: Git branch helper

**Files:**
- Create: `src/git/getCurrentBranch.ts`
- Test: `src/git/getCurrentBranch.test.ts`

**Interfaces:**
- Produces: `getCurrentBranch(workspaceRoot): Promise<string>` — consumed by `extension.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/git/getCurrentBranch.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/git/getCurrentBranch.test.ts`
Expected: FAIL — `Cannot find module './getCurrentBranch'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/git/getCurrentBranch.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getCurrentBranch(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot });
    return stdout.trim();
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/git/getCurrentBranch.test.ts`
Expected: PASS — both tests green. (Requires `git` on PATH, already true for this environment.)

- [ ] **Step 5: Commit**

```bash
git add src/git/getCurrentBranch.ts src/git/getCurrentBranch.test.ts
git commit -m "feat: read the current git branch for skill context"
```

---

### Task 10: Terminal command

**Files:**
- Create: `src/terminal/buildReadCommand.ts`
- Test: `src/terminal/buildReadCommand.test.ts`
- Create: `src/terminal/kanbrainTerminal.ts`

**Interfaces:**
- Produces: `buildReadCommand(relativeContextFilePath): string` — consumed by `kanbrainTerminal.ts`. `sendReadCommand(relativeContextFilePath): void` (thin `vscode` wrapper, not unit tested) — consumed by `view/KanbrainViewProvider.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/terminal/buildReadCommand.test.ts
import { describe, it, expect } from 'vitest';
import { buildReadCommand } from './buildReadCommand';

describe('buildReadCommand', () => {
  it('builds the read instruction with a forward-slash path', () => {
    expect(buildReadCommand('.kanbrain/generated/482-x.md')).toBe(
      'Leia o arquivo .kanbrain/generated/482-x.md e siga as instruções nele.',
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(buildReadCommand('.kanbrain\\generated\\482-x.md')).toBe(
      'Leia o arquivo .kanbrain/generated/482-x.md e siga as instruções nele.',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/terminal/buildReadCommand.test.ts`
Expected: FAIL — `Cannot find module './buildReadCommand'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/terminal/buildReadCommand.ts
export function buildReadCommand(relativeContextFilePath: string): string {
  const normalized = relativeContextFilePath.split('\\').join('/');
  return `Leia o arquivo ${normalized} e siga as instruções nele.`;
}
```

```ts
// src/terminal/kanbrainTerminal.ts
import * as vscode from 'vscode';
import { buildReadCommand } from './buildReadCommand';

const TERMINAL_NAME = 'Kanbrain';

function findOrCreateTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  return existing ?? vscode.window.createTerminal(TERMINAL_NAME);
}

export function sendReadCommand(relativeContextFilePath: string): void {
  const terminal = findOrCreateTerminal();
  terminal.show(true);
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/terminal/buildReadCommand.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/terminal/buildReadCommand.ts src/terminal/buildReadCommand.test.ts src/terminal/kanbrainTerminal.ts
git commit -m "feat: send skill read commands to an integrated terminal"
```

---

### Task 11: Webview render function

**Files:**
- Create: `src/view/render.ts`
- Test: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `WorkItem`, `KanbrainConfig` from `src/types.ts` (Task 1).
- Produces: `RenderState` type, `render(state): string` — consumed by `view/KanbrainViewProvider.ts` (Task 13).

- [ ] **Step 1: Write the failing tests**

```ts
// src/view/render.test.ts
import { describe, it, expect } from 'vitest';
import { render, type RenderState } from './render';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Corrigir <bug> no login',
    description: 'desc',
    status: 'Active',
    type: 'Task',
    url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
    parentId: null,
    childIds: [],
    ...overrides,
  };
}

const config: KanbrainConfig = { organization: 'org', project: 'proj', statusSkills: { Active: 'skills/fix.md' } };

describe('render', () => {
  it('shows a setup prompt when there is no config', () => {
    const html = render({ config: null, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a select-work-item prompt when there is config but no active work item', () => {
    const html = render({ config, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('Kanbrain: Select Work Item');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('Corrigir &lt;bug&gt; no login');
    expect(html).not.toContain('Corrigir <bug> no login');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({ config, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    expect(html).toContain('data-action="run-skill"');
    expect(html).toContain('data-id="482"');
  });

  it('hides the action button when the status has no configured skill', () => {
    const html = render({ config, workItem: workItem({ status: 'Closed' }), parent: null, subtasks: [] });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists subtasks with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ config, workItem: workItem(), parent: null, subtasks });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Subtasks (1)');
  });

  it('shows an empty message when there are no subtasks', () => {
    const html = render({ config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('Nenhuma subtask');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/render.test.ts`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/view/render.ts
import type { WorkItem, KanbrainConfig } from '../types';

export interface RenderState {
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skillPath = config.statusSkills[workItem.status];
  if (!skillPath) {
    return '';
  }
  const label = skillPath.split('/').pop() ?? skillPath;
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}">▶ ${esc(label)}</button>`;
}

function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  return `
    <div class="${cssClass}">
      <div class="kb-card-header">
        <span class="kb-id">#${workItem.id}</span>
        <span class="kb-badge kb-status">${esc(workItem.status)}</span>
        <span class="kb-badge kb-type">${esc(workItem.type)}</span>
      </div>
      <div class="kb-title">${esc(workItem.title)}</div>
      ${renderActionButton(workItem, config)}
    </div>
  `;
}

export function render(state: RenderState): string {
  if (!state.config) {
    return '<div class="kb-empty">Nenhum projeto configurado. Rode o comando <b>Kanbrain: Setup</b>.</div>';
  }
  if (!state.workItem) {
    return '<div class="kb-empty">Nenhum work item selecionado. Rode o comando <b>Kanbrain: Select Work Item</b>.</div>';
  }

  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card')).join('')
    : '<div class="kb-empty">Nenhuma subtask.</div>';

  return `
    <div class="kb-header">
      <button id="kb-select-btn">Selecionar work item</button>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Subtasks (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts
git commit -m "feat: pure HTML renderer for the Kanbrain webview"
```

---

### Task 12: Webview state-change helper

**Files:**
- Create: `src/view/hasStateChanged.ts`
- Test: `src/view/hasStateChanged.test.ts`

**Interfaces:**
- Produces: `serializeState(workItem, subtasks): string`, `hasStateChanged(previous, workItem, subtasks): boolean` — consumed by `view/KanbrainViewProvider.ts` (Task 13).

- [ ] **Step 1: Write the failing tests**

```ts
// src/view/hasStateChanged.test.ts
import { describe, it, expect } from 'vitest';
import { serializeState, hasStateChanged } from './hasStateChanged';

describe('hasStateChanged', () => {
  it('is false when the serialized state is identical', () => {
    const workItem = { id: 1, title: 'A' };
    const subtasks = [{ id: 2, title: 'B' }];
    const previous = serializeState(workItem, subtasks);

    expect(hasStateChanged(previous, { id: 1, title: 'A' }, [{ id: 2, title: 'B' }])).toBe(false);
  });

  it('is true when a field changes', () => {
    const previous = serializeState({ id: 1, title: 'A' }, []);

    expect(hasStateChanged(previous, { id: 1, title: 'A (edited)' }, [])).toBe(true);
  });

  it('is true when the subtasks array changes', () => {
    const previous = serializeState({ id: 1 }, []);

    expect(hasStateChanged(previous, { id: 1 }, [{ id: 2 }])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/hasStateChanged.test.ts`
Expected: FAIL — `Cannot find module './hasStateChanged'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/view/hasStateChanged.ts
export function serializeState(workItem: unknown, subtasks: unknown): string {
  return JSON.stringify({ workItem, subtasks });
}

export function hasStateChanged(previous: string, workItem: unknown, subtasks: unknown): boolean {
  return serializeState(workItem, subtasks) !== previous;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/hasStateChanged.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/view/hasStateChanged.ts src/view/hasStateChanged.test.ts
git commit -m "feat: state-change detection for webview polling"
```

---

### Task 13: KanbrainViewProvider

**Files:**
- Create: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient` (Task 5), `readConfig` (Task 2), `render`/`RenderState` (Task 11), `serializeState`/`hasStateChanged` (Task 12), `generateContextFile` (Task 8), `sendReadCommand` (Task 10), `WorkItem` (Task 1).
- Produces: `KanbrainViewProvider` class (`viewType` static, constructor `(workspaceRoot, client, getCurrentBranch)`, `resolveWebviewView`, `setActiveWorkItem(id)`) — consumed by `extension.ts` (Task 15).

This task has no automated test (it's a thin `vscode`-dependent orchestration layer over already-tested pure modules); it's covered by the manual checklist in Task 16.

- [ ] **Step 1: Write the implementation**

```ts
// src/view/KanbrainViewProvider.ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItem } from '../types';
import { readConfig } from '../config/config';
import { render } from './render';
import { serializeState, hasStateChanged } from './hasStateChanged';
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
    private readonly getCurrentBranch: () => Promise<string>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'select-work-item') {
        await vscode.commands.executeCommand('kanbrain.selectWorkItem');
      } else if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      }
    });

    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    webviewView.onDidDispose(() => {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
      }
    });
  }

  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.lastState = '';
    void this.refresh();
  }

  private async runSkill(id: number): Promise<void> {
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

    const skillPath = config.statusSkills[workItem.status];
    if (!skillPath) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skillPath, {
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });

    sendReadCommand(relativePath);
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = readConfig(this.workspaceRoot);

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.activeWorkItemId) {
      const [fetched] = await this.client.getWorkItems(config.organization, config.project, [this.activeWorkItemId]);
      workItem = fetched ?? null;
      if (workItem) {
        subtasks = await this.client.getChildren(config.organization, config.project, workItem);
        if (workItem.parentId) {
          const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
          parent = fetchedParent ?? null;
        }
      }
    }

    if (!hasStateChanged(this.lastState, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(workItem, subtasks);
    this.view.webview.html = this.wrapHtml(render({ config, workItem, parent, subtasks }));
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head><style>${this.css()}</style></head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'kb-select-btn') {
        vscode.postMessage({ type: 'select-work-item' });
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      }
    });
  </script>
</body>
</html>`;
  }

  private css(): string {
    return `
      body { font-family: var(--vscode-font-family); padding: 8px; }
      .kb-badge { border-radius: 4px; padding: 2px 6px; margin-right: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
      .kb-main-card, .kb-subtask-card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-title { font-weight: 600; margin: 4px 0; }
      .kb-action-btn { margin-top: 6px; }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { margin-top: 12px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
    `;
  }
}
```

- [ ] **Step 2: Verify the project still compiles**

Run: `npm run compile`
Expected: no errors, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: KanbrainViewProvider wiring render, polling, and skill actions"
```

---

### Task 14: Commands

**Files:**
- Create: `src/commands/setup.ts`
- Create: `src/commands/selectWorkItem.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient` (Task 5), `readConfig`/`writeConfig`/`ensureGitignoreEntry` (Task 2).
- Produces: `registerSetupCommand(client, workspaceRoot): vscode.Disposable`, `registerSelectWorkItemCommand(client, workspaceRoot, context, onSelect): vscode.Disposable` — consumed by `extension.ts` (Task 15).

No automated test (both are thin `vscode`-dependent orchestration); covered by the manual checklist in Task 16.

- [ ] **Step 1: Write `src/commands/setup.ts`**

```ts
// src/commands/setup.ts
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { writeConfig, ensureGitignoreEntry, readConfig } from '../config/config';

const EXAMPLE_SKILL = `# Skill de exemplo

Work item: {{title}} (#{{id}})
Status: {{status}}
Descrição: {{description}}

Subtasks:
{{subtasks}}

## Instruções
Descreva aqui o que o agente deve fazer quando o work item estiver neste status.
`;

export function registerSetupCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.setup', async () => {
    const organizations = await client.listOrganizations();
    if (organizations.length === 0) {
      vscode.window.showErrorMessage('Nenhuma organização Azure DevOps encontrada para esta conta.');
      return;
    }
    const orgPick = await vscode.window.showQuickPick(
      organizations.map(o => ({ label: o.name, org: o })),
      { placeHolder: 'Selecione a organização Azure DevOps' },
    );
    if (!orgPick) {
      return;
    }

    const projects = await client.listProjects(orgPick.org.name);
    if (projects.length === 0) {
      vscode.window.showErrorMessage(`Nenhum projeto encontrado na organização ${orgPick.org.name}.`);
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map(p => ({ label: p.name, project: p })),
      { placeHolder: 'Selecione o projeto Azure DevOps' },
    );
    if (!projectPick) {
      return;
    }

    const existing = readConfig(workspaceRoot);
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      statusSkills: existing?.statusSkills ?? {},
    });

    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const exampleSkillPath = path.join(skillsDir, 'example.md');
    if (!fs.existsSync(exampleSkillPath)) {
      fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    }

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    vscode.window.showInformationMessage(
      `Kanbrain configurado: ${orgPick.org.name}/${projectPick.project.name}. Edite .kanbrain/config.json para mapear skills por status.`,
    );
  });
}
```

- [ ] **Step 2: Write `src/commands/selectWorkItem.ts`**

```ts
// src/commands/selectWorkItem.ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { readConfig } from '../config/config';

interface WorkItemQuickPickItem extends vscode.QuickPickItem {
  id: number;
}

export function registerSelectWorkItemCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  context: vscode.ExtensionContext,
  onSelect: (id: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.selectWorkItem', async () => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      vscode.window.showErrorMessage('Rode "Kanbrain: Setup" antes de selecionar um work item.');
      return;
    }

    const quickPick = vscode.window.createQuickPick<WorkItemQuickPickItem>();
    quickPick.placeholder = 'Buscar work item por título ou #id…';

    quickPick.onDidChangeValue(async value => {
      quickPick.busy = true;
      const ids = await client.searchWorkItems(config.organization, config.project, value);
      const items = ids.length ? await client.getWorkItems(config.organization, config.project, ids) : [];
      quickPick.items = items.map(item => ({ label: `#${item.id} ${item.title}`, description: item.status, id: item.id }));
      quickPick.busy = false;
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        void context.workspaceState.update('kanbrain.activeWorkItemId', selected.id);
        onSelect(selected.id);
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });
}
```

- [ ] **Step 3: Verify the project still compiles**

Run: `npm run compile`
Expected: no errors, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/commands/setup.ts src/commands/selectWorkItem.ts
git commit -m "feat: Kanbrain Setup and Select Work Item commands"
```

---

### Task 15: Extension activation and manifest

**Files:**
- Modify: `src/extension.ts` (replace entire contents)
- Modify: `package.json` (contributes + activationEvents)
- Create: `media/icon.svg`

**Interfaces:**
- Consumes: everything produced by Tasks 2–14.

- [ ] **Step 1: Replace `src/extension.ts`**

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { ensureAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const client = new AzureDevOpsClient({
    fetchImpl: fetch,
    getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
  });

  const provider = new KanbrainViewProvider(workspaceRoot, client, () => getCurrentBranch(workspaceRoot));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider),
    registerSetupCommand(client, workspaceRoot),
    registerSelectWorkItemCommand(client, workspaceRoot, context, id => provider.setActiveWorkItem(id)),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }
}

export function deactivate(): void {}
```

- [ ] **Step 2: Create `media/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
  <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <rect x="3.5" y="3.5" width="3" height="9" fill="currentColor"/>
  <rect x="9.5" y="3.5" width="3" height="5" fill="currentColor"/>
</svg>
```

- [ ] **Step 3: Update `package.json` `contributes` and `activationEvents`**

Replace the `"activationEvents"` and `"contributes"` fields with:

```json
  "activationEvents": [
    "onView:kanbrain.view"
  ],
  "contributes": {
    "commands": [
      { "command": "kanbrain.setup", "title": "Kanbrain: Setup" },
      { "command": "kanbrain.selectWorkItem", "title": "Kanbrain: Select Work Item" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "kanbrain", "title": "Kanbrain", "icon": "media/icon.svg" }
      ]
    },
    "views": {
      "kanbrain": [
        { "type": "webview", "id": "kanbrain.view", "name": "Kanbrain" }
      ]
    }
  },
```

- [ ] **Step 4: Verify the project compiles**

Run: `npm run compile`
Expected: no errors, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts package.json media/icon.svg
git commit -m "feat: wire up extension activation, commands, and views"
```

---

### Task 16: Integration smoke test, README, and manual verification

**Files:**
- Create: `test/runTest.ts`
- Create: `test/suite/index.ts`
- Create: `test/suite/extension.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: the fully wired extension from Task 15.

- [ ] **Step 1: Write `test/runTest.ts`**

```ts
// test/runTest.ts
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error('Falha ao rodar os testes de integração', err);
    process.exit(1);
  }
}

void main();
```

- [ ] **Step 2: Write `test/suite/index.ts`**

```ts
// test/suite/index.ts
import * as path from 'node:path';
import Mocha from 'mocha';
import { globSync } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  const testsRoot = path.resolve(__dirname, '.');
  const files = globSync('**/*.test.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} testes falharam.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
```

- [ ] **Step 3: Write `test/suite/extension.test.ts`**

```ts
// test/suite/extension.test.ts
import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Kanbrain Extension', () => {
  test('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension('kanbrain.kanbrain');
    assert.ok(extension, 'extension not found — check publisher/name in package.json');
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kanbrain.setup'), 'kanbrain.setup not registered');
    assert.ok(commands.includes('kanbrain.selectWorkItem'), 'kanbrain.selectWorkItem not registered');
  });
});
```

- [ ] **Step 4: Add integration-test devDependencies**

Add to `package.json` `devDependencies` (merge with the existing block from Task 1):

```json
    "@types/glob": "^8.1.0"
```

- [ ] **Step 5: Run the integration test**

```bash
npm install
npm run compile
npm run test:integration
```

Expected: a VS Code test instance launches headlessly and exits 0, with output showing `1 passing`.

If this environment cannot launch the VS Code test instance (e.g., no display / sandboxed CI), note that in the task result and treat Step 6 (manual checklist) as the authoritative verification instead — do not mark this task done on the strength of unit tests alone, since none of the vscode-dependent modules (auth, client wiring, view provider, commands) are covered by Vitest.

- [ ] **Step 6: Write `README.md`**

```markdown
# Kanbrain

VS Code extension that shows the active Azure DevOps work item and its subtasks in a side panel, with per-status "skill" buttons that generate a context file and send a read command to an integrated terminal.

## Setup

1. Open a workspace folder.
2. Run **Kanbrain: Setup** from the command palette. Sign in with your Microsoft account when prompted, then pick an Azure DevOps organization and project.
3. This creates `.kanbrain/config.json` (commit it — it's shared team config) and `.kanbrain/skills/example.md` (a starter skill template).
4. Edit `.kanbrain/config.json`'s `statusSkills` map to point each work item status at a skill file:

   ```json
   {
     "organization": "my-org",
     "project": "MyProject",
     "statusSkills": {
       "New": ".kanbrain/skills/brainstorm.md",
       "Active": null,
       "Resolved": ".kanbrain/skills/review.md"
     }
   }
   ```

5. Run **Kanbrain: Select Work Item** to pick which work item shows in the panel. Drag the "Kanbrain" view (from the activity bar) into the secondary sidebar if you want it on the right, like the backoffice flow mode.

## Skill file placeholders

`{{id}}` `{{title}}` `{{description}}` `{{status}}` `{{type}}` `{{url}}` `{{branch}}` `{{parent.id}}` `{{parent.title}}` `{{parent.description}}` `{{subtasks}}`

## Development

```bash
npm install
npm run compile
npm run test:unit
npm run test:integration
```

Press F5 in VS Code to launch an Extension Development Host with Kanbrain loaded.
```

- [ ] **Step 7: Commit**

```bash
git add test/runTest.ts test/suite/index.ts test/suite/extension.test.ts package.json README.md
git commit -m "test: integration smoke test and project README"
```

- [ ] **Step 8: Manual verification checklist**

Run these by hand in an Extension Development Host (press F5) against a real Azure DevOps organization, since the webview UI and the live auth/API flow aren't covered by either test suite:

- [ ] `Kanbrain: Setup` prompts for Microsoft login, lists real organizations, lists real projects, and writes `.kanbrain/config.json`.
- [ ] `.kanbrain/generated/` is added to `.gitignore` after setup.
- [ ] `Kanbrain: Select Work Item` search returns matching work items by title and by `#id`.
- [ ] Selecting a work item renders it in the Kanbrain view with correct status/type badges and title.
- [ ] Subtasks (Parent/Child linked work items) render under "Subtasks (N)".
- [ ] A status with a configured skill shows an action button; a status without one does not.
- [ ] Clicking the action button opens/reuses a "Kanbrain" terminal and sends `Leia o arquivo .kanbrain/generated/<id>-<timestamp>.md e siga as instruções nele.`
- [ ] The generated file's placeholders are correctly resolved with real work item data.
- [ ] Changing the work item's status directly in Azure DevOps Boards is reflected in the panel within ~5 seconds (polling).
- [ ] Reopening the workspace restores the previously selected work item (via `workspaceState`).
- [ ] Dragging the Kanbrain view into the secondary/right sidebar works and persists across reloads.

---

## Self-Review Notes

- **Spec coverage:** auth (Task 6), org/project setup + versioned config (Task 2, 14), work item search/select (Task 14), hierarchy-based subtasks (Task 4, 5), webview UI (Task 11, 13), skill templates + context file + terminal (Task 7, 8, 10), polling/no-flicker refresh (Task 12, 13), error handling for missing config/skill file (Task 11 empty states + manual checklist) — all covered.
- **Type consistency checked:** `WorkItem`, `KanbrainConfig`, `AzureDevOpsClient` method names, `SkillTemplateContext`, and `RenderState` are used with identical shapes across every task that consumes them.
- **No placeholders:** every step has complete code and exact commands; the one item without an automated test (webview/command orchestration) is explicitly called out and covered by the manual checklist instead of a fake test.
