# Branch tag: Checkout / Compare with Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a branch tag (PR detail, Reviews list, Development page) opens a first modal offering "Checkout" or "Compare with"; Checkout goes through today's existing confirmation, and Compare with lets the user pick a local branch to compare against via GitLens.

**Architecture:** `src/commands/checkoutBranch.ts` is rewritten to show a first action-choice modal, then branch into two independently-confirmed flows. A new git helper `src/git/listBranches.ts` lists local branches for the QuickPick. No render-time (webview HTML) code changes at all — the command's signature (`repositoryId`, `branchName`) is unchanged, so `renderBranchTag()` and its three callers stay untouched.

**Tech Stack:** TypeScript, VS Code extension API (`vscode.window.showWarningMessage`, `showQuickPick`, `commands.executeCommand('gitlens.compareWith', ...)`), Vitest for unit tests, real temp git repos in tests (no mocking of `child_process`).

## Global Constraints

- The "View Diff" button and `kanbrain.viewPullRequestDiff` command are out of scope — do not modify `src/commands/viewPullRequestDiff.ts` or `src/view/renderPullRequestDetail.ts`'s diff-button rendering.
- No changes to `renderBranchTag()` in `src/view/renderRepoBranchTags.ts`, nor to any of its three callers (`renderPullRequestDetail.ts`, `renderReviews.ts`, `renderDevelopment.ts`) — the command signature stays `(repositoryId: string, branchName: string)`.
- Command handler files (`src/commands/*.ts`) import `vscode` directly and have no existing Vitest unit test coverage anywhere in this codebase (only `test/suite/extension.test.ts` smoke-tests command registration via the real extension host). Follow that existing convention: do not introduce a new `vi.mock('vscode', ...)` pattern for `checkoutBranch.ts`. Only the pure git helper (`listLocalBranches`) gets a Vitest test, following the pattern in `src/git/getCurrentBranch.test.ts` / `src/git/cloneRepository.test.ts` (real temp git repos, no mocking).
- Git helper tests use real git in a `fs.mkdtempSync` temp directory, with `git config user.email`/`user.name` set locally before any commit (see `src/git/cloneRepository.test.ts:13-18`).

---

## File Structure

- **Create** `src/git/listBranches.ts` — `listLocalBranches(workspaceRoot: string): Promise<string[]>`, runs `git branch --format=%(refname:short)`, returns trimmed non-empty lines, `[]` on any failure.
- **Create** `src/git/listBranches.test.ts` — Vitest coverage for the helper above.
- **Modify** `src/commands/checkoutBranch.ts` — replace the single-modal checkout flow with the two-modal Checkout/Compare with flow described in the spec (`docs/superpowers/specs/2026-07-31-branch-tag-checkout-compare-design.md`).

No other files change.

---

### Task 1: `listLocalBranches` git helper

**Files:**
- Create: `src/git/listBranches.ts`
- Test: `src/git/listBranches.test.ts`

**Interfaces:**
- Produces: `listLocalBranches(workspaceRoot: string): Promise<string[]>` — resolves to an array of local branch names (e.g. `['main', 'feature/x']`), or `[]` if the directory isn't a git repository or the command fails. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `src/git/listBranches.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listLocalBranches } from './listBranches';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-git-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('listLocalBranches', () => {
  it('returns all local branch names', async () => {
    execFileSync('git', ['init', '-b', 'main'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'initial commit'], { cwd: workspaceRoot });
    execFileSync('git', ['branch', 'feature/x'], { cwd: workspaceRoot });
    execFileSync('git', ['branch', 'feature/y'], { cwd: workspaceRoot });

    const branches = await listLocalBranches(workspaceRoot);

    expect(branches.sort()).toEqual(['feature/x', 'feature/y', 'main']);
  });

  it('returns an empty array when the directory is not a git repository', async () => {
    const branches = await listLocalBranches(workspaceRoot);

    expect(branches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- listBranches`
Expected: FAIL — `Cannot find module './listBranches'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/git/listBranches.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function listLocalBranches(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], { cwd: workspaceRoot });
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- listBranches`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/git/listBranches.ts src/git/listBranches.test.ts
git commit -m "feat: add listLocalBranches git helper"
```

---

### Task 2: Rewrite `checkoutBranch.ts` command with Checkout/Compare with flow

**Files:**
- Modify: `src/commands/checkoutBranch.ts`

**Interfaces:**
- Consumes: `listLocalBranches(workspaceRoot: string): Promise<string[]>` from Task 1 (`src/git/listBranches.ts`); `checkoutBranch(workspaceRoot: string, branchName: string): Promise<void>` from the existing `src/git/checkoutBranch.ts` (unchanged).
- Produces: the `kanbrain.checkoutBranch` command, registered the same way as today (`registerCheckoutBranchCommand(workspaceRoot: string): vscode.Disposable`) — signature and export name unchanged, so `src/extension.ts:82` needs no edit.

There is no automated test for this task (see Global Constraints — command files have no existing Vitest coverage in this codebase). Verification is via `npm run compile` (type safety) and the manual check in Step 3.

- [ ] **Step 1: Replace the command implementation**

Replace the full contents of `src/commands/checkoutBranch.ts` with:

```ts
import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { checkoutBranch } from '../git/checkoutBranch';
import { listLocalBranches } from '../git/listBranches';

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

    const action = await vscode.window.showWarningMessage(`Branch "${branchName}"`, { modal: true }, 'Checkout', 'Compare with');
    if (action === 'Checkout') {
      await handleCheckout(repoEntry.path, branchName);
    } else if (action === 'Compare with') {
      await handleCompare(repoEntry.path, branchName);
    }
  });
}

async function handleCheckout(repoPath: string, branchName: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
  if (confirm !== 'Checkout') {
    return;
  }

  try {
    await checkoutBranch(repoPath, branchName);
    vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
  }
}

async function handleCompare(repoPath: string, branchName: string): Promise<void> {
  const branches = await listLocalBranches(repoPath);
  const otherBranches = branches.filter(b => b !== branchName);
  if (otherBranches.length === 0) {
    vscode.window.showErrorMessage('No other local branches found to compare with.');
    return;
  }

  const picked = await vscode.window.showQuickPick(otherBranches, { placeHolder: `Compare "${branchName}" with...` });
  if (!picked) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(`Compare "${branchName}" with "${picked}"?`, { modal: true }, 'Compare');
  if (confirm !== 'Compare') {
    return;
  }

  try {
    await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoPath), { ref1: picked, ref2: branchName });
  } catch {
    vscode.window.showErrorMessage('GitLens is required to compare branches. Install it from the Extensions view.');
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 3: Manual verification in the Extension Development Host**

This flow depends on interactive VS Code modals (`showWarningMessage`, `showQuickPick`) that can't run under Vitest, and on the real GitLens extension for the compare step — this must be checked by hand, not automated:

1. Press F5 to launch the Extension Development Host (or use the `run` skill if available).
2. Open a work item or PR detail page with a mapped repository that has at least two local branches.
3. Click a branch tag. Confirm the first modal shows exactly two buttons: "Checkout" and "Compare with" (plus the implicit Cancel/close).
4. Choose "Checkout" → confirm the second modal reads `Check out branch "<name>"?` with a "Checkout" button, and that confirming it performs the checkout and shows the "Switched to branch" message (same as before this change).
5. Click the tag again, choose "Compare with" → confirm a QuickPick appears listing the repo's other local branches (not including the clicked one).
6. Pick a branch → confirm a second modal reads `Compare "<clicked>" with "<picked>"?` with a "Compare" button.
7. Confirm it → GitLens's compare view should open for those two branches.
8. Repeat step 5-7 but press Escape at the QuickPick, and again at the final confirm modal — confirm nothing happens (no error, no compare view opens) in both cases.
9. If GitLens is not installed in the dev host (or temporarily disable it), repeat steps 5-7 and confirm an error message appears: "GitLens is required to compare branches. Install it from the Extensions view."
10. On a repo with only one local branch, click that branch's tag and choose "Compare with" — confirm the error "No other local branches found to compare with." appears instead of an empty QuickPick.

- [ ] **Step 4: Commit**

```bash
git add src/commands/checkoutBranch.ts
git commit -m "feat: add Compare with option to branch tag checkout modal"
```

---

## Self-Review Notes

- **Spec coverage:** Modal flow (Task 2), local-branch QuickPick source (Task 1 + Task 2), GitLens-missing and no-other-branches edge cases (Task 2, `handleCompare`), cancel-at-any-step no-op (native VS Code dialog behavior — returns `undefined`, all three call sites check for the expected string and return early otherwise). "View Diff" explicitly left untouched (Global Constraints). No render-time changes anywhere (Global Constraints, confirmed no task touches `renderBranchTag` or its callers).
- **Placeholder scan:** none — both tasks contain full file contents, exact commands, and a fully-enumerated manual test script.
- **Type consistency:** `listLocalBranches(workspaceRoot: string): Promise<string[]>` is defined once in Task 1 and consumed with the same name/signature in Task 2. `checkoutBranch(workspaceRoot: string, branchName: string): Promise<void>` (pre-existing) is reused unchanged.
