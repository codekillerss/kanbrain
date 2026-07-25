# Detail Panel Tab Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the VS Code editor tabs for card details and pull request details panels a distinct icon each, instead of the generic webview icon.

**Architecture:** Two new static SVG assets under `media/icons/`. Both panel managers (`WorkItemDetailPanelManager`, `PullRequestDetailPanelManager`) receive `extensionUri` via constructor and set `panel.iconPath` to the corresponding asset right after `createWebviewPanel`. `extension.ts` passes `context.extensionUri` when instantiating both managers.

**Tech Stack:** VS Code Extension API (`vscode.window.createWebviewPanel`, `vscode.Uri.joinPath`), TypeScript, no test framework for this layer (see Global Constraints).

## Global Constraints

- Icons are static/generic per panel type — not per work-item-type, not per PR state. (Spec: "Ícone fixo e genérico por tipo de painel")
- Icon size: 16×16, matching `media/icon.svg`. (Spec: "Novos assets")
- Fixed colors, no `currentColor` — editor tabs don't recolor `iconPath` by theme. Work-item icon: `#0078D4`. Pull-request icon: `#8250DF`. (Spec: "Novos assets")
- `media/icons/pull-request.svg` reuses the exact path/shape from `renderPullRequestIcon()` in `src/view/renderDevelopment.ts:12`, with `currentColor` replaced by the fixed color. (Spec: "Novos assets")
- No changes to `renderWorkItemDetail.ts`, `renderPullRequestDetail.ts`, or webview CSS — this only affects the VS Code editor tab icon. (Spec: "Fora do escopo")
- No light/dark icon variants. (Spec: "Fora do escopo")
- `WorkItemDetailPanelManager` and `PullRequestDetailPanelManager` have no automated test suite today — verification is `npm run compile` (type-check) plus manual run via F5. (Spec: "Testes", matches `docs/superpowers/specs/2026-07-23-detail-panel-polling-design.md`)

---

### Task 1: Add the two SVG icon assets

**Files:**
- Create: `media/icons/work-item.svg`
- Create: `media/icons/pull-request.svg`

**Interfaces:**
- Produces: two files at fixed paths, consumed by Task 2 and Task 3 via `vscode.Uri.joinPath(extensionUri, 'media', 'icons', 'work-item.svg')` and `'pull-request.svg'`.

- [ ] **Step 1: Create `media/icons/work-item.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
  <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#0078D4" stroke-width="1.2"/>
  <rect x="3.5" y="3.5" width="3" height="9" fill="#0078D4"/>
  <rect x="9.5" y="3.5" width="3" height="5" fill="#0078D4"/>
</svg>
```

- [ ] **Step 2: Create `media/icons/pull-request.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
  <circle cx="6" cy="18" r="2.5" stroke="#8250DF" stroke-width="2" fill="none"/>
  <circle cx="18" cy="6" r="2.5" stroke="#8250DF" stroke-width="2" fill="none"/>
  <path d="M6 15.5V9a3 3 0 0 1 3-3h6" stroke="#8250DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 3l4 3-4 3" stroke="#8250DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

- [ ] **Step 3: Verify both files are valid, well-formed SVG**

Run: `node -e "require('fs').readFileSync('media/icons/work-item.svg','utf8'); require('fs').readFileSync('media/icons/pull-request.svg','utf8'); console.log('ok')"`
Expected: prints `ok` (files exist and are readable; this is just an existence/readability check, not XML validation — visually confirm the markup above was pasted verbatim).

- [ ] **Step 4: Commit**

```bash
git add media/icons/work-item.svg media/icons/pull-request.svg
git commit -m "feat: add tab icon assets for card and PR detail panels"
```

---

### Task 2: Set `iconPath` on `WorkItemDetailPanelManager`

**Files:**
- Modify: `src/view/WorkItemDetailPanelManager.ts:20-45`

**Interfaces:**
- Consumes: `media/icons/work-item.svg` from Task 1.
- Produces: `WorkItemDetailPanelManager` constructor signature becomes `constructor(workspaceRoot: string, client: AzureDevOpsClient, extensionUri: vscode.Uri)` — Task 4 depends on this exact parameter order.

- [ ] **Step 1: Add `extensionUri` to the constructor**

In `src/view/WorkItemDetailPanelManager.ts`, change:

```ts
  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}
```

to:

```ts
  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
    private readonly extensionUri: vscode.Uri,
  ) {}
```

- [ ] **Step 2: Set `panel.iconPath` right after `createWebviewPanel` in `open()`**

In the same file, change:

```ts
    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${id}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.checkoutBranch',
        'kanbrain.openPullRequestDetail',
        'kanbrain.resolveRepositoryTag',
      ],
    });
    this.panels.set(id, panel);
```

to:

```ts
    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${id}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.checkoutBranch',
        'kanbrain.openPullRequestDetail',
        'kanbrain.resolveRepositoryTag',
      ],
    });
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'work-item.svg');
    this.panels.set(id, panel);
```

- [ ] **Step 3: Type-check**

Run: `npm run compile`
Expected: FAILS — `extension.ts:36` still calls `new WorkItemDetailPanelManager(workspaceRoot, client)` with only two arguments, missing the new required `extensionUri` parameter (TS2554: Expected 3 arguments, but got 2).

This confirms the constructor change actually took effect and TypeScript is enforcing the new signature. Task 4 fixes this call site.

- [ ] **Step 4: Commit**

```bash
git add src/view/WorkItemDetailPanelManager.ts
git commit -m "feat: set tab icon on work item detail panel"
```

---

### Task 3: Set `iconPath` on `PullRequestDetailPanelManager`

**Files:**
- Modify: `src/view/PullRequestDetailPanelManager.ts:12-68`

**Interfaces:**
- Consumes: `media/icons/pull-request.svg` from Task 1.
- Produces: `PullRequestDetailPanelManager` constructor signature becomes `constructor(workspaceRoot: string, client: AzureDevOpsClient, extensionUri: vscode.Uri)` — Task 4 depends on this exact parameter order.

- [ ] **Step 1: Add `extensionUri` to the constructor**

In `src/view/PullRequestDetailPanelManager.ts`, change:

```ts
  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}
```

to:

```ts
  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
    private readonly extensionUri: vscode.Uri,
  ) {}
```

- [ ] **Step 2: Set `panel.iconPath` right after `createWebviewPanel` in `open()`**

In the same file, change:

```ts
    const panel = vscode.window.createWebviewPanel('kanbrain.pullRequestDetail', `PR #${pullRequestId}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.openPullRequestDetail',
        'kanbrain.pickWorkItem',
        'kanbrain.checkoutBranch',
        'kanbrain.viewPullRequestDiff',
        'kanbrain.resolveRepositoryTag',
        'workbench.extensions.search',
      ],
    });
    this.panels.set(key, panel);
```

to:

```ts
    const panel = vscode.window.createWebviewPanel('kanbrain.pullRequestDetail', `PR #${pullRequestId}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.openPullRequestDetail',
        'kanbrain.pickWorkItem',
        'kanbrain.checkoutBranch',
        'kanbrain.viewPullRequestDiff',
        'kanbrain.resolveRepositoryTag',
        'workbench.extensions.search',
      ],
    });
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'pull-request.svg');
    this.panels.set(key, panel);
```

- [ ] **Step 3: Type-check**

Run: `npm run compile`
Expected: FAILS — `extension.ts:37` still calls `new PullRequestDetailPanelManager(workspaceRoot, client)` with only two arguments (TS2554: Expected 3 arguments, but got 2), same reason as Task 2. Task 4 fixes both call sites.

- [ ] **Step 4: Commit**

```bash
git add src/view/PullRequestDetailPanelManager.ts
git commit -m "feat: set tab icon on pull request detail panel"
```

---

### Task 4: Wire `context.extensionUri` through `extension.ts`

**Files:**
- Modify: `src/extension.ts:36-37`

**Interfaces:**
- Consumes: `WorkItemDetailPanelManager` and `PullRequestDetailPanelManager` constructors from Task 2 and Task 3 (`(workspaceRoot, client, extensionUri)`).

- [ ] **Step 1: Pass `context.extensionUri` to both managers**

In `src/extension.ts`, change:

```ts
  const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client) : undefined;
  const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client) : undefined;
```

to:

```ts
  const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;
  const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;
```

- [ ] **Step 2: Type-check**

Run: `npm run compile`
Expected: PASSES with no errors — both constructor call sites now match the 3-argument signatures from Task 2 and Task 3.

- [ ] **Step 3: Run the unit test suite to confirm no regressions elsewhere**

Run: `npm run test:unit`
Expected: PASSES — this change doesn't touch any tested module (`renderWorkItemDetail.ts`, `renderPullRequestDetail.ts`, etc. are untouched), so all existing tests should be unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: pass extensionUri to detail panel managers"
```

- [ ] **Step 5: Manual verification (F5)**

Press F5 to launch the Extension Development Host. Open a card (work item) via the Kanbrain sidebar — confirm its editor tab shows the blue card icon instead of the generic webview icon. Open a pull request — confirm its editor tab shows the purple pull-request icon. Switch VS Code between a light theme and a dark theme (`Ctrl+K Ctrl+T`) and confirm both icons stay legible in both.

---

## Self-Review Notes

- **Spec coverage:** static per-panel-type icons (Task 1, 2, 3) ✓; `panel.iconPath` set on creation (Task 2, 3) ✓; `extensionUri` threading (Task 2, 3, 4) ✓; fixed colors `#0078D4`/`#8250DF`, 16×16, no light/dark variants (Task 1) ✓; no changes to renderers/CSS (untouched, confirmed by grep scope above) ✓; manual verification in both themes (Task 4 Step 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step has literal file content or an exact command.
- **Type consistency:** constructor signature `(workspaceRoot: string, client: AzureDevOpsClient, extensionUri: vscode.Uri)` is identical across Task 2, Task 3, and the call sites fixed in Task 4.
