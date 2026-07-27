# Configurable repository scan depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `kanbrain.repoScanDepth` setting control how many directory levels below the workspace root `discoverLocalRepositories` scans, so a `<root>/repos/*` layout works without touching `workspaceFolders[0]` or requiring multi-root workspace support.

**Architecture:** `discoverLocalRepositories(workspaceRoot, maxDepth = 1)` becomes a single recursive traversal that both walks directories and checks for `.git` in one pass, stopping at a found repository or at the configured depth. The two call sites (`setup.ts`, `syncBoardConfig.ts`) read the new setting and pass it through; the function itself keeps importing zero `vscode` APIs.

**Tech Stack:** TypeScript, Vitest, VS Code `contributes.configuration`.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-27-repo-scan-depth-design.md` — read it before starting; this plan implements it exactly.
- `maxDepth` defaults to `1` in the function signature itself. Every existing test in `discoverLocalRepositories.test.ts` must keep compiling and passing completely unmodified.
- `discoverLocalRepositories.ts` must not import `vscode` — depth is always passed in by the caller, never read internally.
- `src/commands/setup.ts` and `src/commands/syncBoardConfig.ts` have no existing unit tests (consistent with every other file in `src/commands/`) — their setting-reading changes are verified manually, not with new automated tests.

---

### Task 1: Recursive, depth-limited traversal in `discoverLocalRepositories`

**Files:**
- Modify: `src/git/discoverLocalRepositories.ts`
- Test: `src/git/discoverLocalRepositories.test.ts`

**Interfaces:**
- Produces: `discoverLocalRepositories(workspaceRoot: string, maxDepth?: number): Promise<Map<string, string>>` — same return type as today; `maxDepth` is a new optional parameter, default `1`.

- [ ] **Step 1: Write the failing tests**

Append to `src/git/discoverLocalRepositories.test.ts` (inside the existing `describe('discoverLocalRepositories', ...)` block, after the last `it`):

```ts
  it('finds repositories nested two levels deep when maxDepth is 2', async () => {
    const nestedDir = path.join(workspaceRoot, 'repos', 'ProjectA');
    initRepo(nestedDir, 'https://dev.azure.com/org/proj/_git/ProjectA');

    const result = await discoverLocalRepositories(workspaceRoot, 2);

    expect(result.get('projecta')).toBe(nestedDir);
  });

  it('does not report a repository nested inside an already-found repository', async () => {
    const outerDir = path.join(workspaceRoot, 'outer-repo');
    initRepo(outerDir, 'https://dev.azure.com/org/proj/_git/outer-repo');
    const vendoredDir = path.join(outerDir, 'vendored');
    initRepo(vendoredDir, 'https://dev.azure.com/org/proj/_git/vendored');

    const result = await discoverLocalRepositories(workspaceRoot, 3);

    expect(result.has('outer-repo')).toBe(true);
    expect(result.has('vendored')).toBe(false);
  });

  it('does not find a repository three levels deep when maxDepth is 2', async () => {
    const tooDeepDir = path.join(workspaceRoot, 'repos', 'nested', 'TooDeep');
    initRepo(tooDeepDir, 'https://dev.azure.com/org/proj/_git/TooDeep');

    const result = await discoverLocalRepositories(workspaceRoot, 2);

    expect(result.has('toodeep')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/git/discoverLocalRepositories.test.ts`
Expected: the 3 new tests FAIL (current implementation has no `maxDepth` parameter and only scans one level); the 5 existing tests still PASS unchanged.

- [ ] **Step 3: Implement the recursive traversal**

Replace the full contents of `src/git/discoverLocalRepositories.ts` with:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRemoteUrl } from './getRemoteUrl';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

export async function discoverLocalRepositories(workspaceRoot: string, maxDepth: number = 1): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const remoteUrl = await getRemoteUrl(dir);
      const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
      if (repoName && !result.has(repoName.toLowerCase())) {
        result.set(repoName.toLowerCase(), dir);
      }
      return;
    }
    if (depth >= maxDepth) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '.git') {
        await walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  await walk(workspaceRoot, 0);
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/git/discoverLocalRepositories.test.ts`
Expected: all 8 tests (5 existing + 3 new) PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — in particular any test that imports `discoverLocalRepositories` indirectly should be unaffected since default behavior is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/git/discoverLocalRepositories.ts src/git/discoverLocalRepositories.test.ts
git commit -m "feat: support scanning deeper than one level in discoverLocalRepositories"
```

---

### Task 2: `kanbrain.repoScanDepth` setting, wired into both call sites

**Files:**
- Modify: `package.json`
- Modify: `src/commands/setup.ts:111`
- Modify: `src/commands/syncBoardConfig.ts:62`

**Interfaces:**
- Consumes: `discoverLocalRepositories(workspaceRoot: string, maxDepth?: number): Promise<Map<string, string>>` from Task 1.

- [ ] **Step 1: Add the configuration contribution**

In `package.json`, change:

```json
  "contributes": {
    "commands": [
```

to:

```json
  "contributes": {
    "configuration": {
      "title": "Kanbrain",
      "properties": {
        "kanbrain.repoScanDepth": {
          "type": "number",
          "default": 1,
          "minimum": 1,
          "description": "How many directory levels below the workspace root to scan when auto-discovering local repository paths. 1 (default) scans the root and its direct children only. Increase to 2 to support a <root>/repos/* layout, where project repositories are nested one level deeper than the workspace root."
        }
      }
    },
    "commands": [
```

- [ ] **Step 2: Read the setting in `setup.ts`**

In `src/commands/setup.ts`, change:

```ts
    const azureRepos = await client.listRepositories(orgPick.org.name, projectPick.project.name);
    const localRepos = mapReposPick.map ? await discoverLocalRepositories(workspaceRoot) : new Map<string, string>();
```

to:

```ts
    const azureRepos = await client.listRepositories(orgPick.org.name, projectPick.project.name);
    const repoScanDepth = Math.max(1, vscode.workspace.getConfiguration('kanbrain').get<number>('repoScanDepth', 1));
    const localRepos = mapReposPick.map ? await discoverLocalRepositories(workspaceRoot, repoScanDepth) : new Map<string, string>();
```

- [ ] **Step 3: Read the setting in `syncBoardConfig.ts`**

In `src/commands/syncBoardConfig.ts`, change:

```ts
    const azureRepos = await client.listRepositories(result.config.organization, result.config.project);
    const localRepos = await discoverLocalRepositories(workspaceRoot);
```

to:

```ts
    const azureRepos = await client.listRepositories(result.config.organization, result.config.project);
    const repoScanDepth = Math.max(1, vscode.workspace.getConfiguration('kanbrain').get<number>('repoScanDepth', 1));
    const localRepos = await discoverLocalRepositories(workspaceRoot, repoScanDepth);
```

- [ ] **Step 4: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — `package.json` and the two command files have no unit tests of their own, so this step only confirms Task 1's tests (and everything else) still pass after the call-site changes.

- [ ] **Step 6: Manually verify**

In the Extension Development Host (`F5`):
- Set `kanbrain.repoScanDepth` to `2` in the test workspace's settings (workspace or user settings).
- Create a `<root>/repos/ProjectA` folder with a real git repo (`git init` + `git remote add origin <azure-devops-url>`) whose name matches a repository in your Azure DevOps project.
- Run `Kanbrain: Setup` (or, on an already-configured workspace, `Kanbrain: Sync Board Configuration`).
- Confirm `ProjectA`'s path is discovered and mapped (visible in the Kanbrain panel's Repositories screen, or in the resulting `.kanbrain/config.local.json`).
- Reset the setting to `1` (or remove it) and confirm the same `ProjectA` folder is no longer discovered — proving the default truly matches pre-change behavior.

- [ ] **Step 7: Commit**

```bash
git add package.json src/commands/setup.ts src/commands/syncBoardConfig.ts
git commit -m "feat: add kanbrain.repoScanDepth setting for deeper repository discovery"
```
