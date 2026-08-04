# Set Current Work Item From Card Info Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Set as current work item" (⇄) button to the card info panel's header, visible only when the item being viewed is not already the current work item.

**Architecture:** The card info panel (`WorkItemDetailPanelManager` / `renderWorkItemDetail.ts`) currently has no knowledge of which work item is "current" — that lives privately inside `KanbrainViewProvider`. We expose it via a getter, thread it into `WorkItemDetailPanelManager` through a constructor callback (needed because of construction order in `extension.ts`), fold it into the panel's existing poll-based change detection, and render a `command:` URI anchor in the header (the panel runs with `enableScripts: false`, so it can't use the JS `data-action` button pattern from the Flow screen).

**Tech Stack:** TypeScript, VS Code extension API, vitest for unit tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-card-info-set-current-work-item-design.md`.
- Header-only change. Do not touch the parent/child links in the "Related Work" section (`renderRelatedWork.ts`) — explicitly out of scope.
- No shared/extracted helper for the pick-link markup — follow the existing convention of each render file owning its own copy (there are already three independent variants in the codebase).
- Reuse the existing `.kb-pick-link` CSS class in `src/view/detailPanelCss.ts` — do not add new CSS.
- Reuse the existing `kanbrain.pickWorkItem` command (`src/commands/pickWorkItem.ts`) — do not add a new command.
- `npm run compile` (tsc) must pass after every task.
- `npm run test:unit` (vitest) must pass after every task.

---

### Task 1: Expose the active work item id from `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts:189-199` (right after the existing `setActiveWorkItem` method)

**Interfaces:**
- Produces: `getActiveWorkItemId(): number | undefined` — a public method on `KanbrainViewProvider` returning the current value of the existing private field `activeWorkItemId`. Later tasks call this through a callback.

There is no existing unit test suite for `KanbrainViewProvider.ts` (it's exercised via VS Code integration, not vitest), so this task is verified by type-checking only.

- [ ] **Step 1: Add the getter**

In `src/view/KanbrainViewProvider.ts`, immediately after the closing brace of `setActiveWorkItem` (line 199), add:

```ts
  getActiveWorkItemId(): number | undefined {
    return this.activeWorkItemId;
  }
```

- [ ] **Step 2: Type-check**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: expose active work item id from KanbrainViewProvider"
```

---

### Task 2: Render the pick link in `renderWorkItemDetail.ts`'s header

**Files:**
- Modify: `src/view/renderWorkItemDetail.ts:69-116`
- Test: `src/view/renderWorkItemDetail.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this task is independent — it takes `currentWorkItemId` as a plain input field, the caller decides how to resolve it).
- Produces: `WorkItemDetailInput.currentWorkItemId: number | undefined` — a new required field on the existing `WorkItemDetailInput` interface. Task 3's caller in `WorkItemDetailPanelManager.ts` must supply it on every `renderWorkItemDetail(...)` call.

- [ ] **Step 1: Write the failing tests**

In `src/view/renderWorkItemDetail.test.ts`, update the `input()` helper (lines 32-47) to include the new required field, and add two new test cases inside the `describe('renderWorkItemDetail', ...)` block (after the "Open in browser" test at line 82):

```ts
function input(overrides: Partial<WorkItemDetailInput> = {}): WorkItemDetailInput {
  return {
    workItem: workItem(),
    config,
    description: null,
    groups: [],
    htmlSections: [],
    comments: [],
    avatars: {},
    inlineImages: {},
    prDetails: {},
    parent: null,
    children: [],
    currentWorkItemId: undefined,
    ...overrides,
  };
}
```

```ts
  it('shows a "Set as current work item" link in the header when the item is not the current work item', () => {
    const html = renderWorkItemDetail(input({ workItem: workItem({ id: 482 }), currentWorkItemId: 900 }));

    expect(html).toContain('kb-pick-link');
    expect(html).toContain(`href="command:kanbrain.pickWorkItem?${encodeURIComponent(JSON.stringify([482]))}"`);
    expect(html).toContain('title="Set as current work item"');
  });

  it('omits the "Set as current work item" link when the item is already the current work item', () => {
    const html = renderWorkItemDetail(input({ workItem: workItem({ id: 482 }), currentWorkItemId: 482 }));

    expect(html).not.toContain('kb-pick-link');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: FAIL — `currentWorkItemId` does not exist on type `WorkItemDetailInput`, and the two new assertions fail (no `kb-pick-link` in output yet).

- [ ] **Step 3: Add the field and render the link**

In `src/view/renderWorkItemDetail.ts`, add the field to the interface (lines 69-81):

```ts
export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
  inlineImages: Record<string, string | null>;
  prDetails: Record<string, PullRequestDetails>;
  parent: WorkItem | null;
  children: WorkItem[];
  currentWorkItemId: number | undefined;
}
```

Update the destructure on line 84:

```ts
  const { workItem, config, description, groups, htmlSections, comments, avatars, inlineImages, prDetails, parent, children, currentWorkItemId } = input;
```

Add the pick link right after the "Open in browser" anchor (line 115):

```ts
      <a class="kb-detail-web-link" href="command:kanbrain.openWorkItemInBrowser?${encodeURIComponent(JSON.stringify([workItem.id, workItem.url]))}">Open in browser</a>
      ${workItem.id !== currentWorkItemId ? `<a class="kb-pick-link" href="command:kanbrain.pickWorkItem?${encodeURIComponent(JSON.stringify([workItem.id]))}" title="Set as current work item">&#8644;</a>` : ''}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Type-check**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderWorkItemDetail.ts src/view/renderWorkItemDetail.test.ts
git commit -m "feat: render set-current-work-item link in card info header"
```

---

### Task 3: Wire the active work item id into `WorkItemDetailPanelManager` and `extension.ts`

**Files:**
- Modify: `src/view/WorkItemDetailPanelManager.ts:13-49, 100-156`
- Modify: `src/extension.ts:32-60`

**Interfaces:**
- Consumes: `KanbrainViewProvider.getActiveWorkItemId(): number | undefined` (Task 1); `WorkItemDetailInput.currentWorkItemId: number | undefined` (Task 2).
- Produces: `WorkItemDetailPanelManager` constructor now takes a 4th parameter `getActiveWorkItemId: () => number | undefined`.

There is no existing unit test suite for `WorkItemDetailPanelManager.ts` or `extension.ts` (both are exercised via VS Code integration, not vitest), so this task is verified by type-checking and the full test suite (to catch any accidental regression elsewhere).

- [ ] **Step 1: Add the constructor parameter and store it**

In `src/view/WorkItemDetailPanelManager.ts`, update the constructor (lines 22-26):

```ts
  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
    private readonly extensionUri: vscode.Uri,
    private readonly getActiveWorkItemId: () => number | undefined,
  ) {}
```

- [ ] **Step 2: Allow the pick command through the webview panel's CSP**

In the same file, add `'kanbrain.pickWorkItem'` to the `enableCommandUris` array passed to `vscode.window.createWebviewPanel` (lines 42-48):

```ts
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.checkoutBranch',
        'kanbrain.openPullRequestDetail',
        'kanbrain.resolveRepositoryTag',
        'kanbrain.openWorkItemInBrowser',
        'kanbrain.pickWorkItem',
      ],
```

- [ ] **Step 3: Thread `currentWorkItemId` through `loadAndRender`**

In `loadAndRender` (still `src/view/WorkItemDetailPanelManager.ts`), resolve the value right after `const parent = parentResult[0] ?? null;` (line 114):

```ts
    const parent = parentResult[0] ?? null;
    const currentWorkItemId = this.getActiveWorkItemId();
```

Include it in the `stateKey` object (lines 125-135) so the 5s poll re-renders (and hides the button) when the active work item changes while the panel stays open:

```ts
    const stateKey = JSON.stringify({
      workItem,
      rawFields,
      comments,
      parent,
      children,
      avatars,
      prDetails,
      inlineImages,
      repositories: config.repositories,
      currentWorkItemId,
    });
```

Pass it to `renderWorkItemDetail` (lines 142-156):

```ts
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description,
        groups,
        htmlSections,
        comments,
        avatars,
        inlineImages,
        prDetails,
        parent,
        children,
        currentWorkItemId,
      }),
    );
```

- [ ] **Step 4: Wire the callback in `extension.ts`**

`detailPanelManager` is constructed (line 43) before `provider` (line 46), so it can't take a direct reference to `provider` yet. Use a forward-reference variable. Replace lines 43-60 of `src/extension.ts`:

```ts
  const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;
  const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
    async id => {
      if (detailPanelManager) {
        await detailPanelManager.open(id);
      }
    },
    team => context.workspaceState.update(SELECTED_TEAM_KEY, team),
    context.workspaceState.get<number[]>(WORK_ITEM_HISTORY_KEY, []),
    ids => context.workspaceState.update(WORK_ITEM_HISTORY_KEY, ids),
  );
```

with:

```ts
  let providerRef: KanbrainViewProvider | undefined;

  const detailPanelManager = workspaceRoot && client
    ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri, () => providerRef?.getActiveWorkItemId())
    : undefined;
  const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
    async id => {
      if (detailPanelManager) {
        await detailPanelManager.open(id);
      }
    },
    team => context.workspaceState.update(SELECTED_TEAM_KEY, team),
    context.workspaceState.get<number[]>(WORK_ITEM_HISTORY_KEY, []),
    ids => context.workspaceState.update(WORK_ITEM_HISTORY_KEY, ids),
  );
  providerRef = provider;
```

- [ ] **Step 5: Type-check**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 6: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — all existing tests plus the two added in Task 2, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/view/WorkItemDetailPanelManager.ts src/extension.ts
git commit -m "feat: wire active work item id into the card info panel"
```
