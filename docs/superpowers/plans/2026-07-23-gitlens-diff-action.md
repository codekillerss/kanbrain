# GitLens PR Diff Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "View Diff" action to the PR detail panel that opens GitLens's Search & Compare view for the PR's source→target branches, falling back to an "Install GitLens" suggestion when GitLens isn't installed.

**Architecture:** `PullRequestDetailPanelManager` detects the GitLens extension (`eamodio.gitlens`) synchronously via `vscode.extensions.getExtension`, resolves+caches its icon as a base64 data URI, and passes `gitLensIconDataUri: string | null` into the existing pure `renderPullRequestDetail` render function, which conditionally emits either a "View Diff" button (calls a new `kanbrain.viewPullRequestDiff` command) or an "Install GitLens" link (calls the built-in `workbench.extensions.search` command). The new command shells out to GitLens's own `gitlens.compareWith` command.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- Command URIs in webviews only work for commands present in that panel's `enableCommandUris` allowlist (`enableScripts: false` throughout — no other way to trigger commands from the webview).
- PR comment/description text from Azure DevOps is plain text, not HTML — N/A for this plan (no new comment rendering), noted only because `renderPullRequestDetail.ts` is shared file.
- The two GitLens UI elements ("View Diff" button vs. "Install GitLens" link) must never appear together — controlled by a single `gitLensIconDataUri: string | null` value (non-null = installed, render button; null = not installed, render suggestion).
- `gitlens.compareWith` and `images/gitlens-icon.png` are undocumented internals of the installed `eamodio.gitlens` extension (confirmed present in v18.3.0 via decompilation) — no public API guarantee, but this is an accepted, already-precedented risk in this codebase (same pattern used for `checkoutBranch`).
- TDD: `npx tsc -p ./ --noEmit` then `npx vitest run` before every commit.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Render the GitLens diff action in `renderPullRequestDetail`

**Files:**
- Modify: `src/view/renderPullRequestDetail.ts`
- Modify: `src/view/detailPanelCss.ts`
- Test: `src/view/renderPullRequestDetail.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `PullRequestDetailInput.gitLensIconDataUri: string | null` (consumed by Task 3's `PullRequestDetailPanelManager`); HTML with `href="command:kanbrain.viewPullRequestDiff?..."` (consumed by Task 2's command, whose id must match exactly) and `href="command:workbench.extensions.search?..."`.

- [ ] **Step 1: Write the failing tests**

Open `src/view/renderPullRequestDetail.test.ts`. Update the `input()` helper (around line 60-69) to include the new required field:

```ts
function input(overrides: Partial<PullRequestDetailInput> = {}): PullRequestDetailInput {
  return {
    pr: pullRequest(),
    workItems: [],
    config,
    threads: [],
    avatars: {},
    gitLensIconDataUri: null,
    ...overrides,
  };
}
```

Add these two tests at the end of the `describe('renderPullRequestDetail', ...)` block, right before the final closing `});` (after the `'renders multiple threads as separate cards'` test):

```ts
  it('shows a View Diff button with the GitLens icon when GitLens is installed', () => {
    const html = renderPullRequestDetail(input({ gitLensIconDataUri: 'data:image/png;base64,ABC' }));

    expect(html).toContain('View Diff');
    expect(html).toContain('src="data:image/png;base64,ABC"');
    expect(html).not.toContain('Install GitLens');

    const match = html.match(/href="(command:kanbrain\.viewPullRequestDiff\?[^"]+)"/);
    expect(match).not.toBeNull();
    const [, href] = match!;
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['feature/login-fix', 'main']);
  });

  it('shows an Install GitLens suggestion when GitLens is not installed, and no View Diff button', () => {
    const html = renderPullRequestDetail(input({ gitLensIconDataUri: null }));

    expect(html).toContain('Install GitLens to view diffs inline');
    expect(html).not.toContain('View Diff');

    const match = html.match(/href="(command:workbench\.extensions\.search\?[^"]+)"/);
    expect(match).not.toBeNull();
    const [, href] = match!;
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['GitLens']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderPullRequestDetail.test.ts`
Expected: FAIL — `gitLensIconDataUri` missing from type / "View Diff" and "Install GitLens" text not found.

- [ ] **Step 3: Implement the render logic**

In `src/view/renderPullRequestDetail.ts`, add `gitLensIconDataUri` to the `PullRequestDetailInput` interface (after `avatars: Record<string, string>;`, currently line 108):

```ts
export interface PullRequestDetailInput {
  pr: PullRequestDetail;
  workItems: WorkItem[];
  config: KanbrainConfig;
  threads: PullRequestThread[];
  avatars: Record<string, string>;
  gitLensIconDataUri: string | null;
}
```

Add a new function right before `export function renderPullRequestDetail` (i.e. after the `renderLinkedWorkItem` function, before line 103's interface):

```ts
function renderDiffAction(pr: PullRequestDetail, gitLensIconDataUri: string | null): string {
  if (gitLensIconDataUri) {
    const commandArgs = encodeURIComponent(JSON.stringify([pr.sourceBranch, pr.targetBranch]));
    return `<a class="kb-pr-diff-link" href="command:kanbrain.viewPullRequestDiff?${commandArgs}"><img class="kb-pr-gitlens-icon" src="${gitLensIconDataUri}" alt="" /> View Diff</a>`;
  }
  const installArgs = encodeURIComponent(JSON.stringify(['GitLens']));
  return `<a class="kb-pr-web-link" href="command:workbench.extensions.search?${installArgs}">💡 Install GitLens to view diffs inline</a>`;
}
```

Update `renderPullRequestDetail`'s destructuring (currently `const { pr, workItems, config, threads, avatars } = input;`) to:

```ts
  const { pr, workItems, config, threads, avatars, gitLensIconDataUri } = input;
```

And update the header block to add the diff action next to the "Open in browser" link:

```ts
      <a class="kb-pr-web-link" href="${escapeHtml(pr.webUrl)}">Open in browser</a>
      ${renderDiffAction(pr, gitLensIconDataUri)}
```

- [ ] **Step 4: Add CSS**

In `src/view/detailPanelCss.ts`, add these two rules after the existing `.kb-pr-web-link { ... }` rule (currently line 60):

```css
    .kb-pr-diff-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; margin-left: 12px; font-size: 12px; color: var(--vscode-textLink-foreground); text-decoration: none; }
    .kb-pr-diff-link:hover { text-decoration: underline; }
    .kb-pr-gitlens-icon { width: 14px; height: 14px; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc -p ./ --noEmit && npx vitest run src/view/renderPullRequestDetail.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderPullRequestDetail.ts src/view/renderPullRequestDetail.test.ts src/view/detailPanelCss.ts
git commit -m "$(cat <<'EOF'
feat: render GitLens diff button or install suggestion in PR panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `kanbrain.viewPullRequestDiff` command

**Files:**
- Create: `src/commands/viewPullRequestDiff.ts`

**Interfaces:**
- Consumes: nothing from other tasks (calls GitLens's own `gitlens.compareWith` command directly).
- Produces: `registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable`, registering command id `kanbrain.viewPullRequestDiff` with signature `(sourceBranch: string, targetBranch: string) => Promise<void>` — consumed by Task 4 (`extension.ts` registration) and already assumed by Task 1's HTML (`command:kanbrain.viewPullRequestDiff?[sourceBranch, targetBranch]`) and Task 3's `enableCommandUris` allowlist.

No automated test for this file — it's thin VS Code command-registration glue with no branching logic, consistent with every other file in `src/commands/` in this codebase (none have test files).

- [ ] **Step 1: Create the command file**

```ts
import * as vscode from 'vscode';

export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.viewPullRequestDiff', async (sourceBranch: string, targetBranch: string) => {
    await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(workspaceRoot), {
      ref1: targetBranch,
      ref2: sourceBranch,
    });
  });
}
```

Save as `src/commands/viewPullRequestDiff.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc -p ./ --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/viewPullRequestDiff.ts
git commit -m "$(cat <<'EOF'
feat: add kanbrain.viewPullRequestDiff command backed by GitLens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Detect GitLens and resolve its icon in `PullRequestDetailPanelManager`

**Files:**
- Modify: `src/view/PullRequestDetailPanelManager.ts`

**Interfaces:**
- Consumes: `PullRequestDetailInput.gitLensIconDataUri` (Task 1), command id `'kanbrain.viewPullRequestDiff'` (Task 2, string literal only — no import needed since it's referenced only via the `enableCommandUris` allowlist string array).
- Produces: nothing consumed by later tasks — this is the final wiring point.

No automated test for this file — it's VS Code panel-lifecycle glue (webview creation, polling), consistent with the rest of this file having no test coverage today. Verified manually via F5 (see Task 5).

- [ ] **Step 1: Add imports**

At the top of `src/view/PullRequestDetailPanelManager.ts`, after the existing `import * as vscode from 'vscode';` (line 1), add:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
```

- [ ] **Step 2: Add the icon-resolution cache and method**

Add a new private field after `private pollHandle: ReturnType<typeof setInterval> | undefined;` (currently line 14):

```ts
  private gitLensIconDataUriCache: string | null | undefined;
```

Add a new private method after the constructor (currently lines 16-19, right before `async open(...)`):

```ts
  private async resolveGitLensIcon(): Promise<string | null> {
    if (this.gitLensIconDataUriCache !== undefined) {
      return this.gitLensIconDataUriCache;
    }
    const gitlens = vscode.extensions.getExtension('eamodio.gitlens');
    if (!gitlens) {
      this.gitLensIconDataUriCache = null;
      return null;
    }
    try {
      const iconPath = path.join(gitlens.extensionPath, 'images', 'gitlens-icon.png');
      const bytes = await fs.promises.readFile(iconPath);
      this.gitLensIconDataUriCache = `data:image/png;base64,${bytes.toString('base64')}`;
    } catch {
      this.gitLensIconDataUriCache = null;
    }
    return this.gitLensIconDataUriCache;
  }
```

- [ ] **Step 3: Wire it into `loadAndRender`**

In `loadAndRender` (currently lines 66-96), after the line `const avatars = await this.resolveAvatars(threads.flatMap(t => t.comments));` (currently line 86), add:

```ts
    const gitLensIconDataUri = await this.resolveGitLensIcon();
```

Update the `stateKey` line (currently `const stateKey = JSON.stringify({ pr, workItems, threads, avatars });`) to include it so a GitLens install/uninstall during a session triggers a re-render:

```ts
    const stateKey = JSON.stringify({ pr, workItems, threads, avatars, gitLensIconDataUri });
```

Update the final render call (currently `panel.webview.html = this.wrapHtml(renderPullRequestDetail({ pr, workItems, config, threads, avatars }));`) to:

```ts
    panel.webview.html = this.wrapHtml(renderPullRequestDetail({ pr, workItems, config, threads, avatars, gitLensIconDataUri }));
```

- [ ] **Step 4: Add the new commands to the panel's allowlist**

In `open()` (currently lines 21-54), update the `enableCommandUris` array (currently line 36):

```ts
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.openPullRequestDetail',
        'kanbrain.pickWorkItem',
        'kanbrain.checkoutBranch',
        'kanbrain.viewPullRequestDiff',
        'workbench.extensions.search',
      ],
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS, all tests green (this file has no dedicated test suite, so this confirms no regressions elsewhere).

- [ ] **Step 6: Commit**

```bash
git add src/view/PullRequestDetailPanelManager.ts
git commit -m "$(cat <<'EOF'
feat: detect GitLens and pass its icon into the PR detail panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Register the command in `extension.ts`

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable` (Task 2).
- Produces: nothing — terminal wiring task.

- [ ] **Step 1: Import the command**

After the existing `import { registerPickWorkItemCommand } from './commands/pickWorkItem';` (currently line 18), add:

```ts
import { registerViewPullRequestDiffCommand } from './commands/viewPullRequestDiff';
```

- [ ] **Step 2: Register it**

In the `context.subscriptions.push(...)` call (currently lines 57-68), add a new entry after `registerPickWorkItemCommand(provider),`:

```ts
    registerPickWorkItemCommand(provider),
    registerViewPullRequestDiffCommand(workspaceRoot),
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc -p ./ --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "$(cat <<'EOF'
feat: register kanbrain.viewPullRequestDiff command on activation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual verification

**Files:** none (manual QA only).

- [ ] **Step 1: Launch the extension**

Press F5 in VS Code to launch the Extension Development Host with `eamodio.gitlens` installed (already the case in this dev environment).

- [ ] **Step 2: Verify the "View Diff" path**

Open a PR detail panel (`kanbrain.openPullRequestDetail` on a PR with different source/target branches). Confirm a "View Diff" button appears next to "Open in browser" with the real GitLens icon, and NOT the "Install GitLens" link. Click it; confirm GitLens's Search & Compare view opens showing the diff between the PR's source and target branches.

- [ ] **Step 3: Verify the "Install GitLens" path**

Disable the GitLens extension (Extensions view → GitLens → Disable), reload the Extension Development Host window, reopen the same PR panel. Confirm the "💡 Install GitLens to view diffs inline" link appears instead, and NOT the "View Diff" button. Click it; confirm the Extensions view opens pre-filtered to "GitLens". Re-enable GitLens afterward.

- [ ] **Step 4: No commit** (this task produces no code changes).
