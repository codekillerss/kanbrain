# Editar status e assignee na tela Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user change a work item's status and assignee directly from the cards on the Flow screen (main card, parent card, subtask cards), writing back to Azure DevOps — the first write path the Kanbrain extension has ever had.

**Architecture:** Add a `PATCH`-capable write method and an org-wide identity search method to `AzureDevOpsClient`. Extend `renderWorkItemCard` with an `editable` flag that swaps the plain status/assignee rows for click-to-open pickers (status: instant list from already-known data; assignee: debounced search against Azure DevOps). Wire new webview messages in `KanbrainViewProvider` that call the client, then invalidate the existing per-tab card cache and re-render with the real server state (no optimistic UI).

**Tech Stack:** TypeScript, VS Code Extension API, vanilla JS/CSS in a template-string webview, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-flow-status-assignee-editing-design.md`

## Global Constraints

- **Do not implement on `main`.** Create a git worktree/branch for this work before Task 1 (use the `superpowers:using-git-worktrees` skill).
- **Do not commit anything automatically.** Every task below ends with "run the tests, confirm they pass" instead of a git commit step — this overrides this skill's usual "frequent commits" default. Only commit if the user explicitly asks, later, outside this plan.
- Only status (`System.State`) and assignee (`System.AssignedTo`) are editable. No other field, and no screen besides Flow (main/parent/subtask cards).
- No new read API calls for status options — they come from `config.workflowSteps[type]`, already discovered and cached locally.
- Identity search is scoped to the configured `organization`, debounced 300ms client-side.
- A failed write shows `vscode.window.showErrorMessage` and applies no optimistic change — the next `refresh()` shows whatever Azure DevOps actually has.

---

## Task 1: Fix the `Content-Type` override bug in `AzureDevOpsClient`

**Files:**
- Modify: `src/azureDevOps/client.ts:64-87` (`fetchWithAuth`)
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchWithAuth` now lets a caller-supplied `Content-Type` header win over the default `application/json` — required by Task 2's PATCH call, which needs `application/json-patch+json`.

- [ ] **Step 1: Write the failing test**

Add to `src/azureDevOps/client.test.ts` (near the top of the `describe('AzureDevOpsClient', ...)` block, it doesn't matter exactly where):

```ts
  it('lets a caller-supplied Content-Type header override the default application/json', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await client.updateWorkItem('my-org', 'MyProject', 1, [{ op: 'add', path: '/fields/System.State', value: 'Active' }]);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json-patch+json' }) }),
    );
  });
```

This test references `client.updateWorkItem`, which doesn't exist yet — that's intentional, it will also drive Task 2. For this task specifically, the point being verified is the header override; Task 2 adds the method body that makes the request in the first place.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `client.updateWorkItem is not a function` (or a TypeScript error if you run `tsc` first; vitest with esbuild will still fail at runtime with "not a function").

- [ ] **Step 3: Fix the header order and add a minimal `updateWorkItem` stub**

In `src/azureDevOps/client.ts`, inside `fetchWithAuth` (around line 64-73):

```ts
  private async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    const token = await this.deps.getToken();
    const response = await this.deps.fetchImpl(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
```

(Only the `headers` block changes — `'Content-Type'` moves to be the first, overridable entry; `Authorization` stays last so a caller can never accidentally clobber it.)

Add near the top of the file, next to `export interface WorkItemTypeState`:

```ts
export interface JsonPatchOperation {
  op: 'add' | 'remove';
  path: string;
  value?: string;
}
```

Add a new method anywhere among the other `async` methods on `AzureDevOpsClient` (e.g. right after `getWorkItemRawFields`):

```ts
  async updateWorkItem(organization: string, project: string, id: number, ops: JsonPatchOperation[]): Promise<void> {
    await this.request(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(ops) },
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS (including the new test).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: both clean, no regressions elsewhere (nothing else touches `fetchWithAuth`'s header shape).

Do not commit — see Global Constraints.

---

## Task 2: `updateWorkItem` request-shape tests

**Files:**
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.updateWorkItem(organization, project, id, ops)` from Task 1.
- Produces: nothing new — this task only adds coverage for the exact URL/method/body `updateWorkItem` sends, which Task 1 already implements but didn't fully verify.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`:

```ts
  it('PATCHes a work item with a JSON Patch body', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await client.updateWorkItem('my-org', 'MyProject', 482, [{ op: 'add', path: '/fields/System.State', value: 'Active' }]);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitems/482?api-version=7.1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify([{ op: 'add', path: '/fields/System.State', value: 'Active' }]),
      }),
    );
  });

  it('supports a remove op with no value, for unassigning', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await client.updateWorkItem('my-org', 'MyProject', 482, [{ op: 'remove', path: '/fields/System.AssignedTo' }]);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify([{ op: 'remove', path: '/fields/System.AssignedTo' }]) }),
    );
  });
```

- [ ] **Step 2: Run to verify they already pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS immediately — `updateWorkItem` was already implemented in Task 1. This is expected here (Task 1's method existed before its full test coverage did); if either test fails, `updateWorkItem`'s URL/method/body doesn't match this task's expectations and needs fixing, not the test.

Do not commit — see Global Constraints.

---

## Task 3: Identity search — `searchIdentities`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AzureDevOpsClient.searchIdentities(organization: string, query: string): Promise<IdentitySearchResult[]>`, and the exported `IdentitySearchResult` type (`{ id: string; displayName: string; uniqueName: string }`) — Task 6 (`renderIdentityOptions`) and Task 9 (`KanbrainViewProvider.searchIdentities`) both import this type.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`:

```ts
  it('searches identities and maps display name / unique name', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 'id-1', providerDisplayName: 'Jane Doe', isActive: true, isContainer: false, properties: { Account: { $value: 'jane@example.com' } } },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const results = await client.searchIdentities('my-org', 'jane');

    expect(results).toEqual([{ id: 'id-1', displayName: 'Jane Doe', uniqueName: 'jane@example.com' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://vssps.dev.azure.com/my-org/_apis/identities?searchFilter=General&filterValue=jane&api-version=7.1',
      expect.anything(),
    );
  });

  it('filters out inactive and container identities', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 'id-1', providerDisplayName: 'Inactive Person', isActive: false, properties: { Account: { $value: 'x@example.com' } } },
          { id: 'id-2', providerDisplayName: 'A Group', isContainer: true, properties: { Account: { $value: 'group@example.com' } } },
          { id: 'id-3', providerDisplayName: 'Active Person', isActive: true, isContainer: false, properties: { Account: { $value: 'ok@example.com' } } },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const results = await client.searchIdentities('my-org', 'person');

    expect(results).toEqual([{ id: 'id-3', displayName: 'Active Person', uniqueName: 'ok@example.com' }]);
  });

  it('falls back to descriptor when properties.Account is missing, and drops results with neither', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 'id-1', providerDisplayName: 'Has Descriptor', isActive: true, descriptor: 'desc-1' },
          { id: 'id-2', providerDisplayName: 'Has Neither', isActive: true },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const results = await client.searchIdentities('my-org', 'x');

    expect(results).toEqual([{ id: 'id-1', displayName: 'Has Descriptor', uniqueName: 'desc-1' }]);
  });

  it('returns an empty array for a blank query without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const results = await client.searchIdentities('my-org', '   ');

    expect(results).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `client.searchIdentities is not a function`.

- [ ] **Step 3: Implement `searchIdentities`**

In `src/azureDevOps/client.ts`, add near `updateWorkItem`:

```ts
export interface IdentitySearchResult {
  id: string;
  displayName: string;
  uniqueName: string;
}

interface RawIdentity {
  id: string;
  providerDisplayName?: string;
  customDisplayName?: string;
  isActive?: boolean;
  isContainer?: boolean;
  properties?: { Account?: { $value?: string } };
  descriptor?: string;
}
```

And the method itself, alongside `updateWorkItem`:

```ts
  async searchIdentities(organization: string, query: string): Promise<IdentitySearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const data = await this.request<{ value: RawIdentity[] }>(
      `https://vssps.dev.azure.com/${organization}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(trimmed)}&api-version=7.1`,
    );
    return (data.value ?? [])
      .filter(i => i.isActive !== false && !i.isContainer)
      .map(i => ({
        id: i.id,
        displayName: i.providerDisplayName ?? i.customDisplayName ?? 'Unknown',
        uniqueName: i.properties?.Account?.$value ?? i.descriptor ?? '',
      }))
      .filter(i => i.uniqueName);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS.

Do not commit — see Global Constraints.

---

## Task 4: Verify the real `_apis/identities` response shape (manual, not TDD)

This is the spec's flagged risk: Task 3's mapping was written against a best-guess shape. Before building UI on top of it (Tasks 6-9), confirm it against a live Azure DevOps org.

**Files:** none changed by this task unless the shape differs from Task 3's assumption, in which case: `src/azureDevOps/client.ts` (`RawIdentity`, `searchIdentities` mapping) and its tests in `src/azureDevOps/client.test.ts`.

- [ ] **Step 1: Run a one-off authenticated request against a real org**

With the extension running against a real Azure DevOps project (F5 in VS Code, Kanbrain already configured), temporarily add a throwaway command or a `console.log` inside `searchIdentities` (before the `.filter`/`.map` chain) that logs `JSON.stringify(data.value[0], null, 2)` the first time it's called, then trigger it — easiest way: temporarily call `client.searchIdentities(config.organization, 'a')` from anywhere already wired to a button (e.g. inside `runInitialBoardConfigCheck`, one-time), check the Extension Host output channel (`Kanbrain` / `Extension Host` in the Output panel) for the logged shape.

- [ ] **Step 2: Compare against `RawIdentity`**

Check specifically:
- Is the display name field really `providerDisplayName`, or something else (`displayName`, `customDisplayName` alone)?
- Is `properties.Account.$value` present and does it hold an email/unique name? If `properties` doesn't come back at all (some API versions omit it unless a `queryMembership`/expand param is passed), the fallback `descriptor` needs to become the primary source instead.
- Does `isActive`/`isContainer` exist at all, or are inactive/group identities filtered out by the API already?

- [ ] **Step 3: Fix `RawIdentity` and the mapping in `searchIdentities` if the real shape differs**

Update the interface and the `.map(...)` body in `src/azureDevOps/client.ts` to match what was actually observed, and update/add cases in `src/azureDevOps/client.test.ts` (from Task 3) to mock the *real* shape instead of the guessed one.

- [ ] **Step 4: Remove the temporary logging/command**

Delete whatever throwaway `console.log`/command was added in Step 1 — nothing from this step should remain in the diff.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS with the (possibly corrected) shape.

Do not commit — see Global Constraints.

---

## Task 5: `renderWorkItemCard` — `editable` flag and status picker

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Test: `src/view/renderWorkItemCard.test.ts`

**Interfaces:**
- Consumes: `config.workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>>` and `config.statusColors: Record<string, string>` (both already on `KanbrainConfig`), `renderStatusDot(status, statusColors)` (already exists in `./renderStatusDot`).
- Produces: `renderWorkItemCard(..., editable = false)` — an 11th parameter, defaulting to `false` so every existing call site (and every existing test) is unaffected. When `true`, the status row becomes a `.kb-status-picker` with `data-action="toggle-status-picker"` / `data-action="select-status"` buttons.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemCard.test.ts`:

```ts
  it('keeps the plain read-only status row when editable is false (default)', () => {
    const html = renderWorkItemCard(workItem({ status: 'Active' }), config, 'kb-main-card');
    expect(html).not.toContain('kb-status-picker');
    expect(html).toContain('<div class="kb-status-row">');
  });

  it('shows a status picker with one option per known status for the type when editable is true', () => {
    const withTwoStatuses: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: { skillId: 'skill-1' }, Closed: null } },
      statusColors: { Active: 'b2b2b2', Closed: '339933' },
    };
    const html = renderWorkItemCard(workItem({ id: 482, status: 'Active', type: 'Task' }), withTwoStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('kb-status-picker');
    expect(html).toContain('data-action="toggle-status-picker"');
    expect(html).toContain('data-action="select-status" data-id="482" data-status="Active"');
    expect(html).toContain('data-action="select-status" data-id="482" data-status="Closed"');
  });

  it('marks the current status option as active in the picker', () => {
    const withTwoStatuses: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: { skillId: 'skill-1' }, Closed: null } },
    };
    const html = renderWorkItemCard(workItem({ status: 'Closed', type: 'Task' }), withTwoStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    const closedStart = html.indexOf('data-status="Closed"');
    const closedTagStart = html.lastIndexOf('<button', closedStart);
    const activeStart = html.indexOf('data-status="Active"');
    const activeTagStart = html.lastIndexOf('<button', activeStart);
    expect(html.slice(closedTagStart, html.indexOf('>', closedTagStart))).toContain('kb-status-picker-option-active');
    expect(html.slice(activeTagStart, html.indexOf('>', activeTagStart))).not.toContain('kb-status-picker-option-active');
  });

  it('renders an empty status picker menu (no crash) when the type has no known statuses', () => {
    const noStatuses: KanbrainConfig = { ...config, workflowSteps: {} };
    const html = renderWorkItemCard(workItem({ type: 'Bug' }), noStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('kb-status-picker-menu');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: FAIL — `renderWorkItemCard` doesn't accept an 11th argument yet, and none of `kb-status-picker`/`toggle-status-picker`/`select-status` exist in the output.

- [ ] **Step 3: Implement the status picker**

In `src/view/renderWorkItemCard.ts`, add a new function above `renderWorkItemCard`:

```ts
function renderStatusPicker(workItem: WorkItem, config: KanbrainConfig): string {
  const statuses = Object.keys(config.workflowSteps[workItem.type] ?? {});
  const options = statuses
    .map(
      s => `
      <button type="button" class="kb-status-picker-option${s === workItem.status ? ' kb-status-picker-option-active' : ''}" data-action="select-status" data-id="${workItem.id}" data-status="${escapeHtml(s)}">
        ${renderStatusDot(s, config.statusColors ?? {})}${escapeHtml(s)}
      </button>`,
    )
    .join('');
  return `
    <div class="kb-status-picker">
      <button type="button" class="kb-status-row kb-status-picker-trigger" data-action="toggle-status-picker">
        ${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}
      </button>
      <div class="kb-status-picker-menu kb-hidden">${options}</div>
    </div>
  `;
}
```

Update the function signature and the status-row line:

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedTeam: string | undefined = undefined,
  showPickButton = false,
  editable = false,
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const statusHtml = editable
    ? renderStatusPicker(workItem, config)
    : `<div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>`;
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentBadge(workItem.development);
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';

  return `
    <div class="${cssClass}"${borderStyle}>
      ${showPickButton ? renderPickButton(workItem.id) : ''}
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
        <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      </div>
      ${statusHtml}
      ${assigneeHtml}
      ${parentHtml}
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

(The `assigneeHtml` line is untouched here — Task 6 changes it. The diff above only replaces the plain `<div class="kb-status-row">...</div>` line with the `statusHtml` ternary.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: PASS, all tests (old and new).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no other file references the old fixed 10-parameter signature in a way that would break (all other call sites simply don't pass an 11th argument, which is fine since it defaults to `false`).

Do not commit — see Global Constraints.

---

## Task 6: `renderWorkItemCard` — assignee picker

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Test: `src/view/renderWorkItemCard.test.ts`

**Interfaces:**
- Consumes: `renderAvatarOrInitial(displayName, imageUrl, avatars)` (already exported from `./renderAssignee`).
- Produces: when `editable` is `true` and the assignee row would show at all, it becomes a `.kb-assignee-picker` with `data-id="<workItemId>"`, a `data-action="toggle-assignee-picker"` trigger, a `.kb-assignee-search-input`, an "Unassigned" option (`data-action="select-assignee"` with an empty `data-unique-name`), and an empty `.kb-assignee-picker-results` container that Task 9's webview JS fills in.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemCard.test.ts`:

```ts
  it('keeps the plain read-only assignee row when editable is false (default)', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-picker');
    expect(html).toContain('kb-assignee-row');
  });

  it('shows an assignee picker with the current assignee, a search input, and an Unassigned option when editable is true', () => {
    const html = renderWorkItemCard(
      workItem({ id: 482, assignedTo: { displayName: 'Jane Doe', imageUrl: null } }),
      config,
      'kb-main-card',
      true,
      {},
      false,
      null,
      false,
      undefined,
      false,
      true,
    );

    expect(html).toContain('class="kb-assignee-picker" data-id="482"');
    expect(html).toContain('data-action="toggle-assignee-picker"');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('class="kb-input kb-assignee-search-input"');
    expect(html).toContain('data-action="select-assignee" data-id="482" data-unique-name=""');
    expect(html).toContain('kb-assignee-picker-results');
  });

  it('shows "Unassigned" as the trigger label when there is no assignee and editable is true', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: null }), config, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('Unassigned');
  });

  it('omits the assignee picker entirely when showAssignedTo resolves to false, even if editable is true', () => {
    const hiddenConfig: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: false } } } } };
    const html = renderWorkItemCard(workItem(), hiddenConfig, 'kb-main-card', true, {}, false, null, false, 'MyProject Team', false, true);

    expect(html).not.toContain('kb-assignee-picker');
    expect(html).not.toContain('kb-assignee-row');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: FAIL — no `kb-assignee-picker` output yet.

- [ ] **Step 3: Implement the assignee picker**

In `src/view/renderWorkItemCard.ts`, add a new function near `renderStatusPicker`:

```ts
function renderAssigneePicker(workItem: WorkItem, avatars: Record<string, string>): string {
  const current = workItem.assignedTo
    ? `${renderAvatarOrInitial(workItem.assignedTo.displayName, workItem.assignedTo.imageUrl, avatars)}${escapeHtml(workItem.assignedTo.displayName)}`
    : `<span class="kb-avatar-initial">?</span>Unassigned`;
  return `
    <div class="kb-assignee-picker" data-id="${workItem.id}">
      <button type="button" class="kb-assignee-row kb-assignee-picker-trigger" data-action="toggle-assignee-picker">${current}</button>
      <div class="kb-assignee-picker-menu kb-hidden">
        <input type="text" class="kb-input kb-assignee-search-input" data-id="${workItem.id}" placeholder="Search people...">
        <button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItem.id}" data-unique-name="">Unassigned</button>
        <div class="kb-assignee-picker-results"></div>
      </div>
    </div>
  `;
}
```

`renderAvatarOrInitial` needs importing — update the import at the top of the file:

```ts
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';
```

Update the `assigneeHtml` line inside `renderWorkItemCard`:

```ts
  const assigneeHtml = !showAssignedTo ? '' : editable ? renderAssigneePicker(workItem, avatars) : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');
```

(This replaces the `const assigneeHtml = showAssignedTo ? renderAssigneeRow(...) : '';` line from before Task 5's edit.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

Do not commit — see Global Constraints.

---

## Task 7: `renderIdentityOptions` — new file

**Files:**
- Create: `src/view/renderIdentityOptions.ts`
- Test: `src/view/renderIdentityOptions.test.ts`

**Interfaces:**
- Consumes: `IdentitySearchResult` from `../azureDevOps/client` (Task 3).
- Produces: `renderIdentityOptions(results: IdentitySearchResult[], workItemId: number): string` — Task 9's `KanbrainViewProvider.searchIdentities` calls this to build the HTML it posts back to the webview.

- [ ] **Step 1: Write the failing test file**

Create `src/view/renderIdentityOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderIdentityOptions } from './renderIdentityOptions';
import type { IdentitySearchResult } from '../azureDevOps/client';

describe('renderIdentityOptions', () => {
  it('shows a "No matches." message for an empty result list', () => {
    expect(renderIdentityOptions([], 482)).toContain('No matches.');
  });

  it('renders one button per result with the work item id, unique name, and display name', () => {
    const results: IdentitySearchResult[] = [{ id: 'id-1', displayName: 'Jane Doe', uniqueName: 'jane@example.com' }];

    const html = renderIdentityOptions(results, 482);

    expect(html).toContain('data-action="select-assignee"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('data-unique-name="jane@example.com"');
    expect(html).toContain('data-display-name="Jane Doe"');
    expect(html).toContain('>Jane Doe<');
  });

  it('escapes HTML in the display name', () => {
    const results: IdentitySearchResult[] = [{ id: 'id-1', displayName: '<script>Bad</script>', uniqueName: 'bad@example.com' }];

    const html = renderIdentityOptions(results, 482);

    expect(html).not.toContain('<script>Bad</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/view/renderIdentityOptions.test.ts`
Expected: FAIL — the module doesn't exist.

- [ ] **Step 3: Implement `renderIdentityOptions`**

Create `src/view/renderIdentityOptions.ts`:

```ts
import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';

export function renderIdentityOptions(results: IdentitySearchResult[], workItemId: number): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(
      r =>
        `<button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}</button>`,
    )
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/renderIdentityOptions.test.ts`
Expected: PASS.

Do not commit — see Global Constraints.

---

## Task 8: Wire `editable: true` into the Flow screen

**Files:**
- Modify: `src/view/render.ts:159-190` (the three `renderWorkItemCard` calls: parent, main, subtasks)
- Test: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `renderWorkItemCard(..., editable)` (Tasks 5-6).
- Produces: nothing new for later tasks — this is the last piece needed for the pickers to actually show up on screen.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/render.test.ts`:

```ts
  it('shows editable status/assignee pickers on the main card, parent card, and subtasks on the flow screen', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem({ id: 482 }), parent, subtasks, screen: 'flow' });

    expect(html.split('kb-status-picker').length - 1).toBeGreaterThanOrEqual(3);
    expect(html.split('kb-assignee-picker').length - 1).toBeGreaterThanOrEqual(1);
  });
```

Add to `src/view/renderHome.test.ts` (find the existing describe block and add alongside its other tests):

```ts
  it('does not show editable status/assignee pickers (the home card is read-only)', () => {
    const html = renderHome({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('kb-status-picker');
    expect(html).not.toContain('kb-assignee-picker');
  });
```

(Check `renderHome.test.ts`'s existing `workItem`/`config` helper functions and import style before adding this — reuse whatever it already defines rather than redeclaring them.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: FAIL on the new `render.test.ts` assertion (0 pickers found, not >= 3); the `renderHome.test.ts` one should already pass (nothing calls `renderWorkItemCard` with `editable: true` yet) — if it doesn't, something is already wrong, stop and investigate before continuing.

- [ ] **Step 3: Pass `editable: true` from the three Flow-screen call sites**

In `src/view/render.ts`, the parent card call (around line 164):

```ts
    ${renderWorkItemCard(state.parent, state.config, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true, true)}
```

The subtasks call (around line 171):

```ts
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true, true))
```

The main card call (around line 189):

```ts
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam, false, true)}
```

(Each call just gets one more trailing `true` argument. `renderHome.ts`'s single call site is untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: both clean.

Do not commit — see Global Constraints.

---

## Task 9: `KanbrainViewProvider` — message handlers and write methods

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
  - Imports (top of file)
  - `onDidReceiveMessage` if/else chain (around line 197-199, right before the closing brace)
  - New private methods, added right before `private async refresh(): Promise<void> {` (around line 956)

**Interfaces:**
- Consumes: `AzureDevOpsClient.updateWorkItem` (Task 1), `AzureDevOpsClient.searchIdentities` (Task 3), `renderIdentityOptions` (Task 7), the existing `this.cardCache: Map<number, {...}>` and `this.activeWorkItemId: number | undefined` fields (already on the class from the tabs feature).
- Produces: three new webview→extension message types (`select-status`, `search-identities`, `select-assignee`) and one new extension→webview message type (`identity-results`) that Task 10's client-side JS sends/receives.

This class has no dedicated unit tests (an existing, deliberate gap — see the "Testes" section of the spec and every other feature built on this file). Verification here is: it compiles, and it's exercised manually in Task 11.

- [ ] **Step 1: Add the imports**

At the top of `src/view/KanbrainViewProvider.ts`, add alongside the other `./` imports:

```ts
import { renderIdentityOptions } from './renderIdentityOptions';
```

And extend the existing client import (line 5) to also pull in `JsonPatchOperation`:

```ts
// before
import { AzureDevOpsHttpError, type AzureDevOpsClient } from '../azureDevOps/client';
// after
import { AzureDevOpsHttpError, type AzureDevOpsClient, type JsonPatchOperation } from '../azureDevOps/client';
```

- [ ] **Step 2: Add the three new message branches**

In the `onDidReceiveMessage` handler, right before the closing `}` of the if/else chain (after the `set-open-brain-segment` branch):

```ts
      } else if (message.type === 'select-status') {
        await this.updateWorkItemStatus(Number(message.id), String(message.status ?? ''));
      } else if (message.type === 'search-identities') {
        await this.searchIdentities(Number(message.workItemId), String(message.query ?? ''));
      } else if (message.type === 'select-assignee') {
        await this.updateWorkItemAssignee(Number(message.id), message.uniqueName ? String(message.uniqueName) : null);
      }
```

- [ ] **Step 3: Add the four new private methods**

Right before `private async refresh(): Promise<void> {`:

```ts
  private async updateWorkItemStatus(id: number, status: string): Promise<void> {
    if (!this.workspaceRoot || !this.client || !status) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    try {
      await this.client.updateWorkItem(config.organization, config.project, id, [
        { op: 'add', path: '/fields/System.State', value: status },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Could not update status for #${id}: ${message}`);
    }
    this.invalidateActiveCardCache();
  }

  private async updateWorkItemAssignee(id: number, uniqueName: string | null): Promise<void> {
    if (!this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    try {
      const ops: JsonPatchOperation[] = uniqueName
        ? [{ op: 'add', path: '/fields/System.AssignedTo', value: uniqueName }]
        : [{ op: 'remove', path: '/fields/System.AssignedTo' }];
      await this.client.updateWorkItem(config.organization, config.project, id, ops);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Could not update assignee for #${id}: ${message}`);
    }
    this.invalidateActiveCardCache();
  }

  private async searchIdentities(workItemId: number, query: string): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    try {
      const results = await this.client.searchIdentities(config.organization, query);
      this.view.webview.postMessage({ type: 'identity-results', workItemId, html: renderIdentityOptions(results, workItemId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.view.webview.postMessage({
        type: 'identity-results',
        workItemId,
        html: `<div class="kb-empty">Error: ${escapeHtml(message)}</div>`,
      });
    }
  }

  private invalidateActiveCardCache(): void {
    if (this.activeWorkItemId !== undefined) {
      this.cardCache.delete(this.activeWorkItemId);
    }
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: clean. (This step is the real verification for this task — there's no unit test for this class.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (nothing here changes any existing exported behavior — only additive `if/else if` branches and new private methods).

Do not commit — see Global Constraints.

---

## Task 10: Webview JS and CSS — pickers, debounced search, results wiring

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
  - `document.addEventListener('click', ...)` chain (around line 1488-1549)
  - `closeAllSkillPickers` and the outside-click / scroll blocks (around line 1181, 1530-1563)
  - `window.addEventListener('message', ...)` chain (around line 1664+)
  - `css()` method (around line 1797-1850, near `.kb-skill-picker-menu` / `.kb-query-dropdown`)

**Interfaces:**
- Consumes: the `select-status` / `search-identities` / `select-assignee` message types and the `identity-results` response (Task 9); the `data-action`/`data-id`/`data-status`/`data-unique-name` attributes rendered by Tasks 5-6.
- Produces: nothing consumed by a later task — this is the last piece of the feature, verified manually in Task 11.

No automated test — this is inline JS in a template string, same as every other interactive control already in this file (skill picker, query combobox, global skill menu). Verification is manual, in Task 11.

- [ ] **Step 1: Add `closeAllStatusPickers` / `closeAllAssigneePickers` next to `closeAllSkillPickers`**

Right after the existing `function closeAllSkillPickers() { ... }` (around line 1181):

```js
    function closeAllStatusPickers() {
      document.querySelectorAll('.kb-status-picker-menu').forEach((menu) => menu.classList.add('kb-hidden'));
    }

    function closeAllAssigneePickers() {
      document.querySelectorAll('.kb-assignee-picker-menu').forEach((menu) => menu.classList.add('kb-hidden'));
    }
```

- [ ] **Step 2: Add the toggle/select click branches**

Right after the existing `toggle-skill-picker`/`select-skill` branches (after the block ending at line ~1521, before the closing `}` of the big `if`/`else if` chain that starts at `if (target.id === 'kb-toggle-search-btn' ...)`):

```js
      } else if (target.closest && target.closest('[data-action="toggle-status-picker"]')) {
        const picker = target.closest('.kb-status-picker');
        const menu = picker ? picker.querySelector('.kb-status-picker-menu') : null;
        if (menu) {
          const isOpen = !menu.classList.contains('kb-hidden');
          closeAllStatusPickers();
          closeAllAssigneePickers();
          if (!isOpen) {
            const rect = picker.getBoundingClientRect();
            menu.style.left = rect.left + 'px';
            menu.style.top = rect.bottom + 2 + 'px';
            menu.style.minWidth = rect.width + 'px';
            menu.classList.remove('kb-hidden');
          }
        }
      } else if (target.closest && target.closest('[data-action="select-status"]')) {
        const btn = target.closest('[data-action="select-status"]');
        closeAllStatusPickers();
        vscode.postMessage({ type: 'select-status', id: btn.dataset.id, status: btn.dataset.status });
      } else if (target.closest && target.closest('[data-action="toggle-assignee-picker"]')) {
        const picker = target.closest('.kb-assignee-picker');
        const menu = picker ? picker.querySelector('.kb-assignee-picker-menu') : null;
        if (menu) {
          const isOpen = !menu.classList.contains('kb-hidden');
          closeAllStatusPickers();
          closeAllAssigneePickers();
          if (!isOpen) {
            const rect = picker.getBoundingClientRect();
            menu.style.left = rect.left + 'px';
            menu.style.top = rect.bottom + 2 + 'px';
            menu.style.minWidth = rect.width + 'px';
            menu.classList.remove('kb-hidden');
            const input = menu.querySelector('.kb-assignee-search-input');
            if (input) input.focus();
          }
        }
      } else if (target.closest && target.closest('[data-action="select-assignee"]')) {
        const btn = target.closest('[data-action="select-assignee"]');
        closeAllAssigneePickers();
        vscode.postMessage({ type: 'select-assignee', id: btn.dataset.id, uniqueName: btn.dataset.uniqueName });
      }
```

(This is inserted as more `else if` branches in the *same* chain that already has `toggle-skill-picker`/`select-skill` — it must go before that chain's final closing `}`, not after it, since everything above is one `if/else if` statement.)

- [ ] **Step 3: Close status/assignee pickers on outside click and scroll**

Right after the existing `if (!target.closest || !target.closest('.kb-skill-picker')) { closeAllSkillPickers(); }` block (around line 1530):

```js
      if (!target.closest || !target.closest('.kb-status-picker')) {
        closeAllStatusPickers();
      }

      if (!target.closest || !target.closest('.kb-assignee-picker')) {
        closeAllAssigneePickers();
      }
```

And extend the existing scroll handler (around line 1555-1563) — add two lines inside the existing `window.addEventListener('scroll', (event) => { ... }, true)` callback, alongside the existing skill-picker check:

```js
    window.addEventListener('scroll', (event) => {
      if (event.target && event.target.closest && event.target.closest('.kb-global-skill-menu')) {
        return;
      }
      closeAllGlobalSkillMenus();
      if (!(event.target && event.target.closest && event.target.closest('.kb-skill-picker-menu'))) {
        closeAllSkillPickers();
      }
      if (!(event.target && event.target.closest && event.target.closest('.kb-status-picker-menu'))) {
        closeAllStatusPickers();
      }
      if (!(event.target && event.target.closest && event.target.closest('.kb-assignee-picker-menu'))) {
        closeAllAssigneePickers();
      }
    }, true);
```

(These menus use `position: fixed` with a `getBoundingClientRect()`-computed position — same reason `kb-skill-picker-menu` needs the scroll handler: without it, scrolling the subtask list would leave an open picker visually stranded instead of tracking or closing.)

- [ ] **Step 4: Debounced identity search on input**

Add near the other `document.querySelectorAll(...).forEach(...)` wiring blocks (e.g. right after the `kb-workflow-row textarea` block):

```js
    let identitySearchTimer = null;
    document.querySelectorAll('.kb-assignee-search-input').forEach((input) => {
      input.addEventListener('input', () => {
        const workItemId = input.dataset.id;
        const query = input.value;
        clearTimeout(identitySearchTimer);
        identitySearchTimer = setTimeout(() => {
          vscode.postMessage({ type: 'search-identities', workItemId, query });
        }, 300);
      });
    });
```

- [ ] **Step 5: Receive `identity-results`**

In the `window.addEventListener('message', (event) => { ... })` chain, add a branch (anywhere among the existing `else if`s, e.g. right after `saved-queries`):

```js
      } else if (event.data.type === 'identity-results') {
        const results = document.querySelector('.kb-assignee-picker[data-id="' + event.data.workItemId + '"] .kb-assignee-picker-results');
        if (results) results.innerHTML = event.data.html;
```

- [ ] **Step 6: CSS**

In the `css()` method, near the existing `.kb-skill-picker-menu` rule:

```css
      .kb-status-picker, .kb-assignee-picker { position: relative; }
      .kb-status-picker-trigger, .kb-assignee-picker-trigger { cursor: pointer; background: none; border: none; padding: 0; font: inherit; color: inherit; text-align: left; width: 100%; }
      .kb-status-picker-menu, .kb-assignee-picker-menu { position: fixed; z-index: 50; min-width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-status-picker-option, .kb-assignee-picker-option { display: flex; align-items: center; gap: 4px; width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-status-picker-option:hover, .kb-assignee-picker-option:hover { background: var(--vscode-list-hoverBackground); }
      .kb-status-picker-option-active { font-weight: 600; }
      .kb-assignee-picker-menu .kb-assignee-search-input { margin-bottom: 2px; }
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: both clean.

Do not commit — see Global Constraints.

---

## Task 11: Manual end-to-end verification

**Files:** none — this task only runs the extension, no code changes expected unless it surfaces a bug from Tasks 1-10.

- [ ] **Step 1: Launch the extension**

In VS Code, press F5 (or use the `run` skill if available) against a real, already-configured Kanbrain workspace with a live Azure DevOps connection.

- [ ] **Step 2: Status picker — main card**

Open a work item on the Flow screen. Click its status. Confirm: a dropdown opens listing every status known for that type, the current one is visually marked. Pick a different one. Confirm: the dropdown closes, the card shows a loading state or simply updates shortly after (via the refresh triggered by `invalidateActiveCardCache`), and the new status matches what's now in Azure Boards (check in the browser).

- [ ] **Step 3: Status picker — parent and subtask cards**

Repeat Step 2 for the parent card (if the active item has one) and for at least one subtask card. Confirm each edits *that specific* work item, not the main one (check ids in Azure Boards).

- [ ] **Step 4: Assignee picker — search and assign**

Click the assignee on the main card. Type a few characters of a real person's name in your org (not just the configured team — someone outside the team, to confirm this is really an org-wide search). Confirm results appear after a short pause (not on every keystroke). Click a result. Confirm the card updates to show them as assignee, and Azure Boards agrees.

- [ ] **Step 5: Assignee picker — unassign**

Open the assignee picker again on a work item that has an assignee. Click "Unassigned". Confirm the card goes back to showing "Unassigned", and Azure Boards agrees (`AssignedTo` field empty).

- [ ] **Step 6: Error case**

Try a status transition your Azure DevOps process is known to reject (or, if none is known, temporarily test with a bad/impossible status by editing a card's `data-status` via the browser devtools — not realistic, but confirms the failure path). Confirm: an error message appears (`vscode.window.showErrorMessage`), and the status shown on the card reverts to (or simply stays at) the real, unchanged value — no stuck "loading" or wrong value.

- [ ] **Step 7: Home screen unaffected**

Go to the Home screen. Confirm its card still shows plain, non-interactive status/assignee (no picker opens on click) — this screen was deliberately left out of scope.

- [ ] **Step 8: Report results**

If every check in Steps 2-7 passes, the feature is done. If anything fails, fix it as a small follow-up to the specific task that introduced it (don't bundle unrelated fixes), then re-run this task's checklist from the top.

Do not commit — see Global Constraints. Wait for explicit instruction before committing or pushing anything from this plan.
