# AssignedTo Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the work item's assignee (avatar + name) on the main/subtask cards and in the search/selection modal, gated by a new "Show assignee on cards" toggle in the Configuration screen.

**Architecture:** `WorkItem` gains an `assignedTo` field populated by `mapWorkItem`. Because Azure DevOps avatar URLs require the same Bearer auth as the REST API, `KanbrainViewProvider` resolves avatars server-side through a new `AzureDevOpsClient.getAvatarDataUri` method (with an in-memory cache) and hands the resulting `url -> data:URI` map down into the existing pure render functions, which fall back to an initials badge when no data URI is available yet.

**Tech Stack:** TypeScript, vitest, VS Code Webview API (no framework — hand-written HTML strings + a shared inline `<script>` in `KanbrainViewProvider`).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-20-assigned-to-display-design.md` — follow it for behavior details (Unassigned text, initials fallback, avatar auth via data URI, default-on toggle).
- `WorkItem.assignedTo: AssignedTo | null` is a **required** field (matches the existing convention where every `WorkItem` field is required, e.g. `parentId: number | null`) — every fixture that builds a `WorkItem` literal must be updated.
- `KanbrainConfig.showAssignedTo?: boolean` is **optional** — absent/`undefined` means "on". Never make it required; that would force updates to every `KanbrainConfig` fixture across the codebase for no behavioral gain.
- Run `npm run test:unit` (vitest) after every task. Run `npm run compile` (`tsc -p ./`) at least once per task that touches types shared across files (Tasks 1, 2, 5, 6, 8, 9) since vitest does not type-check.
- Match existing code style: single quotes, explicit types on exported functions, `?? {}` for optional Record defaults, arrow functions inline in `.map()`.

---

### Task 1: `WorkItem.assignedTo` type + `mapWorkItem` mapping

**Files:**
- Modify: `src/types.ts`
- Modify: `src/azureDevOps/mapWorkItem.ts`
- Test: `src/azureDevOps/mapWorkItem.test.ts`
- Modify (compile fixes only, add `assignedTo: null,` to the `WorkItem` fixture): `src/view/renderWorkItemCard.test.ts`, `src/view/renderSearchResults.test.ts`, `src/view/render.test.ts`, `src/view/renderHome.test.ts`, `src/view/filterSearchResults.test.ts`, `src/view/groupByStatus.test.ts`, `src/config/resolveSkill.test.ts`, `src/skills/resolvePlaceholders.test.ts`, `src/skills/generateContextFile.test.ts`, `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `AssignedTo { displayName: string; imageUrl: string | null }` (exported from `src/types.ts`), `WorkItem.assignedTo: AssignedTo | null`, `mapWorkItem(raw, organization, project)` now populates `assignedTo`.

- [ ] **Step 1: Add the `AssignedTo` type and `WorkItem.assignedTo` field**

Edit `src/types.ts`:

```ts
export interface AssignedTo {
  displayName: string;
  imageUrl: string | null;
}

export interface WorkItem {
  id: number;
  title: string;
  description: string;
  status: string;
  type: string;
  url: string;
  parentId: number | null;
  childIds: number[];
  assignedTo: AssignedTo | null;
}
```

- [ ] **Step 2: Fix compile errors from the new required field — add `assignedTo: null,` to every existing `WorkItem` fixture**

In each of these files, the fixture follows the pattern `function workItem(overrides) { return { ..., parentId: null, childIds: [], ...overrides }; }`. Add `assignedTo: null,` right after `childIds: [],`:

- `src/view/renderWorkItemCard.test.ts`
- `src/view/renderSearchResults.test.ts`
- `src/view/render.test.ts`
- `src/view/renderHome.test.ts`
- `src/view/filterSearchResults.test.ts`
- `src/view/groupByStatus.test.ts`
- `src/config/resolveSkill.test.ts`
- `src/skills/resolvePlaceholders.test.ts`

Example (identical edit in all 8 files above):

```ts
    parentId: null,
    childIds: [],
    assignedTo: null,
    ...overrides,
  };
}
```

In `src/skills/generateContextFile.test.ts`, the fixture is a direct `const workItem: WorkItem = { ... };` (no helper). Change:

```ts
  parentId: null,
  childIds: [],
};
```

to:

```ts
  parentId: null,
  childIds: [],
  assignedTo: null,
};
```

In `src/azureDevOps/client.test.ts`, the `getChildren` test builds an inline `parent` literal on one line. Change:

```ts
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101] };
```

to:

```ts
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101], assignedTo: null };
```

- [ ] **Step 3: Run `npm run compile` to confirm the fixture fixes cleared all the new type errors**

Run: `npm run compile`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Write the failing tests for `mapWorkItem`'s `System.AssignedTo` handling**

Add to `src/azureDevOps/mapWorkItem.test.ts` (inside the existing `describe('mapWorkItem', ...)` block, after the last `it`):

```ts
  it('maps System.AssignedTo into assignedTo using the imageUrl field', () => {
    const item = mapWorkItem(
      raw({
        fields: { ...raw().fields, 'System.AssignedTo': { displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane' } },
      }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane' });
  });

  it('falls back to _links.avatar.href when imageUrl is not present', () => {
    const item = mapWorkItem(
      raw({
        fields: {
          ...raw().fields,
          'System.AssignedTo': { displayName: 'Jane Doe', _links: { avatar: { href: 'https://dev.azure.com/avatar/jane-link' } } },
        },
      }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane-link' });
  });

  it('has a null imageUrl when neither imageUrl nor _links.avatar.href is present', () => {
    const item = mapWorkItem(
      raw({ fields: { ...raw().fields, 'System.AssignedTo': { displayName: 'Jane Doe' } } }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: null });
  });

  it('has a null assignedTo when System.AssignedTo is missing', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.assignedTo).toBeNull();
  });
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/mapWorkItem.test.ts`
Expected: FAIL — the 4 new tests fail because `item.assignedTo` is `undefined` (the field isn't produced yet).

- [ ] **Step 6: Implement `mapAssignedTo` and wire it into `mapWorkItem`**

Edit `src/azureDevOps/mapWorkItem.ts`:

```ts
import type { WorkItem, AssignedTo } from '../types';

export interface RawRelation {
  rel: string;
  url: string;
}

export interface RawWorkItem {
  id: number;
  fields: Record<string, unknown>;
  relations?: RawRelation[];
}

interface RawIdentityRef {
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdFromUrl(url: string): number {
  const match = url.match(/\/(\d+)$/);
  if (!match) {
    throw new Error(`Could not extract the work item ID from the URL: ${url}`);
  }
  return Number(match[1]);
}

function mapAssignedTo(raw: unknown): AssignedTo | null {
  const identity = raw as RawIdentityRef | undefined;
  if (!identity?.displayName) {
    return null;
  }
  const imageUrl = identity.imageUrl ?? identity._links?.avatar?.href ?? null;
  return { displayName: identity.displayName, imageUrl };
}

export function mapWorkItem(raw: RawWorkItem, organization: string, project: string): WorkItem {
  const relations = raw.relations ?? [];
  const parentRelation = relations.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  const childRelations = relations.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward');

  return {
    id: raw.id,
    title: String(raw.fields['System.Title'] ?? ''),
    description: stripHtml(String(raw.fields['System.Description'] ?? '')),
    status: String(raw.fields['System.State'] ?? ''),
    type: String(raw.fields['System.WorkItemType'] ?? ''),
    url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${raw.id}`,
    parentId: parentRelation ? extractIdFromUrl(parentRelation.url) : null,
    childIds: childRelations.map(r => extractIdFromUrl(r.url)),
    assignedTo: mapAssignedTo(raw.fields['System.AssignedTo']),
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/mapWorkItem.test.ts`
Expected: PASS — all tests including the 4 new ones.

- [ ] **Step 8: Run the full unit test suite and compile check**

Run: `npm run test:unit && npm run compile`
Expected: all tests PASS, compile exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/azureDevOps/mapWorkItem.ts src/azureDevOps/mapWorkItem.test.ts src/view/renderWorkItemCard.test.ts src/view/renderSearchResults.test.ts src/view/render.test.ts src/view/renderHome.test.ts src/view/filterSearchResults.test.ts src/view/groupByStatus.test.ts src/config/resolveSkill.test.ts src/skills/resolvePlaceholders.test.ts src/skills/generateContextFile.test.ts src/azureDevOps/client.test.ts
git commit -m "feat: map System.AssignedTo into WorkItem.assignedTo"
```

---

### Task 2: `KanbrainConfig.showAssignedTo` type + `syncConfig` preservation

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config/syncConfig.ts`
- Test: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `KanbrainConfig.showAssignedTo?: boolean`. `syncConfig(...)` preserves it across a board sync.

- [ ] **Step 1: Add `showAssignedTo` to `KanbrainConfig`**

Edit `src/types.ts`:

```ts
export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  showAssignedTo?: boolean;
}
```

(This is optional, so no other `KanbrainConfig` fixture across the codebase needs updating.)

- [ ] **Step 2: Write the failing test for `syncConfig` preserving `showAssignedTo`**

Add to `src/config/syncConfig.test.ts` (inside `describe('syncConfig', ...)`, after the last `it`):

```ts
  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});
    expect(result.showAssignedTo).toBeUndefined();
  });
```

- [ ] **Step 3: Run the tests to verify the first new test fails**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: FAIL on `preserves showAssignedTo across a sync` — `result.showAssignedTo` is `undefined`, not `false`, because `syncConfig` currently returns an object literal that never mentions the field.

- [ ] **Step 4: Make `syncConfig` preserve `showAssignedTo`**

Edit `src/config/syncConfig.ts` — in the returned object literal at the end of `syncConfig`, add `showAssignedTo: config.showAssignedTo,`:

```ts
  return {
    organization: config.organization,
    project: config.project,
    typeToBacklogLevel: freshTypeToBacklogLevel,
    backlogLevels,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    showAssignedTo: config.showAssignedTo,
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: PASS — all tests including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config/syncConfig.ts src/config/syncConfig.test.ts
git commit -m "feat: add KanbrainConfig.showAssignedTo, preserved across board sync"
```

---

### Task 3: `AzureDevOpsClient.getAvatarDataUri`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient`'s existing private `fetchWithAuth(url)` (already used by every other method in the class).
- Produces: `AzureDevOpsClient.getAvatarDataUri(url: string): Promise<string | null>` — authenticated fetch of an image URL, returned as a `data:<content-type>;base64,<...>` string, or `null` on any failure.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, a new helper near the top (after `textResponse`) and a new `describe` block at the end (before the final closing `});` of the outer `describe('AzureDevOpsClient', ...)`, i.e. as its own top-level `describe`:

```ts
function binaryResponse(bytes: Uint8Array, contentType: string | null, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.buffer,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}
```

```ts
describe('AzureDevOpsClient.getAvatarDataUri', () => {
  it('fetches the avatar with auth and returns a base64 data URI using the response content-type', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(bytes, 'image/png'));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://dev.azure.com/my-org/_apis/GraphProfile/MemberAvatars/abc');

    expect(dataUri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/GraphProfile/MemberAvatars/abc',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  it('defaults to image/png when the response has no content-type header', async () => {
    const bytes = new Uint8Array([9, 9]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(bytes, null));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://example.com/avatar');

    expect(dataUri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  });

  it('returns null when the fetch fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://example.com/avatar');

    expect(dataUri).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts -t getAvatarDataUri`
Expected: FAIL with "client.getAvatarDataUri is not a function".

- [ ] **Step 3: Implement `getAvatarDataUri`**

Edit `src/azureDevOps/client.ts` — add this method to the `AzureDevOpsClient` class, right after `getChildren`:

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 5: Run compile check**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: fetch Azure DevOps avatars as authenticated base64 data URIs"
```

---

### Task 4: Shared `renderAssigneeRow` helper

**Files:**
- Create: `src/view/renderAssignee.ts`
- Test: `src/view/renderAssignee.test.ts`

**Interfaces:**
- Consumes: `AssignedTo` type from `src/types.ts` (Task 1), `escapeHtml` from `src/view/escapeHtml.ts`.
- Produces: `renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>, rowClass: string): string` — one `<div class="${rowClass}">` containing either an `<img class="kb-avatar">` (when a resolved data URI is available), a `<span class="kb-avatar-initial">` (fallback, showing the first letter of the name, or "?" when unassigned), and the escaped display name (or "Unassigned").

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderAssignee.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderAssigneeRow } from './renderAssignee';

describe('renderAssigneeRow', () => {
  it('shows "Unassigned" with a placeholder badge when there is no assignee', () => {
    const html = renderAssigneeRow(null, {}, 'kb-assignee-row');

    expect(html).toContain('kb-assignee-row');
    expect(html).toContain('Unassigned');
    expect(html).toContain('kb-avatar-initial');
  });

  it('shows an initial badge with the first letter of the name when no avatar is resolved', () => {
    const html = renderAssigneeRow({ displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' }, {}, 'kb-assignee-row');

    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>J<');
    expect(html).toContain('Jane Doe');
    expect(html).not.toContain('<img');
  });

  it('shows the resolved avatar image when a data URI is available for the imageUrl', () => {
    const avatars = { 'https://example.com/avatar.png': 'data:image/png;base64,ABC123' };
    const html = renderAssigneeRow({ displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' }, avatars, 'kb-assignee-row');

    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,ABC123"');
    expect(html).not.toContain('kb-avatar-initial');
  });

  it('shows an initial badge when the assignee has no imageUrl at all', () => {
    const html = renderAssigneeRow({ displayName: 'Bob', imageUrl: null }, {}, 'kb-assignee-row');

    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>B<');
  });

  it('escapes the display name', () => {
    const html = renderAssigneeRow({ displayName: '<script>', imageUrl: null }, {}, 'kb-assignee-row');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies the given row class so callers can style it differently', () => {
    const html = renderAssigneeRow(null, {}, 'kb-result-item-assignee');

    expect(html).toContain('kb-result-item-assignee');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderAssignee.test.ts`
Expected: FAIL — the module `./renderAssignee` doesn't exist yet.

- [ ] **Step 3: Implement `renderAssigneeRow`**

Create `src/view/renderAssignee.ts`:

```ts
import type { AssignedTo } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>, rowClass: string): string {
  if (!assignedTo) {
    return `<div class="${rowClass}"><span class="kb-avatar-initial">?</span>Unassigned</div>`;
  }

  const dataUri = assignedTo.imageUrl ? avatars[assignedTo.imageUrl] : undefined;
  const avatarHtml = dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(assignedTo.displayName.charAt(0).toUpperCase())}</span>`;

  return `<div class="${rowClass}">${avatarHtml}${escapeHtml(assignedTo.displayName)}</div>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderAssignee.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderAssignee.ts src/view/renderAssignee.test.ts
git commit -m "feat: add shared renderAssigneeRow helper for avatar+name markup"
```

---

### Task 5: Wire assignee rendering into `renderWorkItemCard`, `render.ts`, and `renderHome.ts`

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/renderHome.ts`
- Test: `src/view/renderWorkItemCard.test.ts`
- Test: `src/view/render.test.ts`
- Test: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `renderAssigneeRow` from Task 4, `WorkItem.assignedTo` from Task 1.
- Produces: `renderWorkItemCard(workItem, config, cssClass, showActionButton = true, avatars: Record<string, string> = {})`. `RenderState.avatars?: Record<string, string>` (new optional field, defaults to `{}` at every read site — this keeps every existing `RenderState` literal in tests compiling unchanged).

- [ ] **Step 1: Write the failing tests for `renderWorkItemCard`**

Add to `src/view/renderWorkItemCard.test.ts` (inside `describe('renderWorkItemCard', ...)`, after the last `it`):

```ts
  it('shows "Unassigned" when the work item has no assignee', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: null }), config, 'kb-main-card');
    expect(html).toContain('kb-assignee-row');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name when the work item is assigned', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image when one is provided for the assignee', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderWorkItemCard(item, config, 'kb-main-card', true, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row entirely when config.showAssignedTo is false', () => {
    const html = renderWorkItemCard(workItem(), { ...config, showAssignedTo: false }, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });
```

Also update the `workItem()` fixture at the top of this file to default `assignedTo: null` (it should already have this from Task 1, Step 2 — confirm it's there before continuing).

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: FAIL on the 4 new tests — no assignee row is rendered yet.

- [ ] **Step 3: Wire `renderAssigneeRow` into `renderWorkItemCard`**

Edit `src/view/renderWorkItemCard.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { isValidHexColor, normalizeHex } from './badgeColor';

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  if (!skill) {
    return '';
  }
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  const style =
    buttonColor || textColor
      ? ` style="${buttonColor ? `background: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
      : '';
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}"${style}>▶ ${escapeHtml(label)}</button>`;
}

export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = config.showAssignedTo === false ? '' : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div class="kb-title">${escapeHtml(workItem.title)}</div>
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${assigneeHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: PASS — all tests including the 4 new ones.

- [ ] **Step 5: Write the failing tests for `render.ts` and `renderHome.ts` plumbing**

Add to `src/view/render.test.ts` (inside `describe('render', ...)`, after the last `it`):

```ts
  it('passes avatars through to the main card and subtasks', () => {
    const subtasks = [workItem({ id: 101, assignedTo: { displayName: 'Bob', imageUrl: 'https://example.com/bob.png' } })];
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ assignedTo: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' } }),
      parent: null,
      subtasks,
      screen: 'flow',
      avatars: {
        'https://example.com/jane.png': 'data:image/png;base64,JANE',
        'https://example.com/bob.png': 'data:image/png;base64,BOB',
      },
    });

    expect(html).toContain('data:image/png;base64,JANE');
    expect(html).toContain('data:image/png;base64,BOB');
  });
```

Add to `src/view/renderHome.test.ts` (inside `describe('renderHome', ...)`, after the last `it`):

```ts
  it('passes avatars through to the active work item card', () => {
    const html = renderHome(
      state({
        workItem: workItem({ assignedTo: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' } }),
        avatars: { 'https://example.com/jane.png': 'data:image/png;base64,JANE' },
      }),
    );

    expect(html).toContain('data:image/png;base64,JANE');
  });
```

- [ ] **Step 6: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: FAIL on the 2 new tests — `avatars` isn't threaded through yet (and `RenderState` doesn't have the field, so this also fails to compile under `tsc`, though vitest's esbuild transform will still run it and fail on the assertion).

- [ ] **Step 7: Add `avatars` to `RenderState` and thread it through `render.ts`**

Edit `src/view/render.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
}
```

In the same file, update the flow-screen branch (the code after the `home`/`config` early returns) to pass `avatars` through:

```ts
  const avatars = state.avatars ?? {};
  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars)).join('')
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
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars)}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
```

(Only the two `renderWorkItemCard(...)` call sites and the `subtasksHtml`/`avatars` declarations change — everything else in the function body stays the same.)

- [ ] **Step 8: Thread `avatars` through `renderHome.ts`**

Edit `src/view/renderHome.ts` — in `renderHomeWorkItemSection`, read `avatars` once and pass it to the `renderWorkItemCard` call:

```ts
function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;
  const avatars = state.avatars ?? {};

  const searchDialog = `
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
  `;

  if (!state.workItem) {
    return `
      <div class="kb-home-commands">
        <button id="kb-toggle-search-btn" class="kb-secondary-btn">🔍 Select Work Item</button>
      </div>
      ${searchDialog}
    `;
  }

  return `
    ${searchDialog}
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars)}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <button id="kb-view-details-btn" class="kb-secondary-btn">View details →</button>
  `;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts src/view/renderWorkItemCard.test.ts`
Expected: PASS — all tests.

- [ ] **Step 10: Run the full unit suite and compile check**

Run: `npm run test:unit && npm run compile`
Expected: all tests PASS, compile exits 0.

- [ ] **Step 11: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/render.ts src/view/renderHome.ts src/view/renderWorkItemCard.test.ts src/view/render.test.ts src/view/renderHome.test.ts
git commit -m "feat: render assignee avatar+name on the main and subtask cards"
```

---

### Task 6: Wire assignee rendering into `renderSearchResults`

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Test: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Consumes: `renderAssigneeRow` from Task 4.
- Produces: `renderSearchResults(items, config, backlogLevelCounts, avatars: Record<string, string> = {})`. Each `.kb-result-item` button now wraps its icon/id/title in a `.kb-result-item-main` div, followed by a `.kb-result-item-assignee` row (when `config.showAssignedTo !== false`).

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderSearchResults.test.ts` (inside `describe('renderSearchResults', ...)`, after the last `it`):

```ts
  it('shows "Unassigned" on a result item when the item has no assignee', () => {
    const html = renderSearchResults([workItem({ assignedTo: null })], config(), {});
    expect(html).toContain('kb-result-item-assignee');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name on a result item when assigned', () => {
    const html = renderSearchResults([workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } })], config(), {});
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image on a result item when provided', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderSearchResults([item], config(), {}, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row on result items when config.showAssignedTo is false', () => {
    const html = renderSearchResults([workItem()], config({ showAssignedTo: false }), {});
    expect(html).not.toContain('kb-result-item-assignee');
  });
```

Also update the `workItem()` fixture at the top of this file to default `assignedTo: null` (should already be there from Task 1, Step 2).

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: FAIL on the 4 new tests.

- [ ] **Step 3: Wire `renderAssigneeRow` into `renderSearchResults`**

Edit `src/view/renderSearchResults.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';

function renderStatusGroups(items: WorkItem[], config: KanbrainConfig, avatars: Record<string, string>): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-result-group">
          <button class="kb-section-label kb-group-toggle" data-action="toggle-group">${renderStatusDot(group.status, config.statusColors ?? {})}${escapeHtml(group.status)} (${group.items.length})</button>
          <div class="kb-group-items">
            ${group.items
              .map(item => {
                const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
                const assigneeHtml =
                  config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
                return `
                  <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}"${borderStyle}>
                    <div class="kb-result-item-main">${iconHtml}#${item.id} ${escapeHtml(item.title)}</div>
                    ${assigneeHtml}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');
}

export function renderSearchResults(
  items: WorkItem[],
  config: KanbrainConfig,
  backlogLevelCounts: Record<string, number>,
  avatars: Record<string, string> = {},
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return renderStatusGroups(items, config, avatars);
  }

  const tabs = [
    { id: 'all', label: 'All', count: items.length, items },
    ...levels.map(level => ({
      id: level,
      label: level,
      count: backlogLevelCounts[level] ?? 0,
      items: items.filter(item => config.typeToBacklogLevel[item.type] === level),
    })),
  ];

  const tabBar = tabs
    .map(
      tab =>
        `<button class="kb-search-tab${tab.count === 0 ? ' kb-search-tab-empty' : ''}" data-action="select-tab" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)} (${tab.count})</button>`,
    )
    .join('');

  const panels = tabs
    .map(tab => `<div class="kb-search-tab-panel" data-tab-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config, avatars)}</div>`)
    .join('');

  return `<div class="kb-search-tabs">${tabBar}</div>${panels}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: PASS — all tests, including the pre-existing ones (the wrapper div doesn't remove any existing markup, so the old assertions still hold).

- [ ] **Step 5: Run the full unit suite and compile check**

Run: `npm run test:unit && npm run compile`
Expected: all tests PASS, compile exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts
git commit -m "feat: render assignee avatar+name on search modal result items"
```

---

### Task 7: "Display" section with the `showAssignedTo` checkbox in `renderConfig`

**Files:**
- Modify: `src/view/renderConfig.ts`
- Test: `src/view/renderConfig.test.ts`

**Interfaces:**
- Produces: `renderConfig` output includes a checkbox `<input type="checkbox" id="kb-show-assignee-toggle">`, checked whenever `config.showAssignedTo !== false`.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderConfig.test.ts` (inside `describe('renderConfig', ...)`, after the last `it`):

```ts
  it('shows a "Show assignee on cards" checkbox, checked by default', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-show-assignee-toggle"');
    expect(html).toContain('Show assignee on cards');
    expect(html).toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('unchecks the checkbox when showAssignedTo is false', () => {
    const html = renderConfig(state({ config: config({ showAssignedTo: false }) }));
    expect(html).not.toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — there's no checkbox in the output yet.

- [ ] **Step 3: Add the "Display" section**

Edit `src/view/renderConfig.ts`:

```ts
import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee on cards
    </label>
    <div class="kb-section-label">Skill Configuration</div>
    ${renderConfigEditor(config)}
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "feat: add Display section with a Show assignee on cards toggle"
```

---

### Task 8: `hasStateChanged` picks up avatar cache changes

**Files:**
- Modify: `src/view/hasStateChanged.ts`
- Test: `src/view/hasStateChanged.test.ts`

**Interfaces:**
- Produces: `serializeState(config, workItem, subtasks, avatars: unknown = {})`, `hasStateChanged(previous, config, workItem, subtasks, avatars: unknown = {})`. The `avatars` parameter is optional (default `{}`) so every existing 3-arg call site keeps compiling unchanged.

- [ ] **Step 1: Write the failing test**

Add to `src/view/hasStateChanged.test.ts` (inside `describe('hasStateChanged', ...)`, after the last `it`):

```ts
  it('is true when only the avatars map changes', () => {
    const previous = serializeState(null, { id: 1 }, [], {});

    expect(hasStateChanged(previous, null, { id: 1 }, [], { 'https://example.com/a.png': 'data:image/png;base64,X' })).toBe(true);
  });

  it('is false when avatars is omitted on both sides (defaults to the same empty object)', () => {
    const previous = serializeState(null, { id: 1 }, []);

    expect(hasStateChanged(previous, null, { id: 1 }, [])).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify the first new test fails**

Run: `npx vitest run src/view/hasStateChanged.test.ts`
Expected: FAIL on "is true when only the avatars map changes" — `avatars` isn't part of the serialized state yet, so the two calls produce identical strings.

- [ ] **Step 3: Add `avatars` to the serialized state**

Edit `src/view/hasStateChanged.ts`:

```ts
export function serializeState(config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}): string {
  return JSON.stringify({ config, workItem, subtasks, avatars });
}

export function hasStateChanged(previous: string, config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}): boolean {
  return serializeState(config, workItem, subtasks, avatars) !== previous;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/hasStateChanged.test.ts`
Expected: PASS — all tests, including the pre-existing 4 (they all call with 3 args, which now default `avatars` to `{}` on both sides, so behavior is unchanged for them).

- [ ] **Step 5: Commit**

```bash
git add src/view/hasStateChanged.ts src/view/hasStateChanged.test.ts
git commit -m "feat: include resolved avatars in the webview state-change signature"
```

---

### Task 9: `KanbrainViewProvider` — avatar cache/resolution, config toggle, styling

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.getAvatarDataUri` (Task 3), `RenderState.avatars` (Task 5), `renderSearchResults(..., avatars)` (Task 6), `serializeState`/`hasStateChanged(..., avatars)` (Task 8), `KanbrainConfig.showAssignedTo` (Task 2).
- Produces: webview message type `set-show-assigned-to` (`{ type: 'set-show-assigned-to', value: boolean }`), persisted via `writeConfig`.

There is no existing unit test file for `KanbrainViewProvider.ts` (it's wired directly to the `vscode` API, which isn't mocked in this codebase's test suite) — verification for this task is `npm run compile` plus the full `npm run test:unit` run to confirm nothing else broke.

- [ ] **Step 1: Add the avatar cache field and `resolveAvatars` helper**

Edit `src/view/KanbrainViewProvider.ts` — add a new private field next to the existing ones near the top of the class:

```ts
  private avatarCache = new Map<string, string | null>();
```

(Insert it right after `private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';`.)

Add a new private method, placed right after `fetchBacklogLevelCounts`:

```ts
  private async resolveAvatars(items: WorkItem[]): Promise<Record<string, string>> {
    const urls = [...new Set(items.map(i => i.assignedTo?.imageUrl).filter((u): u is string => !!u))];
    const uncached = urls.filter(u => !this.avatarCache.has(u));
    await Promise.all(
      uncached.map(async url => {
        this.avatarCache.set(url, this.client ? await this.client.getAvatarDataUri(url) : null);
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
```

- [ ] **Step 2: Resolve avatars in `refresh()` and pass them through**

Edit `src/view/KanbrainViewProvider.ts`'s `refresh()` method. Replace:

```ts
    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    if (!hasStateChanged(this.lastState, config, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks);
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, screen: this.currentScreen }),
    );
```

with:

```ts
    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    const avatars =
      config && config.showAssignedTo !== false
        ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w))
        : {};

    if (!hasStateChanged(this.lastState, config, workItem, subtasks, avatars)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks, avatars);
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, screen: this.currentScreen, avatars }),
    );
```

- [ ] **Step 3: Resolve avatars in `searchWorkItems()`**

Edit the `searchWorkItems` method. Replace:

```ts
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      html = renderSearchResults(filterSearchResults(items, query), config, this.backlogLevelCounts);
```

with:

```ts
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      const filtered = filterSearchResults(items, query);
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(filtered) : {};
      html = renderSearchResults(filtered, config, this.backlogLevelCounts, avatars);
```

- [ ] **Step 4: Handle the `set-show-assigned-to` message and add `setShowAssignedTo`**

In `resolveWebviewView`'s `onDidReceiveMessage` handler, add a new branch right before the closing of the `if/else if` chain (after the `pick-skill-file` branch):

```ts
      } else if (message.type === 'pick-skill-file') {
        await this.pickSkillFile(String(message.level ?? ''), String(message.status ?? ''));
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      }
```

Add the new private method right after `saveSkillEntry`:

```ts
  private setShowAssignedTo(value: boolean): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.showAssignedTo = value;
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 5: Wire the checkbox's `change` event in the inline webview script**

In `wrapHtml`'s `<script>` block, add a listener right after the existing `.kb-color-picker` `forEach` block (before `document.addEventListener('click', (e) => { ... })`):

```js
    const showAssigneeToggle = document.getElementById('kb-show-assignee-toggle');
    if (showAssigneeToggle) {
      showAssigneeToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-show-assigned-to', value: showAssigneeToggle.checked });
      });
    }
```

- [ ] **Step 6: Add the CSS**

In the `css()` method:

1. Change the `.kb-result-item` rule from:

```css
      .kb-result-item { display: flex; align-items: center; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
```

to:

```css
      .kb-result-item { display: flex; flex-direction: column; align-items: stretch; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
```

2. Add these new rules right after the `.kb-color-picker` rule (the last rule in the template literal):

```css
      .kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
      .kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
      .kb-result-item-main { display: flex; align-items: center; }
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; }
      .kb-result-item-assignee .kb-avatar, .kb-result-item-assignee .kb-avatar-initial { width: 14px; height: 14px; }
      .kb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; cursor: pointer; }
```

- [ ] **Step 7: Run compile and the full unit suite**

Run: `npm run compile && npm run test:unit`
Expected: compile exits 0, all tests PASS (this file has no dedicated unit tests, so a clean compile plus a green full suite — nothing else regressed — is the acceptance bar for this task).

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: resolve and cache assignee avatars, wire the Display toggle end-to-end"
```

---

## Final Verification

- [ ] Run `npm run test:unit` — full suite green.
- [ ] Run `npm run compile` — exits 0.
- [ ] Manually launch the extension (F5 in VS Code, "Run Extension") against a real Azure DevOps project: confirm the main card, subtask cards, and search modal all show assignee avatar+name; toggle "Show assignee on cards" off in Configuration and confirm all three surfaces hide it immediately; toggle back on and confirm it reappears without a VS Code reload (the 5s poll or the toggle's own `refresh()` call should pick it up).
