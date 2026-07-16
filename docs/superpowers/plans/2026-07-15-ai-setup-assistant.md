# AI Setup Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Kanbrain: Configure with AI` command (plus a Home screen button) that discovers the project's real backlog levels/types/statuses *and* board columns, writes a rich instructional context file explaining the status-vs-column nuance, and hands it to the terminal agent — the same mechanism already used by skill buttons.

**Architecture:** Two new read-only `AzureDevOpsClient` methods (`listBoards`, `listBoardColumns`) feed a new tolerant discovery function (`discoverBoardColumns`, mirroring the existing `discoverBoardState`). A pure function (`buildSetupAssistantContent`) turns the discovered data into markdown. A generic file-writer (`writeGeneratedFile`) is extracted from the existing `generateContextFile` so both skill buttons and this new command share the same `.kanbrain/generated/` write path. A thin command module wires it all together and reuses the existing `sendReadCommand` terminal mechanism.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, Azure DevOps REST API (`_apis/work/boards`, `_apis/work/boards/{id}/columns`).

## Global Constraints

- Kanbrain stays read-only against Azure DevOps — no write API calls anywhere in this feature.
- No new `.kanbrain/config.json` fields — the agent edits `backlogLevels`/skill files exactly as a user would by hand.
- The command only runs manually (command palette or Home button) — never auto-triggered at the end of `Kanbrain: Setup`.
- Per-item discovery failures (one board's columns, one type's states) must not abort the whole command — same tolerant pattern as `discoverBoardState`.
- No automated test for `src/commands/configureWithAi.ts` — matches the established no-test convention for VS Code command-glue files in this repo (covered by the README manual-verification checklist instead).
- Every task must leave `npm run compile` and `npm run test:unit` passing.

---

### Task 1: Add `listBoards`/`listBoardColumns` to `AzureDevOpsClient`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `export interface AzureDevOpsBoard { id: string; name: string }`, `export interface BoardColumn { name: string; columnType: string; stateMappings: Record<string, string> }`, `AzureDevOpsClient.listBoards(organization: string, project: string, team: string): Promise<AzureDevOpsBoard[]>`, `AzureDevOpsClient.listBoardColumns(organization: string, project: string, team: string, boardId: string): Promise<BoardColumn[]>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, right before the final `});` that closes the `describe('AzureDevOpsClient', ...)` block (after the `'returns null when the work item type has no icon'` test):

```ts
  it('lists boards for a team', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ value: [{ id: 'b1', name: 'MyProject Team Board' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const boards = await client.listBoards('my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([{ id: 'b1', name: 'MyProject Team Board' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists columns for a board, including state mappings by work item type', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed', Bug: 'Active' } }],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const columns = await client.listBoardColumns('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(columns).toEqual([
      { name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed', Bug: 'Active' } },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards/b1/columns?api-version=7.1',
      expect.anything(),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- client.test.ts`
Expected: FAIL with `client.listBoards is not a function` (and similarly for `listBoardColumns`).

- [ ] **Step 3: Implement**

In `src/azureDevOps/client.ts`, add two new interfaces right after `AzureDevOpsProject` (currently lines 16-19):

```ts
export interface AzureDevOpsBoard {
  id: string;
  name: string;
}

export interface BoardColumn {
  name: string;
  columnType: string;
  stateMappings: Record<string, string>;
}
```

Then add two new methods at the end of the `AzureDevOpsClient` class, right before the closing `}` of the class (after `getWorkItemTypeIcon`):

```ts
  async listBoards(organization: string, project: string, team: string): Promise<AzureDevOpsBoard[]> {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards?api-version=7.1`,
    );
    return data.value.map(b => ({ id: b.id, name: b.name }));
  }

  async listBoardColumns(organization: string, project: string, team: string, boardId: string): Promise<BoardColumn[]> {
    const data = await this.request<{ value: { name: string; columnType: string; stateMappings: Record<string, string> }[] }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}/columns?api-version=7.1`,
    );
    return data.value.map(c => ({ name: c.name, columnType: c.columnType, stateMappings: c.stateMappings }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- client.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add listBoards/listBoardColumns to AzureDevOpsClient"
```

---

### Task 2: Discover board columns (`discoverBoardColumns`)

**Files:**
- Create: `src/azureDevOps/discoverBoardColumns.ts`
- Test: `src/azureDevOps/discoverBoardColumns.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.listBoards`, `AzureDevOpsClient.listBoardColumns`, `BoardColumn` (all from Task 1, `src/azureDevOps/client.ts`).
- Produces: `export interface DiscoveredBoard { name: string; columns: BoardColumn[] }`, `export async function discoverBoardColumns(client: AzureDevOpsClient, organization: string, project: string, team: string): Promise<DiscoveredBoard[]>`.

- [ ] **Step 1: Write the failing test**

Create `src/azureDevOps/discoverBoardColumns.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverBoardColumns } from './discoverBoardColumns';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listBoards: () => Promise<{ id: string; name: string }[]>;
  listBoardColumns: () => Promise<{ name: string; columnType: string; stateMappings: Record<string, string> }[]>;
}> = {}): AzureDevOpsClient {
  return {
    listBoards: vi.fn().mockResolvedValue([]),
    listBoardColumns: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardColumns', () => {
  it('lists every board with its columns', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Board One' },
        { id: 'b2', name: 'Board Two' },
      ]),
      listBoardColumns: vi
        .fn()
        .mockResolvedValueOnce([{ name: 'To Do', columnType: 'incoming', stateMappings: { Task: 'New' } }])
        .mockResolvedValueOnce([{ name: 'Done', columnType: 'outgoing', stateMappings: { Task: 'Closed' } }]),
    });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([
      { name: 'Board One', columns: [{ name: 'To Do', columnType: 'incoming', stateMappings: { Task: 'New' } }] },
      { name: 'Board Two', columns: [{ name: 'Done', columnType: 'outgoing', stateMappings: { Task: 'Closed' } }] },
    ]);
  });

  it('skips a board whose columns fail to load, without aborting the others', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Board One' },
        { id: 'b2', name: 'Board Two' },
      ]),
      listBoardColumns: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce([{ name: 'Done', columnType: 'outgoing', stateMappings: {} }]),
    });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([{ name: 'Board Two', columns: [{ name: 'Done', columnType: 'outgoing', stateMappings: {} }] }]);
  });

  it('returns an empty array when the team has no boards', async () => {
    const client = stubClient({ listBoards: vi.fn().mockResolvedValue([]) });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- discoverBoardColumns.test.ts`
Expected: FAIL — `Cannot find module './discoverBoardColumns'`.

- [ ] **Step 3: Implement**

Create `src/azureDevOps/discoverBoardColumns.ts`:

```ts
import type { AzureDevOpsClient, BoardColumn } from './client';

export interface DiscoveredBoard {
  name: string;
  columns: BoardColumn[];
}

export async function discoverBoardColumns(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<DiscoveredBoard[]> {
  const boards = await client.listBoards(organization, project, team);

  const result: DiscoveredBoard[] = [];
  for (const board of boards) {
    try {
      const columns = await client.listBoardColumns(organization, project, team, board.id);
      result.push({ name: board.name, columns });
    } catch {
      // One-off failure for a board: continue without it instead of aborting the whole discovery.
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- discoverBoardColumns.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/discoverBoardColumns.ts src/azureDevOps/discoverBoardColumns.test.ts
git commit -m "feat: add tolerant board-column discovery"
```

---

### Task 3: Extract `writeGeneratedFile` and refactor `generateContextFile` to reuse it

**Files:**
- Create: `src/skills/writeGeneratedFile.ts`
- Test: `src/skills/writeGeneratedFile.test.ts`
- Modify: `src/skills/generateContextFile.ts`
- (Do not modify `src/skills/generateContextFile.test.ts` — its existing assertions must keep passing unchanged.)

**Interfaces:**
- Produces: `export function writeGeneratedFile(workspaceRoot: string, fileName: string, content: string): string` — creates `.kanbrain/generated/` if needed, writes `content` to `<workspaceRoot>/.kanbrain/generated/<fileName>`, returns the path relative to `workspaceRoot` (`.kanbrain/generated/<fileName>`, using `path.join` so it's OS-native).

- [ ] **Step 1: Write the failing test**

Create `src/skills/writeGeneratedFile.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeGeneratedFile } from './writeGeneratedFile';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-gen-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('writeGeneratedFile', () => {
  it('creates the .kanbrain/generated directory if it does not exist', () => {
    writeGeneratedFile(workspaceRoot, 'note.md', 'hello');

    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain', 'generated'))).toBe(true);
  });

  it('writes the given content to the given file name', () => {
    writeGeneratedFile(workspaceRoot, 'note.md', 'hello world');

    const written = fs.readFileSync(path.join(workspaceRoot, '.kanbrain', 'generated', 'note.md'), 'utf-8');
    expect(written).toBe('hello world');
  });

  it('returns the path relative to the workspace root', () => {
    const relativePath = writeGeneratedFile(workspaceRoot, 'note.md', 'hello');

    expect(relativePath).toBe(path.join('.kanbrain', 'generated', 'note.md'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- writeGeneratedFile.test.ts`
Expected: FAIL — `Cannot find module './writeGeneratedFile'`.

- [ ] **Step 3: Implement `writeGeneratedFile`**

Create `src/skills/writeGeneratedFile.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export function writeGeneratedFile(workspaceRoot: string, fileName: string, content: string): string {
  const generatedDir = path.join(workspaceRoot, '.kanbrain', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, fileName), content, 'utf-8');
  return path.join('.kanbrain', 'generated', fileName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- writeGeneratedFile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `generateContextFile` to reuse it**

Replace the full contents of `src/skills/generateContextFile.ts` with:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import { writeGeneratedFile } from './writeGeneratedFile';

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;

  return writeGeneratedFile(workspaceRoot, fileName, resolved);
}
```

This preserves the exact same public behavior (same file name format, same directory, same content) — only the directory-creation/write tail is now delegated to `writeGeneratedFile`.

- [ ] **Step 6: Run the full test suite to verify nothing broke**

Run: `npm run test:unit`
Expected: PASS — in particular, all 3 existing tests in `src/skills/generateContextFile.test.ts` still pass unchanged.

- [ ] **Step 7: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/skills/writeGeneratedFile.ts src/skills/writeGeneratedFile.test.ts src/skills/generateContextFile.ts
git commit -m "refactor: extract writeGeneratedFile from generateContextFile"
```

---

### Task 4: Build the setup assistant file content (`buildSetupAssistantContent`)

**Files:**
- Create: `src/skills/buildSetupAssistantFile.ts`
- Test: `src/skills/buildSetupAssistantFile.test.ts`

**Interfaces:**
- Consumes: `BoardState` (from `src/azureDevOps/discoverBoardState.ts`, existing — `{ levels: BacklogLevel[]; statesByType: Record<string, WorkItemTypeState[]>; typeColors: Record<string, string>; typeIcons: Record<string, string> }`), `DiscoveredBoard` (from Task 2, `src/azureDevOps/discoverBoardColumns.ts`).
- Produces: `export function buildSetupAssistantContent(organization: string, project: string, discovered: BoardState, boards: DiscoveredBoard[]): string`.

- [ ] **Step 1: Write the failing test**

Create `src/skills/buildSetupAssistantFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSetupAssistantContent } from './buildSetupAssistantFile';
import type { BoardState } from '../azureDevOps/discoverBoardState';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function boardState(overrides: Partial<BoardState> = {}): BoardState {
  return {
    levels: [{ name: 'Stories', workItemTypes: ['User Story'] }],
    statesByType: { 'User Story': [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] },
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('buildSetupAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', boardState(), []);

    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('includes each backlog level, work item type, and status with its category', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', boardState(), []);

    expect(content).toContain('Stories');
    expect(content).toContain('User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      {
        name: 'MyProject Team Board',
        columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }],
      },
    ];
    const content = buildSetupAssistantContent('my-org', 'MyProject', boardState(), boards);

    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
    expect(content).toContain('User Story: Committed');
  });

  it('notes when no boards were found', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', boardState(), []);

    expect(content).toContain('No boards were found');
  });

  it('includes all four instructional sections', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', boardState(), []);

    expect(content).toContain('## How Kanbrain works');
    expect(content).toContain('## Important nuance');
    expect(content).toContain("## This project's real configuration");
    expect(content).toContain('## What to do');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- buildSetupAssistantFile.test.ts`
Expected: FAIL — `Cannot find module './buildSetupAssistantFile'`.

- [ ] **Step 3: Implement**

Create `src/skills/buildSetupAssistantFile.ts`:

```ts
import type { BoardState } from '../azureDevOps/discoverBoardState';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function renderLevels(discovered: BoardState): string {
  return discovered.levels
    .map(level => {
      const typesSection = level.workItemTypes
        .map(type => {
          const states = discovered.statesByType[type] ?? [];
          const stateLines = states.map(state => `  - ${state.name} (${state.category})`).join('\n');
          return `- **${type}**\n${stateLines}`;
        })
        .join('\n');
      return `### ${level.name}\n\n${typesSection}`;
    })
    .join('\n\n');
}

function renderBoards(boards: DiscoveredBoard[]): string {
  if (boards.length === 0) {
    return '_No boards were found for this team._';
  }
  return boards
    .map(board => {
      const columnsSection = board.columns
        .map(column => {
          const mappingLines = Object.entries(column.stateMappings)
            .map(([type, state]) => `  - ${type}: ${state}`)
            .join('\n');
          return `- **${column.name}** (${column.columnType})\n${mappingLines}`;
        })
        .join('\n');
      return `### ${board.name}\n\n${columnsSection}`;
    })
    .join('\n\n');
}

export function buildSetupAssistantContent(
  organization: string,
  project: string,
  discovered: BoardState,
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Setup Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item in a VS Code side panel, with per-status "skill" buttons. Each button generates a context file — this file was generated the exact same way — and sends a "read this file" command to an agent running in an integrated terminal. That agent is you. \`.kanbrain/config.json\`'s \`backlogLevels\` map links each **status** (\`System.State\`) to a skill file. The result we're aiming for is one skill for each real step of the team's flow — not necessarily one per raw status name.

## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) — it has no board-column API access at all. Many teams, though, think and work in terms of **board columns**, not raw statuses, and that's common and often the more natural mental model. A board column can group several statuses together, or have a name that doesn't match any status. Before configuring anything, read both the status list and the board column list below, explain this difference to the user in your own words, and ask them how they want Kanbrain to behave: one skill per status, or one skill shared across every status a column groups together.

## This project's real configuration

### Backlog levels, types, and statuses

${renderLevels(discovered)}

### Boards and columns

${renderBoards(boards)}

## What to do

1. Read and understand the data above.
2. Explain the status-vs-column difference to the user, using this project's real levels/types/statuses/boards/columns as examples.
3. Ask the user how they want Kanbrain to work: one skill per status, or one skill per board column (shared across every status that column maps to).
4. Based on their answer, edit \`.kanbrain/config.json\`'s \`backlogLevels\` map and the skill files under \`.kanbrain/skills/\` directly — they're regular workspace files, edit them the same way the user would by hand. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks for that, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- buildSetupAssistantFile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/skills/buildSetupAssistantFile.ts src/skills/buildSetupAssistantFile.test.ts
git commit -m "feat: build the AI setup assistant context file content"
```

---

### Task 5: `Kanbrain: Configure with AI` command

**Files:**
- Create: `src/commands/configureWithAi.ts`
- No test file — matches the established no-test convention for VS Code command-glue files (e.g. `src/commands/checkBoardConfig.ts`'s `registerCheckBoardConfigCommand`, `src/view/KanbrainViewProvider.ts`); verified via `npm run compile`, the manual checklist (Task 7), and by the fact every function it calls (`discoverBoardState`, `discoverBoardColumns`, `buildSetupAssistantContent`, `writeGeneratedFile`, `sendReadCommand`, `readConfig`) is already unit-tested.

**Interfaces:**
- Consumes: `readConfig` (`src/config/config.ts`, existing), `discoverBoardState` (`src/azureDevOps/discoverBoardState.ts`, existing), `discoverBoardColumns` (Task 2), `buildSetupAssistantContent` (Task 4), `writeGeneratedFile` (Task 3), `sendReadCommand` (`src/terminal/kanbrainTerminal.ts`, existing — `sendReadCommand(relativeContextFilePath: string): void`).
- Produces: `export async function configureWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void>`, `export function registerConfigureWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable` (registers command id `kanbrain.configureWithAi`).

- [ ] **Step 1: Implement**

Create `src/commands/configureWithAi.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverBoardColumns } from '../azureDevOps/discoverBoardColumns';
import { buildSetupAssistantContent } from '../skills/buildSetupAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const discovered = await discoverBoardState(client, config.organization, config.project);
    const boards = await discoverBoardColumns(client, config.organization, config.project, team);
    content = buildSetupAssistantContent(config.organization, config.project, discovered, boards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's board configuration: ${message}`);
    return;
  }

  const fileName = `setup-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureWithAi', () => configureWithAi(client, workspaceRoot));
}
```

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test:unit`
Expected: PASS (no regressions — this file has no tests of its own).

- [ ] **Step 4: Commit**

```bash
git add src/commands/configureWithAi.ts
git commit -m "feat: add the Kanbrain: Configure with AI command"
```

---

### Task 6: Wire the command into the extension, package.json, and the Home screen

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`
- Modify: `src/view/renderHome.ts`
- Test: `src/view/renderHome.test.ts`
- Modify: `src/view/KanbrainViewProvider.ts` (no dedicated test file — matches this file's existing no-test convention; verified via compile + full suite + Task 7's manual checklist)

**Interfaces:**
- Consumes: `registerConfigureWithAiCommand` (Task 5).
- Produces: command id `kanbrain.configureWithAi` registered and titled "Kanbrain: Configure with AI"; Home button `id="kb-run-configure-ai-btn"`; webview message type `run-configure-with-ai`.

- [ ] **Step 1: Write the failing test for the Home button**

In `src/view/renderHome.test.ts`, add this test right after the `'shows buttons for Setup, Check Board Configuration, and Sync Board Configuration'` test:

```ts
  it('shows a Configure with AI button in Commands', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-configure-ai-btn"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderHome.test.ts`
Expected: FAIL — the new assertion doesn't match anything yet.

- [ ] **Step 3: Add the button to `renderHome.ts`**

In `src/view/renderHome.ts`, in the `renderHome` function, replace:

```ts
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-secondary-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-secondary-btn">🔄 Sync Board Configuration</button>
      </div>
```

with:

```ts
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-secondary-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-secondary-btn">🔄 Sync Board Configuration</button>
        <button id="kb-run-configure-ai-btn" class="kb-secondary-btn">🤖 Configure with AI</button>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderHome.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Handle the message and click in `KanbrainViewProvider.ts`**

In `src/view/KanbrainViewProvider.ts`, in the `onDidReceiveMessage` handler, replace:

```ts
      } else if (message.type === 'run-sync-board-config') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
      } else if (message.type === 'show-home') {
```

with:

```ts
      } else if (message.type === 'run-sync-board-config') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
      } else if (message.type === 'run-configure-with-ai') {
        await vscode.commands.executeCommand('kanbrain.configureWithAi');
      } else if (message.type === 'show-home') {
```

In the same file's client-side `<script>` block (inside `wrapHtml`), replace:

```ts
      } else if (target.id === 'kb-run-sync-board-config-btn') {
        vscode.postMessage({ type: 'run-sync-board-config' });
      } else if (target.id === 'kb-home-btn') {
```

with:

```ts
      } else if (target.id === 'kb-run-sync-board-config-btn') {
        vscode.postMessage({ type: 'run-sync-board-config' });
      } else if (target.id === 'kb-run-configure-ai-btn') {
        vscode.postMessage({ type: 'run-configure-with-ai' });
      } else if (target.id === 'kb-home-btn') {
```

- [ ] **Step 6: Register the command in `package.json`**

In `package.json`, in `contributes.commands`, replace:

```json
      { "command": "kanbrain.checkBoardConfig", "title": "Kanbrain: Check Board Configuration" },
      { "command": "kanbrain.syncBoardConfig", "title": "Kanbrain: Sync Board Configuration" }
```

with:

```json
      { "command": "kanbrain.checkBoardConfig", "title": "Kanbrain: Check Board Configuration" },
      { "command": "kanbrain.syncBoardConfig", "title": "Kanbrain: Sync Board Configuration" },
      { "command": "kanbrain.configureWithAi", "title": "Kanbrain: Configure with AI" }
```

- [ ] **Step 7: Wire it up in `extension.ts`**

In `src/extension.ts`, replace the import block:

```ts
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
```

with:

```ts
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
```

And replace:

```ts
  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
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
  );
```

- [ ] **Step 8: Compile**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 9: Run the full test suite**

Run: `npm run test:unit`
Expected: PASS — every test in the project, including the new `renderHome.test.ts` assertion.

- [ ] **Step 10: Commit**

```bash
git add src/extension.ts package.json src/view/renderHome.ts src/view/renderHome.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: wire the Configure with AI command into the extension and Home screen"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the command in the Setup section**

In `README.md`, in the paragraph starting with "If the project's process changes later..." (currently around line 61), add a new paragraph right after it:

```markdown

If you're not sure how to map the project's real process onto Kanbrain — especially if the team thinks in terms of board columns rather than raw statuses — run **Kanbrain: Configure with AI** (also available as a button on the Home screen). It reads the project's real backlog levels/types/statuses *and* board columns, writes a context file explaining the difference between the two, and hands it to the agent in the integrated terminal, which asks how you want it to work and then edits `.kanbrain/config.json`/`.kanbrain/skills/*.md` for you (and, only if you ask it to, reconfigures the real Azure DevOps board using its own tools — Kanbrain itself never writes to Azure DevOps).
```

- [ ] **Step 2: Update the Home screen's Commands section description**

In the "The panel has three screens." paragraph (currently around line 63), replace:

```markdown
**Commands** (Setup, Check Board Configuration, Sync Board Configuration)
```

with:

```markdown
**Commands** (Setup, Check Board Configuration, Sync Board Configuration, Configure with AI)
```

- [ ] **Step 3: Add manual verification checklist items**

In the "## Manual verification checklist" section, add these items right after the existing `Kanbrain: Sync Board Configuration` item (currently the line starting with "After renaming/adding/removing a status..."):

```markdown
- [ ] `Kanbrain: Configure with AI` (command palette or the Home screen's "🤖 Configure with AI" button) opens/reuses the "Kanbrain" terminal and sends a read command for a new `.kanbrain/generated/setup-assistant-<timestamp>.md` file.
- [ ] That generated file lists the project's real backlog levels, work item types, and statuses (with categories), and, separately, the team's real boards and columns (with each column's state mappings by work item type) — or a "No boards were found" note if the team has none.
- [ ] Running `Kanbrain: Configure with AI` before `Kanbrain: Setup` has created `.kanbrain/config.json` shows an inline error ("No project configured. Run Kanbrain: Setup.") instead of failing silently or crashing.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Configure with AI command"
```

---

## Final Verification

- [ ] Run `npm run compile` — no errors.
- [ ] Run `npm run test:unit` — full suite passes.
- [ ] Walk the new items in the README manual verification checklist by hand in an Extension Development Host (press F5) against a real Azure DevOps organization.
