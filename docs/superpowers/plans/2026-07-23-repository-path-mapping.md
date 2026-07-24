# Repository Path Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map each Azure DevOps `repositoryId` to a local filesystem path, persisted and editable in `.kanbrain/config.json`, so `checkoutBranch`/`viewPullRequestDiff` operate on the correct clone instead of blindly assuming `workspaceRoot` is the right repo.

**Architecture:** `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` discover local clones (scan `workspaceRoot` + its first-level subdirectories for `.git`, read each remote) and match them by name against the project's Azure DevOps repositories, writing `KanbrainConfig.repositories: Record<repositoryId, {name, path}>`. A new "Repositories" screen on the Home view lets the user view/edit each path directly. `checkoutBranch`/`viewPullRequestDiff` read `config.repositories[repositoryId].path` synchronously — no runtime scanning, no API calls in that path.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- `repositories` is keyed by `repositoryId` (stable GUID), not repo name (which can be renamed).
- Sync never overwrites a `path` the user already set (empty string `''` means "not yet mapped" and is the only value sync will overwrite).
- Local clone paths are stored **absolute** (unlike skill file paths, which are relative to `workspaceRoot` — a repo clone can live outside the workspace entirely).
- `checkoutBranch`/`viewPullRequestDiff` must never fall back to guessing `workspaceRoot` — missing path means a clear error message pointing at the Repositories page, no git command runs.
- TDD: `npx tsc -p ./ --noEmit` then `npx vitest run` before every commit.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- This branch is `feature/repository-path-mapping` (already created and checked out) — do not switch branches mid-plan.

---

### Task 1: `extractRepoNameFromRemoteUrl` + `repositories` type

**Files:**
- Create: `src/git/extractRepoNameFromRemoteUrl.ts`
- Test: `src/git/extractRepoNameFromRemoteUrl.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractRepoNameFromRemoteUrl(remoteUrl: string): string | null` (consumed by Task 2's `discoverLocalRepositories`); `KanbrainConfig.repositories?: Record<string, RepositoryPathEntry>` and `RepositoryPathEntry { name: string; path: string }` (consumed by every later task).

`src/git/isSameRepository.ts` is **not** touched or deleted yet — it still has its only caller (`checkoutBranch.ts`) until Task 7. This task only adds new code.

- [ ] **Step 1: Write the failing test**

Create `src/git/extractRepoNameFromRemoteUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

describe('extractRepoNameFromRemoteUrl', () => {
  it('extracts the repo name from an HTTPS remote URL', () => {
    expect(extractRepoNameFromRemoteUrl('https://codekillers@dev.azure.com/codekillers/Code%20Killers/_git/kanbrain')).toBe('kanbrain');
  });

  it('extracts the repo name from an SSH remote URL', () => {
    expect(extractRepoNameFromRemoteUrl('git@ssh.dev.azure.com:v3/codekillers/Code Killers/kanbrain')).toBe('kanbrain');
  });

  it('strips a trailing .git suffix', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain.git')).toBe('kanbrain');
  });

  it('strips a trailing slash', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/kanbrain/')).toBe('kanbrain');
  });

  it('decodes a URL-encoded space in the repo name', () => {
    expect(extractRepoNameFromRemoteUrl('https://dev.azure.com/codekillers/Code%20Killers/_git/my%20repo')).toBe('my repo');
  });

  it('returns null for an empty string', () => {
    expect(extractRepoNameFromRemoteUrl('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/git/extractRepoNameFromRemoteUrl.test.ts`
Expected: FAIL — cannot find module `./extractRepoNameFromRemoteUrl`.

- [ ] **Step 3: Write the implementation**

Create `src/git/extractRepoNameFromRemoteUrl.ts`:

```ts
export function extractRepoNameFromRemoteUrl(remoteUrl: string): string | null {
  const lastSegment = decodeURIComponent(remoteUrl.trim())
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .split(/[/:]/)
    .pop();
  return lastSegment || null;
}
```

- [ ] **Step 4: Add the `repositories` field to `KanbrainConfig`**

In `src/types.ts`, after the `CardFieldSettings` interface (currently ending at line 76), add:

```ts
export interface RepositoryPathEntry {
  name: string;
  path: string;
}
```

Then add a field to `KanbrainConfig` (currently lines 78-90), right after `taskBacklogTypesByTeam?: Record<string, string[]>;`:

```ts
  repositories?: Record<string, RepositoryPathEntry>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/git/extractRepoNameFromRemoteUrl.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/git/extractRepoNameFromRemoteUrl.ts src/git/extractRepoNameFromRemoteUrl.test.ts src/types.ts
git commit -m "$(cat <<'EOF'
feat: add extractRepoNameFromRemoteUrl and the repositories config field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `discoverLocalRepositories`

**Files:**
- Create: `src/git/discoverLocalRepositories.ts`
- Test: `src/git/discoverLocalRepositories.test.ts`

**Interfaces:**
- Consumes: `extractRepoNameFromRemoteUrl(remoteUrl: string): string | null` (Task 1); existing `getRemoteUrl(path: string): Promise<string | null>` (`src/git/getRemoteUrl.ts`, unchanged).
- Produces: `discoverLocalRepositories(workspaceRoot: string): Promise<Map<string, string>>` — keys are lowercased repo names, values are absolute paths. Consumed by Task 6 (Setup) and Task 5 (Sync).

- [ ] **Step 1: Write the failing test**

Create `src/git/discoverLocalRepositories.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverLocalRepositories } from './discoverLocalRepositories';

let workspaceRoot: string;

function initRepo(dir: string, remoteUrl: string): void {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: dir });
}

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-discover-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('discoverLocalRepositories', () => {
  it('finds a repository at the workspace root itself', async () => {
    initRepo(workspaceRoot, 'https://dev.azure.com/org/proj/_git/kanbrain');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('kanbrain')).toBe(workspaceRoot);
  });

  it('finds repositories in first-level subdirectories', async () => {
    const repoDir = path.join(workspaceRoot, 'other-repo');
    initRepo(repoDir, 'https://dev.azure.com/org/proj/_git/other-repo');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('other-repo')).toBe(repoDir);
  });

  it('ignores subdirectories that are not git repositories', async () => {
    fs.mkdirSync(path.join(workspaceRoot, 'not-a-repo'));

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.size).toBe(0);
  });

  it('ignores repositories nested two levels deep', async () => {
    const nestedDir = path.join(workspaceRoot, 'level1', 'level2');
    initRepo(nestedDir, 'https://dev.azure.com/org/proj/_git/nested');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.has('nested')).toBe(false);
  });

  it('matches repo names case-insensitively via lowercased keys', async () => {
    initRepo(workspaceRoot, 'https://dev.azure.com/org/proj/_git/KanBrain');

    const result = await discoverLocalRepositories(workspaceRoot);

    expect(result.get('kanbrain')).toBe(workspaceRoot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/git/discoverLocalRepositories.test.ts`
Expected: FAIL — cannot find module `./discoverLocalRepositories`.

- [ ] **Step 3: Write the implementation**

Create `src/git/discoverLocalRepositories.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRemoteUrl } from './getRemoteUrl';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

export async function discoverLocalRepositories(workspaceRoot: string): Promise<Map<string, string>> {
  const candidates = [workspaceRoot];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(path.join(workspaceRoot, entry.name));
    }
  }

  const result = new Map<string, string>();
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, '.git'))) {
      continue;
    }
    const remoteUrl = await getRemoteUrl(candidate);
    const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
    if (repoName && !result.has(repoName.toLowerCase())) {
      result.set(repoName.toLowerCase(), candidate);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/git/discoverLocalRepositories.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/git/discoverLocalRepositories.ts src/git/discoverLocalRepositories.test.ts
git commit -m "$(cat <<'EOF'
feat: add discoverLocalRepositories to scan for local git clones

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `AzureDevOpsClient.listRepositories`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: existing `this.request<T>(url)` helper (already used by `getRepository`, same file).
- Produces: `AzureDevOpsClient.listRepositories(organization: string, project: string): Promise<{ id: string; name: string }[]>` — consumed by Task 5 (Sync) and Task 6 (Setup).

- [ ] **Step 1: Write the failing tests**

In `src/azureDevOps/client.test.ts`, add this block right after the existing `describe('AzureDevOpsClient.getRepository', ...)` block (which ends at line 669):

```ts
describe('AzureDevOpsClient.listRepositories', () => {
  it('fetches and maps the project repositories', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ value: [{ id: 'repo-1', name: 'kanbrain' }, { id: 'repo-2', name: 'other-repo' }] }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const repos = await client.listRepositories('my-org', 'MyProject');

    expect(repos).toEqual([
      { id: 'repo-1', name: 'kanbrain' },
      { id: 'repo-2', name: 'other-repo' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns an empty array when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'error' }, false, 500));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const repos = await client.listRepositories('my-org', 'MyProject');

    expect(repos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts -t listRepositories`
Expected: FAIL — `client.listRepositories is not a function`.

- [ ] **Step 3: Implement `listRepositories`**

In `src/azureDevOps/client.ts`, add this method right after `getRepository` (currently ending at line 385, just before the class's closing brace):

```ts
  async listRepositories(organization: string, project: string): Promise<{ id: string; name: string }[]> {
    try {
      const data = await this.request<{ value: { id: string; name: string }[] }>(
        `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1`,
      );
      return data.value.map(r => ({ id: r.id, name: r.name }));
    } catch {
      return [];
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "$(cat <<'EOF'
feat: add AzureDevOpsClient.listRepositories

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `matchRepositoriesToLocalPaths`

**Files:**
- Create: `src/config/matchRepositoriesToLocalPaths.ts`
- Test: `src/config/matchRepositoriesToLocalPaths.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, plain inputs).
- Produces: `matchRepositoriesToLocalPaths(azureRepos: { id: string; name: string }[], localRepos: Map<string, string>): Record<string, RepositoryPathEntry>` — consumed by Task 5 (Sync) and Task 6 (Setup). `RepositoryPathEntry` is imported from `../types` (defined in Task 1).

- [ ] **Step 1: Write the failing test**

Create `src/config/matchRepositoriesToLocalPaths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchRepositoriesToLocalPaths } from './matchRepositoriesToLocalPaths';

describe('matchRepositoriesToLocalPaths', () => {
  it('sets the path when a local repo matches by name', () => {
    const result = matchRepositoriesToLocalPaths(
      [{ id: 'repo-1', name: 'kanbrain' }],
      new Map([['kanbrain', 'C:\\repos\\kanbrain']]),
    );
    expect(result).toEqual({ 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } });
  });

  it('leaves the path empty when no local repo matches', () => {
    const result = matchRepositoriesToLocalPaths([{ id: 'repo-1', name: 'kanbrain' }], new Map());
    expect(result).toEqual({ 'repo-1': { name: 'kanbrain', path: '' } });
  });

  it('matches case-insensitively', () => {
    const result = matchRepositoriesToLocalPaths(
      [{ id: 'repo-1', name: 'KanBrain' }],
      new Map([['kanbrain', 'C:\\repos\\kanbrain']]),
    );
    expect(result['repo-1'].path).toBe('C:\\repos\\kanbrain');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/matchRepositoriesToLocalPaths.test.ts`
Expected: FAIL — cannot find module `./matchRepositoriesToLocalPaths`.

- [ ] **Step 3: Write the implementation**

Create `src/config/matchRepositoriesToLocalPaths.ts`:

```ts
import type { RepositoryPathEntry } from '../types';

export function matchRepositoriesToLocalPaths(
  azureRepos: { id: string; name: string }[],
  localRepos: Map<string, string>,
): Record<string, RepositoryPathEntry> {
  const result: Record<string, RepositoryPathEntry> = {};
  for (const repo of azureRepos) {
    result[repo.id] = { name: repo.name, path: localRepos.get(repo.name.toLowerCase()) ?? '' };
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/config/matchRepositoriesToLocalPaths.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/config/matchRepositoriesToLocalPaths.ts src/config/matchRepositoriesToLocalPaths.test.ts
git commit -m "$(cat <<'EOF'
feat: add matchRepositoriesToLocalPaths

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire repository discovery into Sync

**Files:**
- Modify: `src/config/syncConfig.ts`
- Modify: `src/commands/syncBoardConfig.ts`
- Test: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: `discoverLocalRepositories` (Task 2), `AzureDevOpsClient.listRepositories` (Task 3), `matchRepositoriesToLocalPaths` (Task 4), `RepositoryPathEntry` (Task 1).
- Produces: `syncConfig(...)` gains a new final parameter `freshRepositories: Record<string, RepositoryPathEntry>` — this is the last task that changes `syncConfig`'s signature, no later task depends on further changes to it.

- [ ] **Step 1: Write the failing tests**

In `src/config/syncConfig.test.ts`, every existing call to `syncConfig(...)` passes 8 positional arguments today (config, discoveredStatusesByType, freshStatusColors, freshTypeColors, freshTypeIcons, freshDefaultTeam, freshCardSettingsByTeam, freshTaskBacklogTypesByTeam). Add a 9th argument `{}` to every existing call in the file (there are 12 calls, one per `it(...)` block) so they keep compiling once the signature changes in Step 3 — e.g. the first one becomes:

```ts
    const result = syncConfig(
      config(),
      { Task: { 'To Do': 'Proposed', Done: 'Completed' } },
      { 'To Do': 'new-color' },
      { Task: 'new-color' },
      { Task: '<svg>new</svg>' },
      'MyProject Team',
      { 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } },
      {},
      {},
    );
```

Apply the same trailing `{}` to the other 11 calls (each currently ends its argument list with `'MyProject Team', {}, {})` or similar — add one more `{}` before the closing paren in each).

Then add a new `describe` block at the end of the file, before the final closing (the file currently ends at line 155 with the closing `});` of the top-level `describe('syncConfig', ...)`); add this new top-level block right after it:

```ts
describe('syncConfig repositories', () => {
  it('adds a brand new repository with its auto-matched path', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' },
    });
    expect(result.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } });
  });

  it('preserves a manually-set path even when the fresh scan finds a different one', () => {
    const withPath = config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\manual\\path' } } });
    const result = syncConfig(withPath, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\auto\\found' },
    });
    expect(result.repositories!['repo-1'].path).toBe('D:\\manual\\path');
  });

  it('accepts a fresh auto-match when the existing path is empty', () => {
    const withEmptyPath = config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } });
    const result = syncConfig(withEmptyPath, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\auto\\found' },
    });
    expect(result.repositories!['repo-1'].path).toBe('C:\\auto\\found');
  });

  it('refreshes the name even when the path is preserved', () => {
    const withOldName = config({ repositories: { 'repo-1': { name: 'old-name', path: 'D:\\manual\\path' } } });
    const result = syncConfig(withOldName, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'renamed-repo', path: '' },
    });
    expect(result.repositories!['repo-1']).toEqual({ name: 'renamed-repo', path: 'D:\\manual\\path' });
  });

  it('keeps a repository absent from the fresh scan instead of deleting it', () => {
    const withOrphan = config({ repositories: { 'repo-1': { name: 'gone-repo', path: 'D:\\still\\here' } } });
    const result = syncConfig(withOrphan, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.repositories).toEqual({ 'repo-1': { name: 'gone-repo', path: 'D:\\still\\here' } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsc -p ./ --noEmit`
Expected: FAIL — too many arguments to `syncConfig` (9 passed, 8 expected) in the pre-existing calls, and `result.repositories` does not exist on type `KanbrainConfig` yet in the new block (it does exist from Task 1 — the actual failure here is `syncConfig` not accepting a 9th argument).

- [ ] **Step 3: Implement the merge and update the signature**

In `src/config/syncConfig.ts`, add the import and a new helper function above `syncConfig`:

```ts
import type { KanbrainConfig, SkillEntry, CardFieldSettings, RepositoryPathEntry } from '../types';

function mergeRepositories(
  existing: Record<string, RepositoryPathEntry> | undefined,
  fresh: Record<string, RepositoryPathEntry>,
): Record<string, RepositoryPathEntry> {
  const merged: Record<string, RepositoryPathEntry> = {};
  for (const [id, freshEntry] of Object.entries(fresh)) {
    const existingEntry = existing?.[id];
    merged[id] = { name: freshEntry.name, path: existingEntry?.path || freshEntry.path };
  }
  for (const [id, existingEntry] of Object.entries(existing ?? {})) {
    if (!(id in merged)) {
      merged[id] = existingEntry;
    }
  }
  return merged;
}
```

Update the `syncConfig` function signature to accept the new parameter, and its return object:

```ts
export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
  freshTaskBacklogTypesByTeam: Record<string, string[]>,
  freshRepositories: Record<string, RepositoryPathEntry>,
): KanbrainConfig {
```

(body unchanged down to the `return` statement). Update the `return` statement (currently lines 36-47) to add the new field:

```ts
  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
    repositories: mergeRepositories(config.repositories, freshRepositories),
  };
```

- [ ] **Step 4: Wire discovery into `syncBoardConfig.ts`**

In `src/commands/syncBoardConfig.ts`, add imports at the top:

```ts
import { discoverLocalRepositories } from '../git/discoverLocalRepositories';
import { matchRepositoriesToLocalPaths } from '../config/matchRepositoriesToLocalPaths';
```

After the existing discovery block (currently lines 21-32, ending with `const freshStatusColors = discoverStatusColors(types);`), add:

```ts
    const azureRepos = await client.listRepositories(result.config.organization, result.config.project);
    const localRepos = await discoverLocalRepositories(workspaceRoot);
    const freshRepositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
```

Update the `syncConfig(...)` call (currently lines 35-44) to pass the new argument:

```ts
    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
      freshRepositories,
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/config/syncConfig.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/syncConfig.ts src/config/syncConfig.test.ts src/commands/syncBoardConfig.ts
git commit -m "$(cat <<'EOF'
feat: sync repository path mappings during Kanbrain: Sync Board Configuration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire repository discovery into Setup

**Files:**
- Modify: `src/commands/setup.ts`

**Interfaces:**
- Consumes: `discoverLocalRepositories` (Task 2), `AzureDevOpsClient.listRepositories` (Task 3), `matchRepositoriesToLocalPaths` (Task 4).
- Produces: nothing consumed by later tasks — `writeConfig` output now includes `repositories`.

No automated test — `setup.ts` has no existing test file (VS Code command glue, same established precedent as every other file in `src/commands/`).

- [ ] **Step 1: Add imports**

In `src/commands/setup.ts`, add after the existing `import { writeConfig, ensureGitignoreEntry } from '../config/config';` (currently line 9):

```ts
import { discoverLocalRepositories } from '../git/discoverLocalRepositories';
import { matchRepositoriesToLocalPaths } from '../config/matchRepositoriesToLocalPaths';
```

- [ ] **Step 2: Add the new Setup question and discovery**

In `src/commands/setup.ts`, after the existing `generateFilesPick` question and its guard (currently lines 79-88), add:

```ts
    const mapReposPick = await vscode.window.showQuickPick(
      [
        { label: 'Yes', map: true },
        { label: 'No', map: false },
      ],
      { placeHolder: 'Do you want to map the repositories of this project?' },
    );
    if (!mapReposPick) {
      return;
    }

    const azureRepos = await client.listRepositories(orgPick.org.name, projectPick.project.name);
    const localRepos = mapReposPick.map ? await discoverLocalRepositories(workspaceRoot) : new Map<string, string>();
    const repositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
```

- [ ] **Step 3: Include `repositories` in the written config**

Update the `writeConfig(...)` call (currently lines 106-117) to add the new field:

```ts
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
      taskBacklogTypesByTeam,
      repositories,
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts
git commit -m "$(cat <<'EOF'
feat: ask to map repositories during Kanbrain: Setup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `checkoutBranch.ts` reads the resolved path from config

**Files:**
- Modify: `src/commands/checkoutBranch.ts`
- Modify: `src/extension.ts`
- Delete: `src/git/isSameRepository.ts`
- Delete: `src/git/isSameRepository.test.ts`

**Interfaces:**
- Consumes: `config.repositories?.[repositoryId]` (`RepositoryPathEntry` from Task 1).
- Produces: `registerCheckoutBranchCommand(workspaceRoot: string): vscode.Disposable` — signature drops the `client` parameter it used to take. Consumed by Task 7's own update to `extension.ts` (no other task depends on this signature).

`src/git/getRemoteUrl.ts` is **not** deleted — it's still used by `discoverLocalRepositories` (Task 2). Only `isSameRepository.ts` becomes dead code once this task removes its only caller.

No automated test for `checkoutBranch.ts` — same established precedent as every other file in `src/commands/` (no test file exists for it today either).

- [ ] **Step 1: Rewrite `checkoutBranch.ts`**

Replace the full contents of `src/commands/checkoutBranch.ts`:

```ts
import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { checkoutBranch } from '../git/checkoutBranch';

export function registerCheckoutBranchCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkoutBranch', async (repositoryId: string, branchName: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const repoEntry = config.repositories?.[repositoryId];
    if (!repoEntry?.path) {
      const label = repoEntry?.name ?? 'this repository';
      vscode.window.showErrorMessage(`No local path configured for "${label}". Set it on the Repositories page (Home → Repositories).`);
      return;
    }

    const choice = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
    if (choice !== 'Checkout') {
      return;
    }

    try {
      await checkoutBranch(repoEntry.path, branchName);
      vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
    }
  });
}
```

- [ ] **Step 2: Update the call site in `extension.ts`**

In `src/extension.ts`, change (currently line 66):

```ts
    registerCheckoutBranchCommand(client, workspaceRoot),
```

to:

```ts
    registerCheckoutBranchCommand(workspaceRoot),
```

- [ ] **Step 3: Delete the now-unused `isSameRepository` module**

```bash
rm src/git/isSameRepository.ts src/git/isSameRepository.test.ts
```

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS, all tests green (the deleted test file's cases are already covered by `extractRepoNameFromRemoteUrl.test.ts` from Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/commands/checkoutBranch.ts src/extension.ts src/git/isSameRepository.ts src/git/isSameRepository.test.ts
git commit -m "$(cat <<'EOF'
feat: check out branches using the configured repository path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `viewPullRequestDiff.ts` reads the resolved path from config

**Files:**
- Modify: `src/commands/viewPullRequestDiff.ts`
- Modify: `src/view/renderPullRequestDetail.ts`
- Modify: `src/view/renderPullRequestDetail.test.ts`

**Interfaces:**
- Consumes: `config.repositories?.[repositoryId]` (`RepositoryPathEntry` from Task 1).
- Produces: `kanbrain.viewPullRequestDiff` command now expects args `(repositoryId: string, sourceBranch: string, targetBranch: string)` instead of `(sourceBranch, targetBranch)` — the only caller is `renderPullRequestDetail.ts`, updated in this same task.

- [ ] **Step 1: Update the failing test first**

In `src/view/renderPullRequestDetail.test.ts`, find the test `'shows a View Diff button with the GitLens icon when GitLens is installed'` and change its final assertion from:

```ts
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['feature/login-fix', 'main']);
```

to:

```ts
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['repo-1', 'feature/login-fix', 'main']);
```

(`'repo-1'` matches the `repositoryId` already set by the `pullRequest()` test helper in this file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderPullRequestDetail.test.ts -t "View Diff"`
Expected: FAIL — received `['feature/login-fix', 'main']`, expected `['repo-1', 'feature/login-fix', 'main']`.

- [ ] **Step 3: Update `renderDiffAction` to include `repositoryId`**

In `src/view/renderPullRequestDetail.ts`, change the `renderDiffAction` function (currently lines 103-110):

```ts
function renderDiffAction(pr: PullRequestDetail, gitLensIconDataUri: string | null): string {
  if (gitLensIconDataUri) {
    const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.sourceBranch, pr.targetBranch]));
    return `<a class="kb-pr-diff-link" href="command:kanbrain.viewPullRequestDiff?${commandArgs}"><img class="kb-pr-gitlens-icon" src="${gitLensIconDataUri}" alt="" /> View Diff</a>`;
  }
  const installArgs = encodeURIComponent(JSON.stringify(['GitLens']));
  return `<a class="kb-pr-web-link" href="command:workbench.extensions.search?${installArgs}">💡 Install GitLens to view diffs inline</a>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderPullRequestDetail.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Rewrite `viewPullRequestDiff.ts`**

Replace the full contents of `src/commands/viewPullRequestDiff.ts`:

```ts
import * as vscode from 'vscode';
import { readConfig } from '../config/config';

export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand(
    'kanbrain.viewPullRequestDiff',
    async (repositoryId: string, sourceBranch: string, targetBranch: string) => {
      const config = readConfig(workspaceRoot);
      if (!config) {
        return;
      }

      const repoEntry = config.repositories?.[repositoryId];
      if (!repoEntry?.path) {
        const label = repoEntry?.name ?? 'this repository';
        vscode.window.showErrorMessage(`No local path configured for "${label}". Set it on the Repositories page (Home → Repositories).`);
        return;
      }

      await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoEntry.path), {
        ref1: targetBranch,
        ref2: sourceBranch,
      });
    },
  );
}
```

(The registration call in `extension.ts` — `registerViewPullRequestDiffCommand(workspaceRoot)` — is unchanged; only the inner command handler's runtime argument count changed, not the registration function's own signature.)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/commands/viewPullRequestDiff.ts src/view/renderPullRequestDetail.ts src/view/renderPullRequestDetail.test.ts
git commit -m "$(cat <<'EOF'
feat: open the GitLens diff using the configured repository path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: "Repositories" screen (render layer)

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/renderHome.ts`
- Create: `src/view/renderRepositories.ts`
- Test: `src/view/renderRepositories.test.ts`

**Interfaces:**
- Consumes: `config.repositories?: Record<string, RepositoryPathEntry>` (Task 1) via `RenderState.config`.
- Produces: `renderRepositories(state: RenderState): string` and the `'repositories'` value on `RenderState['screen']` — consumed by Task 10 (`KanbrainViewProvider.ts`, which sets `currentScreen` and wires the live message handlers).

- [ ] **Step 1: Write the failing test**

Create `src/view/renderRepositories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderRepositories } from './renderRepositories';
import type { RenderState } from './render';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'repositories',
    ...overrides,
  };
}

describe('renderRepositories', () => {
  it('shows a message when no repositories are mapped yet', () => {
    const html = renderRepositories(state());
    expect(html).toContain('No repositories mapped yet.');
  });

  it('shows one row per repository with the escaped name and path value', () => {
    const html = renderRepositories(
      state({ config: config({ repositories: { 'repo-1': { name: 'Fix <me>', path: 'C:\\repos\\kanbrain' } } }) }),
    );
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('value="C:\\repos\\kanbrain"');
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('shows an empty path value for an unmapped repository', () => {
    const html = renderRepositories(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }));
    expect(html).toContain('value=""');
  });

  it('includes a browse-folder button per row', () => {
    const html = renderRepositories(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }));
    expect(html).toContain('data-action="pick-repository-folder"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/renderRepositories.test.ts`
Expected: FAIL — cannot find module `./renderRepositories`.

- [ ] **Step 3: Create `renderRepositories.ts`**

```ts
import type { RenderState } from './render';
import { escapeHtml } from './escapeHtml';

export function renderRepositories(state: RenderState): string {
  const config = state.config!;
  const entries = Object.entries(config.repositories ?? {});

  const body = entries.length
    ? entries
        .map(
          ([id, entry]) => `
      <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
        <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
        <div class="kb-config-field-path">
          <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
          <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
        </div>
      </div>
    `,
        )
        .join('')
    : '<div class="kb-empty">No repositories mapped yet. Run Kanbrain: Setup or Kanbrain: Sync Board Configuration to discover them.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Repository Paths</div>
      ${body}
    </div>
  `;
}
```

- [ ] **Step 4: Wire the new screen into `render.ts`**

In `src/view/render.ts`, add `'repositories'` to the `screen` union in `RenderState` (currently `screen: 'home' | 'flow' | 'config';` at line 13):

```ts
  screen: 'home' | 'flow' | 'config' | 'repositories';
```

Add the import at the top (after `import { renderConfig } from './renderConfig';`, currently line 4):

```ts
import { renderRepositories } from './renderRepositories';
```

Add the dispatch branch right after the existing `if (state.screen === 'config') { return renderConfig(state); }` block (currently lines 42-44):

```ts
  if (state.screen === 'repositories') {
    return renderRepositories(state);
  }
```

- [ ] **Step 5: Add the "Repositories" button to the Home screen**

In `src/view/renderHome.ts`, add a new section-card inside the `renderHome` function's returned template, right after the "Configuration" section (currently lines 92-97, the last block before the closing backtick):

```ts
    <div class="kb-section-card">
      <div class="kb-section-label">Configuration</div>
      <div class="kb-home-commands">
        <button id="kb-show-config-btn" class="kb-secondary-btn">🛠️ Configuration</button>
      </div>
    </div>
    <div class="kb-section-card">
      <div class="kb-section-label">Repositories</div>
      <div class="kb-home-commands">
        <button id="kb-show-repositories-btn" class="kb-secondary-btn">📁 Repositories</button>
      </div>
    </div>
  `;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/view/renderRepositories.test.ts src/view/render.test.ts src/view/renderHome.test.ts`
Expected: PASS, no type errors. (`render.test.ts`/`renderHome.test.ts` are pre-existing files — this step confirms the `screen` union widening and the new Home button didn't break anything already covered there.)

- [ ] **Step 7: Commit**

```bash
git add src/view/render.ts src/view/renderHome.ts src/view/renderRepositories.ts src/view/renderRepositories.test.ts
git commit -m "$(cat <<'EOF'
feat: add a Repositories screen showing each repo's configured path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Wire the "Repositories" screen into `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `renderRepositories`/`'repositories'` screen (Task 9, via `render.ts`'s existing dispatch — `KanbrainViewProvider` never calls `renderRepositories` directly, only sets `currentScreen`).
- Produces: nothing consumed by later tasks — this is the final wiring point. No automated test (same established precedent as the rest of this class's VS Code webview glue — verified manually via F5, see Task 11).

- [ ] **Step 1: Add screen navigation**

In `src/view/KanbrainViewProvider.ts`, widen the `currentScreen` field type (currently line 29):

```ts
  private currentScreen: 'home' | 'flow' | 'config' | 'repositories' = 'home';
```

Add a new method right after `showConfigScreen()` (currently lines 146-150):

```ts
  showRepositoriesScreen(): void {
    this.currentScreen = 'repositories';
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 2: Add the save/pick handlers**

Add two new private methods after `pickSkillFile` (currently ending at line 269, right before `private async runSkill`):

```ts
  private saveRepositoryPath(repositoryId: string, newPath: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.repositories?.[repositoryId]) {
      return;
    }
    config.repositories[repositoryId].path = newPath.trim();
    writeConfig(this.workspaceRoot, config);
  }

  private async pickRepositoryFolder(repositoryId: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    const picked = uris?.[0];
    if (!picked) {
      return;
    }
    this.view.webview.postMessage({ type: 'repository-folder-picked', repositoryId, path: picked.fsPath });
  }
```

- [ ] **Step 3: Wire the new message types**

In `resolveWebviewView`'s `onDidReceiveMessage` handler, add three new `else if` branches right before the final `} else if (message.type === 'open-work-item-detail') {` branch (currently lines 92-94):

```ts
      } else if (message.type === 'show-repositories') {
        this.showRepositoriesScreen();
      } else if (message.type === 'save-repository-path') {
        this.saveRepositoryPath(String(message.repositoryId ?? ''), String(message.path ?? ''));
      } else if (message.type === 'pick-repository-folder') {
        await this.pickRepositoryFolder(String(message.repositoryId ?? ''));
      } else if (message.type === 'open-work-item-detail') {
        await this.openWorkItemDetail(Number(message.id));
      }
```

- [ ] **Step 4: Wire the inline webview script**

In `wrapHtml()`'s inline `<script>`, add a helper next to `saveSkillRow` (currently lines 440-450):

```js
    function saveRepositoryRow(row) {
      vscode.postMessage({
        type: 'save-repository-path',
        repositoryId: row.dataset.repositoryId,
        path: row.querySelector('[data-field="path"]').value,
      });
    }

    document.querySelectorAll('.kb-repo-row input[data-field="path"]').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-repo-row');
        if (row) {
          saveRepositoryRow(row);
        }
      });
    });
```

Add two new branches to the `document.addEventListener('click', ...)` handler, right before the `} else if (target.dataset && target.dataset.action === 'pick-skill-file') {` branch (currently lines 543-547):

```js
      } else if (target.id === 'kb-show-repositories-btn') {
        vscode.postMessage({ type: 'show-repositories' });
      } else if (target.dataset && target.dataset.action === 'pick-repository-folder') {
        const row = target.closest('.kb-repo-row');
        if (row) {
          vscode.postMessage({ type: 'pick-repository-folder', repositoryId: row.dataset.repositoryId });
        }
      } else if (target.dataset && target.dataset.action === 'pick-skill-file') {
```

(Keep the existing body of that last branch as-is — only the new branches above it are added.)

Add a handler for the response message in the `window.addEventListener('message', ...)` block, right before the `} else if (event.data.type === 'command-finished') {` branch (currently lines 575-580):

```js
      } else if (event.data.type === 'repository-folder-picked') {
        const rows = document.querySelectorAll('.kb-repo-row');
        for (const row of rows) {
          if (row.dataset.repositoryId === event.data.repositoryId) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveRepositoryRow(row);
            break;
          }
        }
      } else if (event.data.type === 'command-finished') {
```

- [ ] **Step 5: Add CSS**

In `css()`, add after the existing `.kb-config-row { ... }` rule (currently line 661):

```css
      .kb-repo-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-repo-name { font-weight: 600; margin-bottom: 4px; font-size: 12px; }
```

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "$(cat <<'EOF'
feat: wire the Repositories screen into the Kanbrain view (navigate, edit, browse)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Manual verification

**Files:** none (manual QA only).

- [ ] **Step 1: Launch the extension**

Press F5 in VS Code to launch the Extension Development Host, with the workspace open at a folder containing at least one other cloned repo as a sibling directory (matching the real "parent folder of clones" scenario this feature targets).

- [ ] **Step 2: Verify Setup**

Run `Kanbrain: Setup` against a real Azure DevOps project. Confirm the new prompt "Do you want to map the repositories of this project?" appears after the skill-file-generation prompt. Answer "Yes". After setup completes, open `.kanbrain/config.json` and confirm a `repositories` object exists with one entry per project repository, and that any repo matching a locally-cloned sibling folder (by name) has its `path` pre-filled.

- [ ] **Step 3: Verify the Repositories screen**

On the Home screen, click "📁 Repositories". Confirm it navigates to a page listing every repository from `.kanbrain/config.json`, each with its name and a path field. Edit a path field and click elsewhere (blur) — confirm `.kanbrain/config.json` updates with the new value. Click the "…" button on an unmapped repo, pick a folder — confirm the field fills in with the chosen absolute path and `.kanbrain/config.json` updates. Click "🏠 Home" — confirm it returns to the Home screen.

- [ ] **Step 4: Verify branch checkout uses the configured path**

Open a PR or work item's Development section with a branch link for a repository that has a configured path different from the currently open workspace folder. Click the branch — confirm it checks out in the *configured* repository's folder (verify via that folder's actual current branch on disk), not in `workspaceRoot`. Clear the path field for that repository on the Repositories screen, then try checking out a branch for it again — confirm a clear error message appears instead of anything being checked out.

- [ ] **Step 5: Verify the GitLens diff action uses the configured path**

With GitLens installed, open a PR detail panel for a PR whose repository has a configured path. Click "View Diff" — confirm GitLens's Search & Compare opens scoped to that repository, not `workspaceRoot`. Clear that repository's path and try again — confirm a clear error message instead of GitLens opening against the wrong folder.

- [ ] **Step 6: Verify Sync preserves manual edits**

Manually set a repository's path on the Repositories screen to some folder. Run `Kanbrain: Sync Board Configuration`. Confirm that repository's path is unchanged afterward, and any newly-added Azure DevOps repository (not previously in `.kanbrain/config.json`) now appears with an auto-matched or empty path.

- [ ] **Step 7: No commit** (this task produces no code changes).
