# Work Item Detail Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a read-only VS Code editor tab (like opening a file) for a work item, styled after the Azure DevOps work item form — fields grouped per the project's own process layout (with a fixed fallback), description, and a comments/discussion thread — triggered by clicking a card title in the flow screen or a new "View details" link in the search modal.

**Architecture:** Pure data/logic modules (`resolveDetailFields`, `renderWorkItemDetail`) stay framework-free and unit-tested, exactly like the rest of this codebase's `render*.ts` files. A new `WorkItemDetailPanelManager` class (uncovered by unit tests, same convention as `KanbrainViewProvider`) owns the VS Code `WebviewPanel` lifecycle, fetches data via 3 new `AzureDevOpsClient` methods, and renders a fully static webview (no `<script>`, strict CSP) since there's no interactivity in this read-only v1.

**Tech Stack:** TypeScript, vitest, VS Code `WebviewPanel` API.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-20-work-item-detail-tab-design.md` — follow it for every behavioral detail (layout-API-first with fixed fallback, no edit capability, no Attachments/Links/History tabs, no refresh button, images inside description/comments may not load).
- **Declared risk**: the 3 new REST calls (`getWorkItemTypeLayout`, `getWorkItemRawFields`, `getComments`) are implemented from general knowledge of the Azure DevOps API, not verified against a live call in this environment. Code defensively (e.g. `getComments` accepts either a `comments` or `value` response key). A manual F5 smoke test against a real Azure DevOps project is called out at the end of this plan — do not skip it.
- Run `npm run test:unit` (vitest) after every task. Run `npm run compile` (`tsc -p ./`) after every task that touches shared types (all of them, effectively, given how interconnected this feature is).
- Match existing code style: single quotes, `escapeHtml` on every user-controlled string rendered into markup, explicit exported types, template-literal HTML matching each file's existing indentation.
- `WorkItemDetailPanelManager.ts` and the `KanbrainViewProvider.ts`/`extension.ts` wiring have no dedicated unit tests, matching this codebase's established convention for VS Code-API-coupled code — verification for those tasks is `npm run compile` + full `npm run test:unit`.

---

### Task 1: `resolveDetailFields` — layout resolution with fallback

**Files:**
- Create: `src/azureDevOps/workItemDetail.ts`
- Test: `src/azureDevOps/workItemDetail.test.ts`

**Interfaces:**
- Consumes: `AssignedTo` from `src/types.ts`.
- Produces: `WorkItemTypeLayout`, `WorkItemTypeLayoutPage`, `WorkItemTypeLayoutSection`, `WorkItemTypeLayoutGroup`, `WorkItemTypeLayoutControl`, `WorkItemComment`, `DetailField { refName: string; label: string; value: unknown }`, `DetailGroup { label: string | null; fields: DetailField[] }`, `DetailSections { groups: DetailGroup[]; htmlSections: DetailField[] }`, and `resolveDetailFields(layout: WorkItemTypeLayout | null, rawFields: Record<string, unknown>): DetailSections`.

- [ ] **Step 1: Write the failing tests**

Create `src/azureDevOps/workItemDetail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDetailFields, type WorkItemTypeLayout } from './workItemDetail';

describe('resolveDetailFields', () => {
  it('falls back to a fixed field list when layout is null', () => {
    const rawFields = { 'System.State': 'Active', 'System.WorkItemType': 'Task', 'System.AreaPath': 'Proj\\Area' };

    const result = resolveDetailFields(null, rawFields);

    expect(result.groups).toEqual([
      {
        label: null,
        fields: [
          { refName: 'System.State', label: 'State', value: 'Active' },
          { refName: 'System.WorkItemType', label: 'Work Item Type', value: 'Task' },
          { refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' },
        ],
      },
    ]);
    expect(result.htmlSections).toEqual([]);
  });

  it('falls back when the layout has no pages', () => {
    const layout: WorkItemTypeLayout = { pages: [] };

    const result = resolveDetailFields(layout, { 'System.State': 'Active' });

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
  });

  it('omits fallback fields that are absent from rawFields', () => {
    const result = resolveDetailFields(null, { 'System.State': 'Active' });

    expect(result.groups[0].fields).toEqual([{ refName: 'System.State', label: 'State', value: 'Active' }]);
  });

  it('groups layout controls by their group label, in encounter order', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                { label: 'Status', controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] },
                { label: 'Planning', controls: [{ id: 'System.AreaPath', label: 'Area Path', controlType: 'FieldControl' }] },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.State': 'Active', 'System.AreaPath': 'Proj\\Area' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([
      { label: 'Status', fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] },
      { label: 'Planning', fields: [{ refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' }] },
    ]);
  });

  it('uses a null group label for controls with no group label', () => {
    const layout: WorkItemTypeLayout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] }] }] }],
    };

    const result = resolveDetailFields(layout, { 'System.State': 'Active' });

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
  });

  it('separates HtmlFieldControl controls into htmlSections instead of the grid', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                {
                  controls: [
                    { id: 'System.State', label: 'State', controlType: 'FieldControl' },
                    { id: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', controlType: 'HtmlFieldControl' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.State': 'Active', 'Microsoft.VSTS.TCM.ReproSteps': '<p>Steps</p>' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
    expect(result.htmlSections).toEqual([{ refName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', value: '<p>Steps</p>' }]);
  });

  it('excludes System.Title and System.Description from both the grid and htmlSections', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                {
                  controls: [
                    { id: 'System.Title', label: 'Title', controlType: 'FieldControl' },
                    { id: 'System.Description', label: 'Description', controlType: 'HtmlFieldControl' },
                    { id: 'System.State', label: 'State', controlType: 'FieldControl' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.Title': 'A title', 'System.Description': '<p>desc</p>', 'System.State': 'Active' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
    expect(result.htmlSections).toEqual([]);
  });

  it('includes a field row even when the value is missing from rawFields', () => {
    const layout: WorkItemTypeLayout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.Tags', label: 'Tags', controlType: 'FieldControl' }] }] }] }],
    };

    const result = resolveDetailFields(layout, {});

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.Tags', label: 'Tags', value: undefined }] }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/workItemDetail.test.ts`
Expected: FAIL — the module `./workItemDetail` doesn't exist yet.

- [ ] **Step 3: Implement `resolveDetailFields`**

Create `src/azureDevOps/workItemDetail.ts`:

```ts
import type { AssignedTo } from '../types';

export interface WorkItemTypeLayoutControl {
  id: string;
  label: string;
  controlType: string;
}

export interface WorkItemTypeLayoutGroup {
  label?: string;
  controls: WorkItemTypeLayoutControl[];
}

export interface WorkItemTypeLayoutSection {
  groups: WorkItemTypeLayoutGroup[];
}

export interface WorkItemTypeLayoutPage {
  sections: WorkItemTypeLayoutSection[];
}

export interface WorkItemTypeLayout {
  pages: WorkItemTypeLayoutPage[];
}

export interface WorkItemComment {
  id: number;
  text: string;
  createdBy: AssignedTo;
  createdDate: string;
}

export interface DetailField {
  refName: string;
  label: string;
  value: unknown;
}

export interface DetailGroup {
  label: string | null;
  fields: DetailField[];
}

export interface DetailSections {
  groups: DetailGroup[];
  htmlSections: DetailField[];
}

const FALLBACK_FIELDS: { refName: string; label: string }[] = [
  { refName: 'System.State', label: 'State' },
  { refName: 'System.WorkItemType', label: 'Work Item Type' },
  { refName: 'System.AssignedTo', label: 'Assigned To' },
  { refName: 'System.AreaPath', label: 'Area Path' },
  { refName: 'System.IterationPath', label: 'Iteration Path' },
  { refName: 'System.Tags', label: 'Tags' },
  { refName: 'Microsoft.VSTS.Common.Priority', label: 'Priority' },
  { refName: 'System.CreatedBy', label: 'Created By' },
  { refName: 'System.CreatedDate', label: 'Created Date' },
  { refName: 'System.ChangedBy', label: 'Changed By' },
  { refName: 'System.ChangedDate', label: 'Changed Date' },
];

function resolveFallbackFields(rawFields: Record<string, unknown>): DetailField[] {
  return FALLBACK_FIELDS.filter(f => rawFields[f.refName] !== undefined).map(f => ({
    refName: f.refName,
    label: f.label,
    value: rawFields[f.refName],
  }));
}

export function resolveDetailFields(layout: WorkItemTypeLayout | null, rawFields: Record<string, unknown>): DetailSections {
  const controls = (layout?.pages ?? []).flatMap(page =>
    page.sections.flatMap(section =>
      section.groups.flatMap(group => group.controls.map(control => ({ ...control, groupLabel: group.label ?? null }))),
    ),
  );
  const usable = controls.filter(c => c.id !== 'System.Title' && c.id !== 'System.Description');

  if (usable.length === 0) {
    return { groups: [{ label: null, fields: resolveFallbackFields(rawFields) }], htmlSections: [] };
  }

  const htmlSections = usable
    .filter(c => c.controlType === 'HtmlFieldControl')
    .map(c => ({ refName: c.id, label: c.label, value: rawFields[c.id] }));

  const gridControls = usable.filter(c => c.controlType !== 'HtmlFieldControl');
  const order: string[] = [];
  const byGroup = new Map<string, DetailField[]>();
  for (const c of gridControls) {
    const key = c.groupLabel ?? '';
    if (!byGroup.has(key)) {
      order.push(key);
      byGroup.set(key, []);
    }
    byGroup.get(key)!.push({ refName: c.id, label: c.label, value: rawFields[c.id] });
  }

  return { groups: order.map(key => ({ label: key || null, fields: byGroup.get(key)! })), htmlSections };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/workItemDetail.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/workItemDetail.ts src/azureDevOps/workItemDetail.test.ts
git commit -m "feat: resolve work item detail fields from the process layout, with fallback"
```

---

### Task 2: `AzureDevOpsClient` — layout, raw fields, and comments

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `WorkItemTypeLayout`, `WorkItemComment` from Task 1; `AssignedTo` from `src/types.ts`.
- Produces: `AzureDevOpsClient.getWorkItemTypeLayout(org, project, type): Promise<WorkItemTypeLayout | null>`, `.getWorkItemRawFields(org, project, id): Promise<Record<string, unknown>>`, `.getComments(org, project, id): Promise<WorkItemComment[]>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, right after the closing `});` of `describe('AzureDevOpsClient.getAvatarDataUri', ...)` (end of file):

```ts
describe('AzureDevOpsClient.getWorkItemTypeLayout', () => {
  it('fetches and returns the work item type layout', async () => {
    const layout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] }] }] }],
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(layout));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const result = await client.getWorkItemTypeLayout('my-org', 'MyProject', 'Bug');

    expect(result).toEqual(layout);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes/Bug/layout?api-version=7.1-preview.1',
      expect.anything(),
    );
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const result = await client.getWorkItemTypeLayout('my-org', 'MyProject', 'Bug');

    expect(result).toBeNull();
  });
});

describe('AzureDevOpsClient.getWorkItemRawFields', () => {
  it('fetches and returns the raw fields for a single work item', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 482, fields: { 'System.Title': 'Bug', 'System.Tags': 'a; b' } }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const fields = await client.getWorkItemRawFields('my-org', 'MyProject', 482);

    expect(fields).toEqual({ 'System.Title': 'Bug', 'System.Tags': 'a; b' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitems/482?api-version=7.1',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.getComments', () => {
  it('maps comments from the "comments" response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        comments: [
          {
            id: 1,
            text: '<p>First</p>',
            createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
            createdDate: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments).toEqual([
      {
        id: 1,
        text: '<p>First</p>',
        createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
        createdDate: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workItems/482/comments?api-version=7.1-preview.3',
      expect.anything(),
    );
  });

  it('falls back to the "value" response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ value: [{ id: 2, text: 'Second', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-02T00:00:00Z' }] }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments).toEqual([{ id: 2, text: 'Second', createdBy: { displayName: 'Bob', imageUrl: null }, createdDate: '2026-01-02T00:00:00Z' }]);
  });

  it('sorts comments chronologically by createdDate', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        comments: [
          { id: 2, text: 'Second', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-02T00:00:00Z' },
          { id: 1, text: 'First', createdBy: { displayName: 'Jane' }, createdDate: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments.map(c => c.id)).toEqual([1, 2]);
  });

  it('defaults createdBy to Unknown with no imageUrl when missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ comments: [{ id: 1, text: '', createdDate: '2026-01-01T00:00:00Z' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments[0].createdBy).toEqual({ displayName: 'Unknown', imageUrl: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL on the 6 new tests — the 3 methods don't exist yet.

- [ ] **Step 3: Implement the 3 methods**

Edit `src/azureDevOps/client.ts` — update the top imports:

```ts
import type { AssignedTo, WorkItem } from '../types';
import { buildSearchQuery, buildTypeCountQuery } from './wiql';
import { mapWorkItem } from './mapWorkItem';
import type { BacklogLevel, WorkItemTypeState, WorkItemTypeIcon } from './backlogLevels';
import type { WorkItemTypeLayout, WorkItemComment } from './workItemDetail';
```

Add a local identity-ref mapper and the 3 methods right after `getAvatarDataUri`:

```ts
  async getAvatarDataUri(url: string): Promise<string | null> {
    try {
      const response = await this.fetchWithAuth(url);
      const contentType = response.headers.get('content-type') ?? 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async getWorkItemTypeLayout(organization: string, project: string, type: string): Promise<WorkItemTypeLayout | null> {
    try {
      return await this.request<WorkItemTypeLayout>(
        `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/layout?api-version=7.1-preview.1`,
      );
    } catch {
      return null;
    }
  }

  async getWorkItemRawFields(organization: string, project: string, id: number): Promise<Record<string, unknown>> {
    const data = await this.request<{ fields: Record<string, unknown> }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`,
    );
    return data.fields ?? {};
  }

  async getComments(organization: string, project: string, id: number): Promise<WorkItemComment[]> {
    interface RawComment {
      id: number;
      text?: string;
      createdBy?: unknown;
      createdDate: string;
    }
    const data = await this.request<{ comments?: RawComment[]; value?: RawComment[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.3`,
    );
    const list = data.comments ?? data.value ?? [];
    return list
      .map(c => ({ id: c.id, text: c.text ?? '', createdBy: mapIdentityRef(c.createdBy), createdDate: c.createdDate }))
      .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
  }
```

Add the local helper function above the class (after the existing interface declarations, before `export class AzureDevOpsClient`):

```ts
interface RawIdentityRef {
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function mapIdentityRef(raw: unknown): AssignedTo {
  const identity = raw as RawIdentityRef | undefined;
  const imageUrl = identity?.imageUrl ?? identity?._links?.avatar?.href ?? null;
  return { displayName: identity?.displayName ?? 'Unknown', imageUrl };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS — all tests including the 6 new ones.

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: fetch work item type layout, raw fields, and comments"
```

---

### Task 3: `renderAssignee.ts` — extract `renderAvatarOrInitial`

**Files:**
- Modify: `src/view/renderAssignee.ts`
- Test: `src/view/renderAssignee.test.ts`

**Interfaces:**
- Produces: `renderAvatarOrInitial(displayName: string, imageUrl: string | null, avatars: Record<string, string>): string` — new export. `renderAssigneeRow` keeps its exact existing signature and output, now implemented in terms of the new function (pure refactor).

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderAssignee.test.ts`, after the import line, add the new import, and append a new `describe` block at the end of the file:

Change:

```ts
import { describe, it, expect } from 'vitest';
import { renderAssigneeRow } from './renderAssignee';
```

to:

```ts
import { describe, it, expect } from 'vitest';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';
```

Append after the closing `});` of `describe('renderAssigneeRow', ...)`:

```ts

describe('renderAvatarOrInitial', () => {
  it('shows the resolved avatar image when a data URI is available', () => {
    const html = renderAvatarOrInitial('Jane Doe', 'https://example.com/avatar.png', {
      'https://example.com/avatar.png': 'data:image/png;base64,X',
    });

    expect(html).toBe('<img class="kb-avatar" src="data:image/png;base64,X" alt="">');
  });

  it('falls back to an initial badge when no avatar is resolved', () => {
    const html = renderAvatarOrInitial('Jane Doe', 'https://example.com/avatar.png', {});

    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>J<');
  });

  it('falls back to an initial badge when imageUrl is null', () => {
    const html = renderAvatarOrInitial('Bob', null, {});

    expect(html).toContain('>B<');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/renderAssignee.test.ts`
Expected: FAIL — `renderAvatarOrInitial` is not exported yet.

- [ ] **Step 3: Extract the function**

Replace the full content of `src/view/renderAssignee.ts` with:

```ts
import type { AssignedTo } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderAvatarOrInitial(displayName: string, imageUrl: string | null, avatars: Record<string, string>): string {
  const dataUri = imageUrl ? avatars[imageUrl] : undefined;
  return dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`;
}

export function renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>, rowClass: string): string {
  if (!assignedTo) {
    return `<div class="${rowClass}"><span class="kb-avatar-initial">?</span>Unassigned</div>`;
  }

  return `<div class="${rowClass}">${renderAvatarOrInitial(assignedTo.displayName, assignedTo.imageUrl, avatars)}${escapeHtml(assignedTo.displayName)}</div>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderAssignee.test.ts`
Expected: PASS — all tests, including the pre-existing `renderAssigneeRow` ones (output is byte-identical to before).

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderAssignee.ts src/view/renderAssignee.test.ts
git commit -m "refactor: extract renderAvatarOrInitial from renderAssigneeRow"
```

---

### Task 4: `renderWorkItemDetail` — the detail tab's content

**Files:**
- Create: `src/view/renderWorkItemDetail.ts`
- Test: `src/view/renderWorkItemDetail.test.ts`

**Interfaces:**
- Consumes: `DetailGroup`, `DetailField`, `WorkItemComment` from Task 1; `renderAssigneeRow`, `renderAvatarOrInitial` from Task 3; `renderStatusDot`, `renderTypeAccent` (existing).
- Produces: `WorkItemDetailInput` interface, `renderWorkItemDetail(input: WorkItemDetailInput): string`, `formatFieldValue(refName: string, value: unknown): string` (exported for direct testing).

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderWorkItemDetail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderWorkItemDetail, formatFieldValue, type WorkItemDetailInput } from './renderWorkItemDetail';
import type { WorkItem, KanbrainConfig } from '../types';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: {},
  backlogLevels: {},
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

function input(overrides: Partial<WorkItemDetailInput> = {}): WorkItemDetailInput {
  return {
    workItem: workItem(),
    config,
    description: null,
    groups: [],
    htmlSections: [],
    comments: [],
    avatars: {},
    ...overrides,
  };
}

describe('renderWorkItemDetail', () => {
  it('shows the id, title, status, and type icon in the header', () => {
    const html = renderWorkItemDetail(input());

    expect(html).toContain('#482');
    expect(html).toContain('Fix bug');
    expect(html).toContain('Active');
    expect(html).toContain('kb-type-icon');
  });

  it('shows Unassigned when there is no assignee', () => {
    const html = renderWorkItemDetail(input());
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name when assigned', () => {
    const html = renderWorkItemDetail(input({ workItem: workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }) }));
    expect(html).toContain('Jane Doe');
  });

  it('renders the description as HTML, stripping script tags', () => {
    const html = renderWorkItemDetail(input({ description: '<p>Hello</p><script>alert(1)</script>' }));

    expect(html).toContain('<p>Hello</p>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Description');
  });

  it('omits the description block when there is no description', () => {
    const html = renderWorkItemDetail(input({ description: null }));
    expect(html).not.toContain('kb-detail-section-label">Description');
  });

  it('renders extra HTML sections with their label', () => {
    const html = renderWorkItemDetail(
      input({ htmlSections: [{ refName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', value: '<p>Steps</p>' }] }),
    );

    expect(html).toContain('Repro Steps');
    expect(html).toContain('<p>Steps</p>');
  });

  it('renders grouped fields in the details grid', () => {
    const html = renderWorkItemDetail(
      input({ groups: [{ label: 'Planning', fields: [{ refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' }] }] }),
    );

    expect(html).toContain('Planning');
    expect(html).toContain('Area Path');
    expect(html).toContain('Proj\\Area');
  });

  it('shows "No comments." when there are no comments', () => {
    const html = renderWorkItemDetail(input());
    expect(html).toContain('No comments.');
  });

  it('renders each comment with author, date, and body', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<p>Looks good</p>', createdBy: { displayName: 'Jane Doe', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).toContain('Jane Doe');
    expect(html).toContain('<p>Looks good</p>');
    expect(html).toContain('kb-comment');
  });

  it('resolves a comment author avatar when a data URI is provided', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '', createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments, avatars: { 'https://example.com/jane.png': 'data:image/png;base64,X' } }));

    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('strips script tags from comment bodies', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<script>alert(1)</script>ok', createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).not.toContain('<script>');
    expect(html).toContain('ok');
  });
});

describe('formatFieldValue', () => {
  it('shows an em dash for null, undefined, or empty values', () => {
    expect(formatFieldValue('System.Foo', null)).toBe('—');
    expect(formatFieldValue('System.Foo', undefined)).toBe('—');
    expect(formatFieldValue('System.Foo', '')).toBe('—');
  });

  it('shows the display name for an identity ref value', () => {
    expect(formatFieldValue('System.CreatedBy', { displayName: 'Jane Doe' })).toBe('Jane Doe');
  });

  it('formats fields whose reference name ends in "Date" as a locale date string', () => {
    const result = formatFieldValue('System.CreatedDate', '2026-01-01T00:00:00Z');
    expect(result).not.toBe('—');
    expect(result).not.toBe('2026-01-01T00:00:00Z');
  });

  it('splits System.Tags into chip spans', () => {
    const result = formatFieldValue('System.Tags', 'bug; needs-review');
    expect(result).toContain('kb-detail-tag');
    expect(result).toContain('bug');
    expect(result).toContain('needs-review');
  });

  it('escapes and stringifies plain values', () => {
    expect(formatFieldValue('Microsoft.VSTS.Common.Priority', 2)).toBe('2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `renderWorkItemDetail`**

Create `src/view/renderWorkItemDetail.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import type { DetailGroup, DetailField, WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';

function stripScriptTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function formatFieldValue(refName: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'object' && value !== null && 'displayName' in value) {
    return escapeHtml(String((value as { displayName: unknown }).displayName));
  }
  if (refName.endsWith('Date')) {
    const date = new Date(value as string);
    if (!Number.isNaN(date.getTime())) {
      return escapeHtml(date.toLocaleString());
    }
  }
  if (refName === 'System.Tags' && typeof value === 'string') {
    const tags = value
      .split(';')
      .map(t => t.trim())
      .filter(Boolean);
    return tags.map(t => `<span class="kb-detail-tag">${escapeHtml(t)}</span>`).join('');
  }
  return escapeHtml(String(value));
}

function renderDetailGroup(group: DetailGroup): string {
  const rows = group.fields
    .map(
      f => `
        <div class="kb-detail-field">
          <div class="kb-detail-field-label">${escapeHtml(f.label)}</div>
          <div class="kb-detail-field-value">${formatFieldValue(f.refName, f.value)}</div>
        </div>
      `,
    )
    .join('');
  return `
    <div class="kb-detail-group">
      ${group.label ? `<div class="kb-detail-group-label">${escapeHtml(group.label)}</div>` : ''}
      ${rows}
    </div>
  `;
}

function renderHtmlSection(field: DetailField): string {
  const value = typeof field.value === 'string' ? stripScriptTags(field.value) : '';
  return `
    <div class="kb-detail-html-section">
      <div class="kb-detail-section-label">${escapeHtml(field.label)}</div>
      <div class="kb-detail-html-body">${value}</div>
    </div>
  `;
}

function renderComment(comment: WorkItemComment, avatars: Record<string, string>): string {
  const avatarHtml = renderAvatarOrInitial(comment.createdBy.displayName, comment.createdBy.imageUrl, avatars);
  const date = new Date(comment.createdDate);
  const dateLabel = Number.isNaN(date.getTime()) ? comment.createdDate : date.toLocaleString();
  return `
    <div class="kb-comment">
      <div class="kb-comment-header">
        ${avatarHtml}
        <span class="kb-comment-author">${escapeHtml(comment.createdBy.displayName)}</span>
        <span class="kb-comment-date">${escapeHtml(dateLabel)}</span>
      </div>
      <div class="kb-comment-body">${stripScriptTags(comment.text)}</div>
    </div>
  `;
}

export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
}

export function renderWorkItemDetail(input: WorkItemDetailInput): string {
  const { workItem, config, description, groups, htmlSections, comments, avatars } = input;
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = renderAssigneeRow(workItem.assignedTo, avatars, 'kb-detail-assignee');

  const descriptionHtml = description
    ? `<div class="kb-detail-html-section"><div class="kb-detail-section-label">Description</div><div class="kb-detail-html-body">${stripScriptTags(description)}</div></div>`
    : '';

  const commentsHtml = comments.length ? comments.map(c => renderComment(c, avatars)).join('') : '<div class="kb-empty">No comments.</div>';

  return `
    <div class="kb-detail-header"${borderStyle}>
      <div class="kb-detail-header-top">
        ${iconHtml}
        <span class="kb-detail-id">#${workItem.id}</span>
        ${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}
      </div>
      <h1 class="kb-detail-title">${escapeHtml(workItem.title)}</h1>
      ${assigneeHtml}
    </div>
    <div class="kb-detail-body">
      <div class="kb-detail-main">
        ${descriptionHtml}
        ${htmlSections.map(renderHtmlSection).join('')}
      </div>
      <div class="kb-detail-side">
        ${groups.map(renderDetailGroup).join('')}
      </div>
    </div>
    <div class="kb-detail-section-label">Discussion</div>
    <div class="kb-comments">
      ${commentsHtml}
    </div>
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderWorkItemDetail.ts src/view/renderWorkItemDetail.test.ts
git commit -m "feat: render the work item detail tab content"
```

---

### Task 5: `renderWorkItemCard` — clickable title

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Test: `src/view/renderWorkItemCard.test.ts`

**Interfaces:**
- Produces: `renderWorkItemCard(workItem, config, cssClass, showActionButton = true, avatars = {}, clickableTitle = false)`. When `clickableTitle` is `true`, the title `<div>` gets `class="kb-title kb-title-clickable"` plus `data-action="open-work-item-detail"` and `data-id="${workItem.id}"`.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemCard.test.ts`, after the last `it`:

```ts
  it('does not make the title clickable by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('data-action="open-work-item-detail"');
    expect(html).not.toContain('kb-title-clickable');
  });

  it('makes the title clickable when clickableTitle is true', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, true);
    expect(html).toContain('class="kb-title kb-title-clickable"');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="482"');
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: FAIL on "makes the title clickable when clickableTitle is true" — no such attributes exist yet.

- [ ] **Step 3: Add the `clickableTitle` parameter**

Edit `src/view/renderWorkItemCard.ts`:

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = config.showAssignedTo === false ? '' : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      ${assigneeHtml}
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/renderWorkItemCard.test.ts
git commit -m "feat: make the card title clickable to open the work item detail tab"
```

---

### Task 6: Wire `clickableTitle` into the flow screen (and confirm home stays non-clickable)

**Files:**
- Modify: `src/view/render.ts`
- Test: `src/view/render.test.ts`
- Test: `src/view/renderHome.test.ts` (no production change needed here — guard test only)

**Interfaces:**
- Consumes: `renderWorkItemCard`'s `clickableTitle` param from Task 5.

- [ ] **Step 1: Write the failing test for the flow screen**

Add to `src/view/render.test.ts`, after the last `it`:

```ts
  it('makes the title clickable on the main card and subtasks in the flow screen', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const occurrences = html.split('kb-title-clickable').length - 1;
    expect(occurrences).toBe(2);
    expect(html).toContain('data-action="open-work-item-detail" data-id="482"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="101"');
  });
```

Add to `src/view/renderHome.test.ts`, after the last `it`:

```ts
  it('does not make the title clickable on the home screen card', () => {
    const html = renderHome(state({ workItem: workItem() }));
    expect(html).not.toContain('kb-title-clickable');
  });
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: the new `render.test.ts` test FAILS (0 occurrences instead of 2); the new `renderHome.test.ts` test already PASSES (nothing to implement there — `renderHome.ts` never passes a 6th argument, so `clickableTitle` already defaults to `false`).

- [ ] **Step 3: Pass `clickableTitle: true` in the flow screen**

Edit `src/view/render.ts`:

```ts
  const avatars = state.avatars ?? {};
  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true)).join('')
    : '<div class="kb-empty">No child items.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true)}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
```

(Only the two `renderWorkItemCard(...)` calls change — each gains a trailing `, true`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/renderHome.test.ts
git commit -m "feat: make card titles clickable only in the flow screen"
```

---

### Task 7: Restructure the search modal item — separate "pick" and "View details"

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Test: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Produces: each result item is now `<div class="kb-result-item">` containing a `<button class="kb-result-item-main" data-action="pick-work-item">` (icon + id + title) and a `<div class="kb-result-item-footer">` (assignee + a `<button class="kb-view-details-link" data-action="open-work-item-detail">`). A `<button>` can no longer be nested inside another `<button>` (invalid HTML) now that there are two independent click targets per item.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderSearchResults.test.ts`, after the last `it`:

```ts
  it('shows a View details button for each item, separate from the pick-work-item button', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config(), {});

    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('kb-view-details-link');
  });

  it('scopes the View details button to the correct item id', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    const html = renderSearchResults(items, config(), {});

    expect(html).toContain('data-action="open-work-item-detail" data-id="1"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="2"');
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: FAIL on the 2 new tests.

- [ ] **Step 3: Restructure the item markup**

Edit `src/view/renderSearchResults.ts` — replace the `.map(item => {...})` block inside `renderStatusGroups`:

```ts
            ${group.items
              .map(item => {
                const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
                const assigneeHtml =
                  config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
                return `
                  <div class="kb-result-item"${borderStyle}>
                    <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}">
                      ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>
                    </button>
                    <div class="kb-result-item-footer">
                      ${assigneeHtml}
                      <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: PASS — all tests, including the pre-existing ones (`pick-work-item`, icon, colored border, tabs, etc. — all still present, just moved one level deeper in the markup, which `toContain` doesn't care about).

- [ ] **Step 5: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts
git commit -m "feat: add a View details button to search modal items"
```

---

### Task 8: `WorkItemDetailPanelManager` — the webview panel

**Files:**
- Create: `src/view/WorkItemDetailPanelManager.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.getWorkItems/getWorkItemTypeLayout/getWorkItemRawFields/getComments/getAvatarDataUri` (Task 2 + existing), `resolveDetailFields` (Task 1), `renderWorkItemDetail` (Task 4), `readConfig` (existing, `src/config/config.ts`).
- Produces: `class WorkItemDetailPanelManager { constructor(workspaceRoot: string, client: AzureDevOpsClient); async open(id: number): Promise<void>; }`.

No dedicated test file — this class is coupled to the `vscode` API (`createWebviewPanel`), same convention as `KanbrainViewProvider`. Verification is `npm run compile` + full `npm run test:unit`.

- [ ] **Step 1: Create the file**

Create `src/view/WorkItemDetailPanelManager.ts`:

```ts
import * as vscode from 'vscode';
import type { WorkItem } from '../types';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { resolveDetailFields } from '../azureDevOps/workItemDetail';
import { readConfig } from '../config/config';
import { renderWorkItemDetail } from './renderWorkItemDetail';

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}

  async open(id: number): Promise<void> {
    const existing = this.panels.get(id);
    if (existing) {
      existing.reveal();
      return;
    }

    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

    const [layout, rawFields, comments] = await Promise.all([
      this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type),
      this.client.getWorkItemRawFields(config.organization, config.project, id),
      this.client.getComments(config.organization, config.project, id).catch(() => []),
    ]);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const avatars = await this.resolveAvatars(workItem, comments);

    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${workItem.id} ${workItem.title}`, vscode.ViewColumn.Active, {
      enableScripts: false,
    });
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description: typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null,
        groups,
        htmlSections,
        comments,
        avatars,
      }),
    );
    panel.onDidDispose(() => this.panels.delete(id));
    this.panels.set(id, panel);
  }

  private async resolveAvatars(workItem: WorkItem, comments: WorkItemComment[]): Promise<Record<string, string>> {
    const urls = [
      ...new Set([workItem.assignedTo?.imageUrl, ...comments.map(c => c.createdBy.imageUrl)].filter((u): u is string => !!u)),
    ];
    const uncached = urls.filter(u => !this.avatarCache.has(u));
    await Promise.all(
      uncached.map(async url => {
        this.avatarCache.set(url, await this.client.getAvatarDataUri(url));
      }),
    );
    const resolved: Record<string, string> = {};
    for (const url of urls) {
      const dataUri = this.avatarCache.get(url);
      if (dataUri) {
        resolved[url] = dataUri;
      }
    }
    return resolved;
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;">
  <style>${this.css()}</style>
</head>
<body>
  ${body}
</body>
</html>`;
  }

  private css(): string {
    return `
      body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px 24px; max-width: 960px; margin: 0 auto; }
      .kb-detail-header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; margin-bottom: 16px; }
      .kb-detail-header-top { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.75; }
      .kb-detail-id { font-weight: 600; }
      .kb-detail-title { font-size: 22px; margin: 6px 0; }
      .kb-detail-assignee { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.9; }
      .kb-detail-body { display: flex; flex-wrap: wrap; gap: 24px; }
      .kb-detail-main { flex: 2 1 420px; min-width: 0; }
      .kb-detail-side { flex: 1 1 260px; min-width: 0; }
      .kb-detail-html-section { margin-bottom: 20px; }
      .kb-detail-section-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
      .kb-detail-html-body { line-height: 1.5; }
      .kb-detail-html-body img { max-width: 100%; }
      .kb-detail-group { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 12px; }
      .kb-detail-group-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
      .kb-detail-field { margin-bottom: 8px; }
      .kb-detail-field-label { font-size: 11px; opacity: 0.7; }
      .kb-detail-field-value { font-size: 13px; }
      .kb-detail-tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
      .kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
      .kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
      .kb-empty { opacity: 0.7; }
      .kb-comments { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
      .kb-comment { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; }
      .kb-comment-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; }
      .kb-comment-author { font-weight: 600; }
      .kb-comment-date { opacity: 0.7; }
      .kb-comment-body { line-height: 1.5; }
    `;
  }
}
```

- [ ] **Step 2: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 3: Run the full unit suite**

Run: `npm run test:unit`
Expected: all existing tests still PASS (this file has no tests of its own).

- [ ] **Step 4: Commit**

```bash
git add src/view/WorkItemDetailPanelManager.ts
git commit -m "feat: add WorkItemDetailPanelManager to open the detail tab as a webview panel"
```

---

### Task 9: Wire `open-work-item-detail` end-to-end (`KanbrainViewProvider` + `extension.ts`)

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `WorkItemDetailPanelManager` (Task 8).
- Produces: `KanbrainViewProvider` gains a new constructor dependency `openWorkItemDetail: (id: number) => Promise<void>`, backed by `WorkItemDetailPanelManager.open` from `extension.ts`. Webview message type `open-work-item-detail` (`{ type: 'open-work-item-detail', id: string | number }`).

Both files change together in this task so the build stays green at every commit (changing `KanbrainViewProvider`'s constructor signature alone would break `extension.ts`'s call site).

No dedicated test file (established convention). Verification is `npm run compile` + full `npm run test:unit`.

- [ ] **Step 1: Add the constructor dependency**

Edit `src/view/KanbrainViewProvider.ts`:

```ts
  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
    private readonly checkAzureSession: () => Promise<boolean>,
    private readonly openWorkItemDetail: (id: number) => Promise<void>,
  ) {}
```

- [ ] **Step 2: Handle the new message type**

Edit the `onDidReceiveMessage` handler — replace:

```ts
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      }
    });
```

with:

```ts
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      } else if (message.type === 'open-work-item-detail') {
        await this.openWorkItemDetail(Number(message.id));
      }
    });
```

- [ ] **Step 3: Post the message on click**

Edit the inline `<script>`'s click handler — replace:

```js
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
```

with:

```js
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'open-work-item-detail') {
        vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
```

- [ ] **Step 4: Add the CSS**

In the `css()` method, right after the `.kb-title { ... }` rule, add:

```css
      .kb-title-clickable { cursor: pointer; }
      .kb-title-clickable:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
```

Replace the two rules:

```css
      .kb-result-item { display: flex; flex-direction: column; align-items: stretch; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-result-item:hover { background: var(--vscode-list-hoverBackground); }
```

with:

```css
      .kb-result-item { width: 100%; margin: 2px 0; }
      .kb-result-item-footer { display: flex; align-items: center; margin-top: 2px; padding: 0 6px; }
      .kb-view-details-link { margin-left: auto; background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 11px; padding: 2px 4px; }
      .kb-view-details-link:hover { text-decoration: underline; }
```

Replace:

```css
      .kb-result-item-main { display: flex; align-items: center; min-width: 0; }
```

with:

```css
      .kb-result-item-main { display: flex; align-items: center; width: 100%; text-align: left; padding: 4px 6px; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); min-width: 0; }
      .kb-result-item-main:hover { background: var(--vscode-list-hoverBackground); }
```

Replace:

```css
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; }
```

with:

```css
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.75; }
```

- [ ] **Step 5: Instantiate `WorkItemDetailPanelManager` in `extension.ts` and pass it to `KanbrainViewProvider`**

Edit `src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { ensureAzureSession, hasCachedAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { WorkItemDetailPanelManager } from './view/WorkItemDetailPanelManager';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
import { registerConnectCommand } from './commands/connect';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const client = workspaceRoot
    ? new AzureDevOpsClient({
        fetchImpl: fetch,
        getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
      })
    : undefined;

  const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client) : undefined;

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
  );

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider));

  if (!workspaceRoot || !client) {
    return;
  }

  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
    registerConfigureWithAiCommand(client, workspaceRoot),
    registerConnectCommand(client, workspaceRoot, () => provider.markConnected()),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }
}

export function deactivate(): void {}
```

- [ ] **Step 6: Run compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 7: Run the full unit suite**

Run: `npm run test:unit`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts src/extension.ts
git commit -m "feat: wire open-work-item-detail end-to-end into the extension"
```

---

## Final Verification

- [ ] Run `npm run test:unit` — full suite green.
- [ ] Run `npm run compile` — exits 0.
- [ ] **Manually launch the extension (F5, "Run Extension") against a real Azure DevOps project** — this is the most important check in this plan given the declared risk at the top:
  - Open a work item in the flow screen, hover and click its title → confirm a new editor tab opens titled `#<id> <title>`, showing header/fields/description/comments without throwing.
  - Click a subtask's title → confirm its own tab opens.
  - Reopen the same item's tab (click title again) → confirm it focuses the existing tab instead of duplicating.
  - Open the search modal, confirm "View details" opens the tab and picking the item (clicking the rest of the row) still works independently.
  - Specifically verify the 3 new API calls behave as expected: fields are grouped sensibly (or the fallback list appears, if the process has an unusual layout), comments appear in chronological order with avatars, and nothing throws if a work item type has no comments.
  - Toggle "Show assignee on cards" off in Configuration and confirm the detail tab still shows the assignee in its own header (that toggle only controls the sidebar cards/search modal, not this new tab — confirm that's the actual/expected behavior, and adjust if not).
