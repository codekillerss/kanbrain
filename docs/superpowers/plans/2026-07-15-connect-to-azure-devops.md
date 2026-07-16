# Kanbrain: Connect to Azure DevOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Kanbrain: Connect to Azure DevOps` command (with a matching panel prompt) so a developer who clones a repo someone else already configured can explicitly connect their own Azure DevOps identity — and stop `KanbrainViewProvider.refresh()` from silently swallowing auth failures during background polling.

**Architecture:** Two small additions to the auth layer (`hasCachedAzureSession` for a no-popup probe, `connectAzureSession` for a login that always lets the user (re)pick an account) plus a tolerant `validateProjectAccess` check feed a new `connectionStatus` gate in `KanbrainViewProvider`, checked once per VS Code session and re-checked reactively whenever a normal data fetch fails. `render.ts` gets a new optional `connectionStatus` field on `RenderState` that shows a "not connected" prompt, mirroring the existing "no config" prompt. A new `Kanbrain: Connect to Azure DevOps` command drives the whole thing.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.authentication.getSession`), Vitest.

## Global Constraints

- No popup/login prompt may ever fire from passive background polling — only the explicit `Kanbrain: Connect to Azure DevOps` command may prompt a login (`createIfNone: true`). The passive session check always uses `createIfNone: false`.
- The real-access validation (`validateProjectAccess`) runs at most once per VS Code session for the initial check, plus reactively whenever a normal data fetch fails — never on every 5s poll.
- Any failure during the initial check or a later data fetch is treated uniformly as "disconnected" — no HTTP status-code sniffing (401 vs 403 vs 404).
- `src/commands/connect.ts` and the `KanbrainViewProvider.ts` changes have no dedicated test file — matches this repo's established no-test convention for VS Code command-glue and for `KanbrainViewProvider.ts` itself; verified via `npm run compile` + full suite + the README manual checklist.
- `RenderState.connectionStatus` must be **optional** — every existing call site across `render.test.ts`, `renderHome.test.ts`, `renderConfig.test.ts` constructs `RenderState` without it, and must keep compiling and passing unchanged.
- Every task must leave `npm run compile` and `npm run test:unit` passing.

---

### Task 1: Extend the auth layer (`hasCachedAzureSession`, `connectAzureSession`)

**Files:**
- Modify: `src/auth/ensureAzureSession.ts`
- Test: `src/auth/ensureAzureSession.test.ts`

**Interfaces:**
- Produces: `GetSessionFn` widened to `(scopes: string[], options: { createIfNone: boolean; clearSessionPreference?: boolean }) => Promise<{ accessToken: string } | undefined>`; `export async function hasCachedAzureSession(getSession: GetSessionFn): Promise<boolean>`; `export async function connectAzureSession(getSession: GetSessionFn): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/auth/ensureAzureSession.test.ts`, replacing the whole file:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ensureAzureSession, hasCachedAzureSession, connectAzureSession, AZURE_DEVOPS_SCOPE } from './ensureAzureSession';

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

describe('hasCachedAzureSession', () => {
  it('returns true when a session is already cached, without prompting', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'abc123' });

    const result = await hasCachedAzureSession(getSession);

    expect(result).toBe(true);
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: false });
  });

  it('returns false when there is no cached session', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    const result = await hasCachedAzureSession(getSession);

    expect(result).toBe(false);
  });
});

describe('connectAzureSession', () => {
  it('forces the account picker and returns the access token', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'xyz789' });

    const token = await connectAzureSession(getSession);

    expect(token).toBe('xyz789');
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: true, clearSessionPreference: true });
  });

  it('throws a descriptive error when the session is undefined', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    await expect(connectAzureSession(getSession)).rejects.toThrow(/login/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- ensureAzureSession.test.ts`
Expected: FAIL — `hasCachedAzureSession`/`connectAzureSession` are not exported.

- [ ] **Step 3: Implement**

Replace the whole contents of `src/auth/ensureAzureSession.ts`:

```ts
export const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

export type GetSessionFn = (
  scopes: string[],
  options: { createIfNone: boolean; clearSessionPreference?: boolean },
) => Promise<{ accessToken: string } | undefined>;

export async function ensureAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  if (!session) {
    throw new Error('Microsoft login was cancelled or failed.');
  }
  return session.accessToken;
}

export async function hasCachedAzureSession(getSession: GetSessionFn): Promise<boolean> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: false });
  return !!session;
}

export async function connectAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true, clearSessionPreference: true });
  if (!session) {
    throw new Error('Microsoft login was cancelled or failed.');
  }
  return session.accessToken;
}
```

(Note: this also translates the pre-existing Portuguese error message to English, matching the rest of the codebase — it's the exact string being reused for the new `connectAzureSession` function.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- ensureAzureSession.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth/ensureAzureSession.ts src/auth/ensureAzureSession.test.ts
git commit -m "feat: add hasCachedAzureSession and connectAzureSession"
```

---

### Task 2: Validate real project access (`validateProjectAccess`)

**Files:**
- Create: `src/azureDevOps/validateProjectAccess.ts`
- Test: `src/azureDevOps/validateProjectAccess.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.getDefaultTeamName(organization: string, project: string): Promise<string>` (existing).
- Produces: `export async function validateProjectAccess(client: AzureDevOpsClient, organization: string, project: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `src/azureDevOps/validateProjectAccess.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { validateProjectAccess } from './validateProjectAccess';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{ getDefaultTeamName: () => Promise<string> }> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('validateProjectAccess', () => {
  it('returns true when the account can access the configured project', async () => {
    const client = stubClient();

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(true);
  });

  it('returns false, without throwing, when the account has no access', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new Error('404')) });

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- validateProjectAccess.test.ts`
Expected: FAIL — `Cannot find module './validateProjectAccess'`.

- [ ] **Step 3: Implement**

Create `src/azureDevOps/validateProjectAccess.ts`:

```ts
import type { AzureDevOpsClient } from './client';

export async function validateProjectAccess(client: AzureDevOpsClient, organization: string, project: string): Promise<boolean> {
  try {
    await client.getDefaultTeamName(organization, project);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- validateProjectAccess.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/validateProjectAccess.ts src/azureDevOps/validateProjectAccess.test.ts
git commit -m "feat: add validateProjectAccess"
```

---

### Task 3: "Not connected" prompt in `render.ts`

**Files:**
- Modify: `src/view/render.ts`
- Test: `src/view/render.test.ts`

**Interfaces:**
- Produces: `RenderState.connectionStatus?: 'connected' | 'disconnected'` (optional — omitted/`'connected'` behaves exactly like today); button `id="kb-run-connect-btn"`.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/render.test.ts`, right after the `'shows a button to run Setup when there is no config'` test:

```ts
  it('shows a connect prompt when configured but not connected to Azure DevOps', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
      connectionStatus: 'disconnected',
    });

    expect(html).toContain('Kanbrain: Connect to Azure DevOps');
    expect(html).toContain('id="kb-run-connect-btn"');
  });

  it('does not show the connect prompt when connectionStatus is omitted', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('id="kb-run-connect-btn"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- render.test.ts`
Expected: FAIL — the first new test's assertions don't match anything yet (`connectionStatus` isn't a recognized property and produces no different output).

- [ ] **Step 3: Implement**

In `src/view/render.ts`, replace:

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
}

export function render(state: RenderState): string {
  if (!state.hasWorkspace) {
    return '<div class="kb-empty">Open a workspace folder to use Kanbrain.</div>';
  }
  if (!state.config) {
    return `
      <div class="kb-empty">
        No project configured. Run the <b>Kanbrain: Setup</b> command.
        <div><button id="kb-run-setup-btn" class="kb-action-btn">Run Kanbrain: Setup</button></div>
      </div>
    `;
  }
  if (state.screen === 'home') {
```

with:

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
}

export function render(state: RenderState): string {
  if (!state.hasWorkspace) {
    return '<div class="kb-empty">Open a workspace folder to use Kanbrain.</div>';
  }
  if (!state.config) {
    return `
      <div class="kb-empty">
        No project configured. Run the <b>Kanbrain: Setup</b> command.
        <div><button id="kb-run-setup-btn" class="kb-action-btn">Run Kanbrain: Setup</button></div>
      </div>
    `;
  }
  if (state.connectionStatus === 'disconnected') {
    return `
      <div class="kb-empty">
        This project is configured, but not connected to Azure DevOps yet. Run the <b>Kanbrain: Connect to Azure DevOps</b> command.
        <div><button id="kb-run-connect-btn" class="kb-action-btn">Run Kanbrain: Connect to Azure DevOps</button></div>
      </div>
    `;
  }
  if (state.screen === 'home') {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- render.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts
git commit -m "feat: add a not-connected prompt to the panel"
```

---

### Task 4: Wire connection tracking into `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts` (no dedicated test file — matches this file's existing no-test convention)
- Modify: `src/extension.ts` (constructor call site only — the new command registration is Task 5)

**Interfaces:**
- Consumes: `validateProjectAccess` (Task 2), `RenderState.connectionStatus` (Task 3).
- Produces: `KanbrainViewProvider` constructor gains a 5th parameter `checkAzureSession: () => Promise<boolean>`; new public method `markConnected(): void`; webview message type `run-connect`.

- [ ] **Step 1: Add the `checkAzureSession` constructor parameter**

In `src/view/KanbrainViewProvider.ts`, replace:

```ts
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { presentBoardConfigCheck } from '../commands/checkBoardConfig';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private currentScreen: 'home' | 'flow' | 'config' = 'home';

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
  ) {}
```

with:

```ts
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { presentBoardConfigCheck } from '../commands/checkBoardConfig';
import { validateProjectAccess } from '../azureDevOps/validateProjectAccess';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private currentScreen: 'home' | 'flow' | 'config' = 'home';
  private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
    private readonly checkAzureSession: () => Promise<boolean>,
  ) {}
```

- [ ] **Step 2: Handle the `run-connect` message**

In the same file, replace:

```ts
      } else if (message.type === 'run-setup') {
        await vscode.commands.executeCommand('kanbrain.setup');
      } else if (message.type === 'run-check-board-config') {
```

with:

```ts
      } else if (message.type === 'run-setup') {
        await vscode.commands.executeCommand('kanbrain.setup');
      } else if (message.type === 'run-connect') {
        await vscode.commands.executeCommand('kanbrain.connect');
      } else if (message.type === 'run-check-board-config') {
```

- [ ] **Step 3: Add the `markConnected` method**

Replace:

```ts
  showConfigScreen(): void {
    this.currentScreen = 'config';
    this.lastState = '';
    void this.refresh();
  }
```

with:

```ts
  showConfigScreen(): void {
    this.currentScreen = 'config';
    this.lastState = '';
    void this.refresh();
  }

  markConnected(): void {
    this.connectionStatus = 'connected';
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 4: Add connection checking and error handling to `refresh()`**

Replace the whole `refresh` method:

```ts
  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;
    const activeWorkItemIdAtStart = this.activeWorkItemId;

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.client && activeWorkItemIdAtStart) {
      const [fetched] = await this.client.getWorkItems(config.organization, config.project, [activeWorkItemIdAtStart]);
      workItem = fetched ?? null;
      if (workItem) {
        subtasks = await this.client.getChildren(config.organization, config.project, workItem);
        if (workItem.parentId) {
          const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
          parent = fetchedParent ?? null;
        }
      }
    }

    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    if (!hasStateChanged(this.lastState, config, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks);
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, screen: this.currentScreen }),
    );
  }
```

with:

```ts
  private async checkConnection(config: KanbrainConfig): Promise<'connected' | 'disconnected'> {
    if (!this.client) {
      return 'disconnected';
    }
    const hasSession = await this.checkAzureSession();
    if (!hasSession) {
      return 'disconnected';
    }
    const hasAccess = await validateProjectAccess(this.client, config.organization, config.project);
    return hasAccess ? 'connected' : 'disconnected';
  }

  private renderDisconnected(config: KanbrainConfig): void {
    if (!this.view || this.lastState === 'disconnected') {
      return;
    }
    this.lastState = 'disconnected';
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem: null,
        parent: null,
        subtasks: [],
        screen: this.currentScreen,
        connectionStatus: 'disconnected',
      }),
    );
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;

    if (config && this.connectionStatus === 'unknown') {
      this.connectionStatus = await this.checkConnection(config);
    }

    if (config && this.connectionStatus === 'disconnected') {
      this.renderDisconnected(config);
      return;
    }

    const activeWorkItemIdAtStart = this.activeWorkItemId;

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.client && activeWorkItemIdAtStart) {
      try {
        const [fetched] = await this.client.getWorkItems(config.organization, config.project, [activeWorkItemIdAtStart]);
        workItem = fetched ?? null;
        if (workItem) {
          subtasks = await this.client.getChildren(config.organization, config.project, workItem);
          if (workItem.parentId) {
            const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
            parent = fetchedParent ?? null;
          }
        }
      } catch {
        // A data fetch failed mid-session (e.g. the session expired) — treat it the same as a
        // failed connection check instead of leaving the panel stuck on a silent rejection.
        this.connectionStatus = 'disconnected';
        this.renderDisconnected(config);
        return;
      }
    }

    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    if (!hasStateChanged(this.lastState, config, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks);
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, screen: this.currentScreen }),
    );
  }
```

- [ ] **Step 5: Add the client-side button handler**

In the same file's client `<script>` block, replace:

```ts
      } else if (target.id === 'kb-run-setup-btn' || target.id === 'kb-run-setup-home-btn') {
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-run-check-board-config-btn') {
```

with:

```ts
      } else if (target.id === 'kb-run-setup-btn' || target.id === 'kb-run-setup-home-btn') {
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-run-connect-btn') {
        vscode.postMessage({ type: 'run-connect' });
      } else if (target.id === 'kb-run-check-board-config-btn') {
```

- [ ] **Step 6: Update the `KanbrainViewProvider` instantiation in `extension.ts`**

In `src/extension.ts`, replace:

```ts
import { ensureAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
```

with:

```ts
import { ensureAzureSession, hasCachedAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
```

And replace:

```ts
  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
  );
```

with:

```ts
  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
  );
```

- [ ] **Step 7: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm run test:unit`
Expected: PASS — no regressions (this file and its call site have no dedicated tests, but nothing else should break).

- [ ] **Step 9: Commit**

```bash
git add src/view/KanbrainViewProvider.ts src/extension.ts
git commit -m "feat: track Azure DevOps connection status in the panel"
```

---

### Task 5: `Kanbrain: Connect to Azure DevOps` command

**Files:**
- Create: `src/commands/connect.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readConfig` (`src/config/config.ts`, existing), `connectAzureSession` (Task 1), `getVscodeMicrosoftSession` (`src/auth/vscodeSession.ts`, existing), `validateProjectAccess` (Task 2).
- Produces: `export async function connectToAzureDevOps(client: AzureDevOpsClient, workspaceRoot: string, onConnected: () => void): Promise<void>`; `export function registerConnectCommand(client: AzureDevOpsClient, workspaceRoot: string, onConnected: () => void): vscode.Disposable` (registers `kanbrain.connect`).

- [ ] **Step 1: Implement the command**

Create `src/commands/connect.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { connectAzureSession } from '../auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from '../auth/vscodeSession';
import { validateProjectAccess } from '../azureDevOps/validateProjectAccess';
import { readConfig } from '../config/config';

export async function connectToAzureDevOps(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onConnected: () => void,
): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  try {
    await connectAzureSession(getVscodeMicrosoftSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(message);
    return;
  }

  const hasAccess = await validateProjectAccess(client, config.organization, config.project);
  if (!hasAccess) {
    vscode.window.showErrorMessage(
      `Connected, but this account has no access to ${config.organization}/${config.project}. Run Kanbrain: Connect to Azure DevOps again to pick a different account.`,
    );
    return;
  }

  vscode.window.showInformationMessage(`Connected to ${config.organization}/${config.project}.`);
  onConnected();
}

export function registerConnectCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onConnected: () => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.connect', () => connectToAzureDevOps(client, workspaceRoot, onConnected));
}
```

- [ ] **Step 2: Register the command in `package.json`**

Replace:

```json
      { "command": "kanbrain.configureWithAi", "title": "Kanbrain: Configure with AI" }
    ],
```

with:

```json
      { "command": "kanbrain.configureWithAi", "title": "Kanbrain: Configure with AI" },
      { "command": "kanbrain.connect", "title": "Kanbrain: Connect to Azure DevOps" }
    ],
```

- [ ] **Step 3: Wire it up in `extension.ts`**

Replace:

```ts
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
```

with:

```ts
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
import { registerConnectCommand } from './commands/connect';
```

And replace:

```ts
  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
    registerConfigureWithAiCommand(client, workspaceRoot),
  );
```

with:

```ts
  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
    registerConfigureWithAiCommand(client, workspaceRoot),
    registerConnectCommand(client, workspaceRoot, () => provider.markConnected()),
  );
```

- [ ] **Step 4: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:unit`
Expected: PASS (no regressions — this file has no tests of its own).

- [ ] **Step 6: Commit**

```bash
git add src/commands/connect.ts src/extension.ts package.json
git commit -m "feat: add the Kanbrain: Connect to Azure DevOps command"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the command in the Setup section**

In `README.md`, right after step 5 of the numbered Setup list (the line starting with "Run **Kanbrain: Select Work Item**..."), add a new paragraph:

```markdown

If a teammate already ran Setup and committed `.kanbrain/config.json`, cloning the repo and opening it in VS Code won't automatically connect with *your* Azure DevOps identity. The panel detects this — a project that's configured but not yet connected on this machine shows a prompt to run **Kanbrain: Connect to Azure DevOps** (also available directly as a command), which lets you pick which Microsoft account to use (even if VS Code already has one cached for something else) and confirms it actually has access to the configured organization/project before returning you to the normal panel.
```

- [ ] **Step 2: Add manual verification checklist items**

In the "## Manual verification checklist" section, add these items right after the existing "`.kanbrain/generated/` is added to `.gitignore` after setup." item:

```markdown
- [ ] With a valid `.kanbrain/config.json` already present (e.g. after cloning a teammate's setup) but no Azure DevOps session/access established on this machine yet, the panel shows a "not connected" prompt with a button to run `Kanbrain: Connect to Azure DevOps`, instead of a blank or stuck panel.
- [ ] Running `Kanbrain: Connect to Azure DevOps` always prompts to pick a Microsoft account, even if VS Code already has one cached for another purpose; on success it shows "Connected to `<org>`/`<project>`." and the panel returns to the normal Home screen.
- [ ] Picking a Microsoft account that has no access to the configured organization/project shows a clear inline error message (not a silent failure or hang), and the panel stays on the "not connected" prompt.
- [ ] Running `Kanbrain: Connect to Azure DevOps` before `.kanbrain/config.json` exists shows an inline error ("No project configured. Run Kanbrain: Setup.") instead of failing silently.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Connect to Azure DevOps command"
```

---

## Final Verification

- [ ] Run `npm run compile` — no errors.
- [ ] Run `npm run test:unit` — full suite passes.
- [ ] Walk the new items in the README manual verification checklist by hand in an Extension Development Host (press F5) — ideally with two different Azure DevOps-connected Microsoft accounts available to actually exercise the "wrong account" path.
