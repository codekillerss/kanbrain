# Repositories Clone Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Clone" button to each repository row on the Repositories page (VS Code webview) that has no local path configured, so the user can clone it directly from Azure DevOps without leaving VS Code.

**Architecture:** `renderRepositories.ts` renders a `Clone` button only for rows where `entry.path` is empty. `KanbrainViewProvider.ts` gets a new webview message handler (`clone-repository`) that reuses the existing `cloneRepository()` git helper (already used by `resolveRepositoryTag.ts`) to pick a destination folder, run `git clone`, persist the resulting path to `.kanbrain/config.json`, and refresh the webview.

**Tech Stack:** TypeScript, VS Code Extension API (webview messaging), Vitest.

## Global Constraints

- Reuse `cloneRepository()` from `src/git/cloneRepository.ts` — do not duplicate the `git clone` invocation.
- Clone URL format is exactly `https://dev.azure.com/{organization}/{encodeURIComponent(project)}/_git/{encodeURIComponent(repoName)}` (matches `src/commands/resolveRepositoryTag.ts:54`).
- Clone button only renders when `entry.path` is falsy/empty — repos with a path already set show only the existing input + browse button.
- No new CSS classes — reuse `.kb-secondary-btn`.

---

### Task 1: Render the Clone button conditionally in `renderRepositories.ts`

**Files:**
- Modify: `src/view/renderRepositories.ts`
- Test: `src/view/renderRepositories.test.ts`

**Interfaces:**
- Consumes: `RenderState` (`src/view/render.ts`), `KanbrainConfig.repositories: Record<string, { name: string; path: string }>` (`src/types.ts`), `escapeHtml` (`src/view/escapeHtml.ts`).
- Produces: HTML row markup with `data-action="clone-repository"` button (consumed by Task 2's webview click listener), scoped inside `.kb-repo-row[data-repository-id="..."]`.

- [ ] **Step 1: Write the failing tests**

Add two new `it` blocks to the end of the `describe('renderRepositories', ...)` block in `src/view/renderRepositories.test.ts`:

```ts
  it('includes a clone button for a repository with no local path', () => {
    const html = renderRepositories(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }) }));
    expect(html).toContain('data-action="clone-repository"');
  });

  it('does not include a clone button for a repository that already has a local path', () => {
    const html = renderRepositories(
      state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } } }) }),
    );
    expect(html).not.toContain('data-action="clone-repository"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderRepositories.test.ts`
Expected: FAIL — the first new test fails because no `data-action="clone-repository"` is emitted (the second new test passes trivially since the button doesn't exist yet at all; that's fine, Step 4's implementation must keep it passing).

- [ ] **Step 3: Implement the conditional button**

In `src/view/renderRepositories.ts`, replace the row template inside the `.map(...)` call:

```ts
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
          ${!entry.path ? '<button type="button" class="kb-secondary-btn" data-action="clone-repository" title="Clone this repository">Clone</button>' : ''}
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderRepositories.test.ts`
Expected: PASS — all 6 tests (4 existing + 2 new) pass.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderRepositories.ts src/view/renderRepositories.test.ts
git commit -m "feat: render clone button for unmapped repositories"
```

---

### Task 2: Wire the Clone button to a webview message handler in `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `data-action="clone-repository"` button + `.kb-repo-row[data-repository-id]` from Task 1's HTML; `readConfig`/`writeConfig` (`src/config/config.ts`, already imported at line 5); `cloneRepository(parentDir: string, cloneUrl: string, repoName: string): Promise<string>` (`src/git/cloneRepository.ts`, new import).
- Produces: nothing consumed by later tasks — this is the final wiring step. No automated test (matches the project's established pattern of no automated tests for VS Code glue in this class — see `pickRepositoryFolder`/`saveRepositoryPath`).

- [ ] **Step 1: Add the import**

In `src/view/KanbrainViewProvider.ts`, add near the top with the other relative imports (after line 5, `import { readConfig, writeConfig } from '../config/config';`):

```ts
import { cloneRepository } from '../git/cloneRepository';
```

- [ ] **Step 2: Register the message handler**

In the `onDidReceiveMessage` callback, add a new branch right after the existing `pick-repository-folder` branch (currently lines 112-113):

```ts
      } else if (message.type === 'pick-repository-folder') {
        await this.pickRepositoryFolder(String(message.repositoryId ?? ''));
      } else if (message.type === 'clone-repository') {
        await this.cloneRepositoryFromView(String(message.repositoryId ?? ''));
      } else if (message.type === 'open-work-item-detail') {
```

- [ ] **Step 3: Implement `cloneRepositoryFromView`**

Add this method right after `pickRepositoryFolder` (currently ends at line 394):

```ts
  private async cloneRepositoryFromView(repositoryId: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    const entry = config?.repositories?.[repositoryId];
    if (!config || !entry) {
      return;
    }

    const parentUris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select destination folder',
    });
    const parentDir = parentUris?.[0]?.fsPath;
    if (!parentDir) {
      return;
    }

    const cloneUrl = `https://dev.azure.com/${config.organization}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(entry.name)}`;

    try {
      const clonedPath = await cloneRepository(parentDir, cloneUrl, entry.name);
      const freshConfig = readConfig(this.workspaceRoot);
      if (freshConfig?.repositories?.[repositoryId]) {
        freshConfig.repositories[repositoryId].path = clonedPath;
        writeConfig(this.workspaceRoot, freshConfig);
      }
      vscode.window.showInformationMessage(`Cloned "${entry.name}" to ${clonedPath}.`);
      this.lastState = '';
      void this.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Clone failed: ${detail}`);
    }
  }
```

- [ ] **Step 4: Wire the click listener in the inline webview script**

In the `document.addEventListener('click', ...)` block inside `wrapHtml()`, add a new branch right after the existing `pick-repository-folder` branch (currently lines 701-705):

```js
      } else if (target.dataset && target.dataset.action === 'pick-repository-folder') {
        const row = target.closest('.kb-repo-row');
        if (row) {
          vscode.postMessage({ type: 'pick-repository-folder', repositoryId: row.dataset.repositoryId });
        }
      } else if (target.dataset && target.dataset.action === 'clone-repository') {
        const row = target.closest('.kb-repo-row');
        if (row) {
          vscode.postMessage({ type: 'clone-repository', repositoryId: row.dataset.repositoryId });
        }
      } else if (target.id === 'kb-search-close-btn') {
```

- [ ] **Step 5: Type-check and run the full test suite**

Run: `npx tsc --noEmit` and `npx vitest run`
Expected: `tsc` reports no errors; all existing Vitest suites still pass (this task adds no new automated tests, per the established pattern for this file).

- [ ] **Step 6: Manual verification (F5)**

Press F5 to launch the Extension Development Host in a workspace with a `.kanbrain/config.json` containing a `repositories` entry with an empty `path`. Open the Kanbrain view → Repositories page. Confirm:
- The repo row with empty path shows a "Clone" button; a row with a path does not.
- Clicking "Clone", picking a destination folder, and completing a real `git clone` updates the row's path input and shows the "Cloned ... to ..." info message.
- Canceling the folder picker does nothing (no error, no message).
- Pointing an existing config at a bad org/project (so the clone URL 404s) shows a "Clone failed: ..." error message and leaves the path empty.

- [ ] **Step 7: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: clone repositories directly from the Repositories page"
```
