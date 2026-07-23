# Development Badge + Detail Panel Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the itemized branch/PR list on work item cards with a compact icon+count badge (matching Azure Boards' real Annotations behavior), and move the full itemized list (with PR title/status) into the work item detail panel.

**Architecture:** `renderDevelopment.ts` gains a second render function, `renderDevelopmentBadge`, used only by `renderWorkItemCard`. The existing `renderDevelopmentSection` (full list) is reused unchanged, but its caller moves from the polled card-refresh path (`KanbrainViewProvider.refresh`, every 5s) to the one-shot detail-panel-open path (`WorkItemDetailPanelManager.open`), which gets its own `prCache` mirroring the pattern already used for `avatarCache`. `PullRequestDetails` resolution is removed entirely from the card's data flow (`RenderState`, `render.ts`, `renderHome.ts`, `KanbrainViewProvider.ts`).

**Tech Stack:** TypeScript, Vitest, VS Code Webview API.

## Global Constraints

- Badge icon color is fixed `#EAA300` (not `currentColor`) — deliberately not theme-adaptive, to match Azure's real annotation icon color.
- Badge shows one combined number (branches + PRs together), never separate counts per kind.
- No click behavior on the badge (v1, display only) — same as the existing Development section.
- `AzureDevOpsClient.getPullRequest` and `mapWorkItem.ts` parsing are unchanged — only the caller and timing of PR-detail resolution move.

---

### Task 1: `renderDevelopmentBadge` in `renderDevelopment.ts`

**Files:**
- Modify: `src/view/renderDevelopment.ts`
- Test: `src/view/renderDevelopment.test.ts`

**Interfaces:**
- Consumes: `DevelopmentLink` from `../types` (existing).
- Produces: `export function renderDevelopmentBadge(development: DevelopmentLink[]): string` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/view/renderDevelopment.test.ts` (add `renderDevelopmentBadge` to the existing import on line 2):

```ts
import { renderDevelopmentSection, renderDevelopmentBadge } from './renderDevelopment';
```

```ts
describe('renderDevelopmentBadge', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentBadge([])).toBe('');
  });

  it('renders the fork icon and the combined count of branches and pull requests', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 58 },
    ];
    const html = renderDevelopmentBadge(links);
    expect(html).toContain('kb-dev-badge');
    expect(html).toContain('<svg');
    expect(html).toContain('>3<');
  });

  it('shows only the count, not any PR id or title', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentBadge(links);
    expect(html).toContain('>1<');
    expect(html).not.toContain('#57');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderDevelopment.test.ts`
Expected: FAIL — `renderDevelopmentBadge` is not exported from `./renderDevelopment`.

- [ ] **Step 3: Implement `renderDevelopmentBadge`**

Replace the full contents of `src/view/renderDevelopment.ts` with:

```ts
import type { DevelopmentLink, PullRequestDetails } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_FORK_ICON_PATH =
  'M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z';

function renderBranchForkIcon(fill: string): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${BRANCH_FORK_ICON_PATH}" fill="${fill}"/></svg>`;
}

const BRANCH_FORK_ICON = renderBranchForkIcon('currentColor');
const BADGE_ICON_COLOR = '#EAA300';

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    return `<div class="kb-dev-item">${escapeHtml(link.branchName)}</div>`;
  }
  const details = prDetails[`${link.repositoryId}:${link.pullRequestId}`];
  const label = details
    ? `#${link.pullRequestId} ${escapeHtml(details.title)} (${escapeHtml(capitalize(details.status))})`
    : `#${link.pullRequestId}`;
  return `<div class="kb-dev-item">${label}</div>`;
}

export function renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string {
  if (development.length === 0) {
    return '';
  }
  return `
    <div class="kb-field-row">
      <div class="kb-field-label kb-dev-label">${BRANCH_FORK_ICON}<span>Development</span></div>
      ${development.map(link => renderDevelopmentItem(link, prDetails)).join('')}
    </div>
  `;
}

export function renderDevelopmentBadge(development: DevelopmentLink[]): string {
  if (development.length === 0) {
    return '';
  }
  return `
    <div class="kb-field-row kb-dev-badge">
      ${renderBranchForkIcon(BADGE_ICON_COLOR)}<span>${development.length}</span>
    </div>
  `;
}
```

Note: `renderDevelopmentSection`'s behavior and output are unchanged — only the icon markup was refactored into a shared helper (`renderBranchForkIcon`) so the badge can reuse the same path with a different fill color.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderDevelopment.test.ts`
Expected: PASS, all tests (existing `renderDevelopmentSection` tests + 3 new `renderDevelopmentBadge` tests).

- [ ] **Step 5: Commit**

```bash
git add src/view/renderDevelopment.ts src/view/renderDevelopment.test.ts
git commit -m "feat: add renderDevelopmentBadge for a compact icon+count display"
```

---

### Task 2: Card shows the badge; remove `prDetails` from the card data flow

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/renderHome.ts`
- Test: `src/view/renderWorkItemCard.test.ts`
- Test: `src/view/render.test.ts`
- Test: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `renderDevelopmentBadge` from Task 1.
- Produces: `renderWorkItemCard(workItem, config, cssClass, showActionButton?, avatars?, clickableTitle?, parent?, showParent?, selectedTeam?)` — note the `prDetails` parameter is gone; `RenderState` no longer has a `prDetails` field. Task 3 depends on this.

- [ ] **Step 1: Update `renderWorkItemCard.test.ts` for the new behavior**

In `src/view/renderWorkItemCard.test.ts`, replace these three tests (currently around lines 156–174):

```ts
  it('does not show a Development section when the work item has no development links', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-dev-label');
  });

  it('shows the Development section unconditionally when the work item has development links', () => {
    const item = workItem({ development: [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'main' }] });
    const html = renderWorkItemCard(item, config, 'kb-main-card');
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('main');
  });

  it('passes prDetails through to render a resolved pull request', () => {
    const item = workItem({ development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }] });
    const html = renderWorkItemCard(item, config, 'kb-main-card', true, {}, false, null, false, undefined, {
      'repo-1:57': { title: 'Fix login bug', status: 'active' },
    });
    expect(html).toContain('Fix login bug');
    expect(html).toContain('(Active)');
  });
});
```

with:

```ts
  it('does not show a Development badge when the work item has no development links', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-dev-badge');
  });

  it('shows a Development badge with the combined count when the work item has development links', () => {
    const item = workItem({
      development: [
        { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
        { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
      ],
    });
    const html = renderWorkItemCard(item, config, 'kb-main-card');
    expect(html).toContain('kb-dev-badge');
    expect(html).toContain('>2<');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts`
Expected: FAIL — card still renders `kb-dev-label` (the old itemized list), not `kb-dev-badge`.

- [ ] **Step 3: Update `renderWorkItemCard.ts`**

In `src/view/renderWorkItemCard.ts`:

Replace:
```ts
import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
```
with:
```ts
import type { WorkItem, KanbrainConfig } from '../types';
```

Replace:
```ts
import { renderDevelopmentSection } from './renderDevelopment';
```
with:
```ts
import { renderDevelopmentBadge } from './renderDevelopment';
```

Replace:
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
  prDetails: Record<string, PullRequestDetails> = {},
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentSection(workItem.development, prDetails);
```
with:
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
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentBadge(workItem.development);
```

- [ ] **Step 4: Update `render.ts`**

In `src/view/render.ts`:

Replace:
```ts
import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
```
with:
```ts
import type { WorkItem, KanbrainConfig } from '../types';
```

Replace:
```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
  prDetails?: Record<string, PullRequestDetails>;
}
```
with:
```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
}
```

Replace:
```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const prDetails = state.prDetails ?? {};
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, prDetails))
        .join('')
    : '<div class="kb-empty">No child items.</div>';
```
with:
```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam))
        .join('')
    : '<div class="kb-empty">No child items.</div>';
```

Replace:
```ts
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam, prDetails)}
```
with:
```ts
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam)}
```

- [ ] **Step 5: Update `renderHome.ts`**

In `src/view/renderHome.ts`, replace:
```ts
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedTeam, state.prDetails ?? {})}
```
with:
```ts
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedTeam)}
```

- [ ] **Step 6: Remove the now-obsolete `prDetails` threading tests**

In `src/view/render.test.ts`, delete this test (currently the last test in the file, around lines 345–362):

```ts
  it('passes prDetails through to the main card and subtasks', () => {
    const withDevelopment = workItem({ development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }] });
    const subtaskWithDevelopment = workItem({ id: 101, development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 58 }] });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: withDevelopment,
      parent: null,
      subtasks: [subtaskWithDevelopment],
      screen: 'flow',
      prDetails: {
        'repo-1:57': { title: 'Main PR', status: 'active' },
        'repo-1:58': { title: 'Sub PR', status: 'completed' },
      },
    });

    expect(html).toContain('Main PR');
    expect(html).toContain('Sub PR');
  });
```

In `src/view/renderHome.test.ts`, delete this test (around lines 148–156):

```ts
  it('passes prDetails through to the active work item card', () => {
    const html = renderHome(
      state({
        workItem: workItem({ development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }] }),
        prDetails: { 'repo-1:57': { title: 'Home PR', status: 'active' } },
      }),
    );

    expect(html).toContain('Home PR');
  });
```

- [ ] **Step 7: Run the full test suite to verify everything passes**

Run: `npx vitest run src/view/renderWorkItemCard.test.ts src/view/render.test.ts src/view/renderHome.test.ts`
Expected: PASS, no failures.

- [ ] **Step 8: Type-check**

Run: `npm run compile`
Expected: no errors (this confirms no other file still passes a `prDetails` argument/field that no longer exists).

- [ ] **Step 9: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/render.ts src/view/renderHome.ts src/view/renderWorkItemCard.test.ts src/view/render.test.ts src/view/renderHome.test.ts
git commit -m "feat: show a Development badge on cards instead of the itemized list"
```

---

### Task 3: Remove the now-dead PR-resolution code from `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `RenderState` from Task 2 (no longer has `prDetails`).
- Produces: nothing new — this is pure removal. No later task depends on this one.

- [ ] **Step 1: Remove the `prCache` field**

In `src/view/KanbrainViewProvider.ts`, replace:
```ts
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();
```
with:
```ts
  private avatarCache = new Map<string, string | null>();
```

- [ ] **Step 2: Remove the `resolvePullRequestDetails` method**

Delete this whole method (currently lines 212–242):
```ts
  private async resolvePullRequestDetails(items: WorkItem[]): Promise<Record<string, PullRequestDetails>> {
    if (!this.client || !this.workspaceRoot) {
      return {};
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return {};
    }

    const prLinks = items.flatMap(i =>
      i.development.filter((d): d is Extract<DevelopmentLink, { kind: 'pullRequest' }> => d.kind === 'pullRequest'),
    );
    const uncached = prLinks.filter(link => !this.prCache.has(`${link.repositoryId}:${link.pullRequestId}`));

    await Promise.all(
      uncached.map(async link => {
        const key = `${link.repositoryId}:${link.pullRequestId}`;
        this.prCache.set(key, await this.client!.getPullRequest(config.organization, config.project, link.repositoryId, link.pullRequestId));
      }),
    );

    const resolved: Record<string, PullRequestDetails> = {};
    for (const link of prLinks) {
      const key = `${link.repositoryId}:${link.pullRequestId}`;
      const details = this.prCache.get(key);
      if (details) {
        resolved[key] = details;
      }
    }
    return resolved;
  }

```
(leave the blank line separating the previous method, `resolveAvatars`, from the one after it, `setShowAssignedTo`)

- [ ] **Step 3: Remove `prDetails` from `refresh()`**

Replace:
```ts
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
    const prDetails = config ? await this.resolvePullRequestDetails([workItem, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
```
with:
```ts
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
```

Replace:
```ts
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
        prDetails,
      }),
```
with:
```ts
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
      }),
```

- [ ] **Step 4: Drop the now-unused type imports**

Replace:
```ts
import type { WorkItem, KanbrainConfig, SkillEntry, DevelopmentLink, PullRequestDetails } from '../types';
```
with:
```ts
import type { WorkItem, KanbrainConfig, SkillEntry } from '../types';
```

- [ ] **Step 5: Swap the card's dead CSS rules for the badge's rule**

Replace:
```ts
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
```
with:
```ts
      .kb-dev-badge { display: flex; align-items: center; gap: 4px; font-size: 12px; }
      .kb-dev-badge svg { flex-shrink: 0; }
```

- [ ] **Step 6: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no failures (there is no dedicated test file for `KanbrainViewProvider.ts`, consistent with the existing pattern — this file is verified via compile + the full suite + manual check in Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "refactor: remove dead PR-details polling now that the card only shows a count"
```

---

### Task 4: Full itemized list moves to the work item detail panel

**Files:**
- Modify: `src/view/renderWorkItemDetail.ts`
- Modify: `src/view/WorkItemDetailPanelManager.ts`
- Test: `src/view/renderWorkItemDetail.test.ts`

**Interfaces:**
- Consumes: `renderDevelopmentSection` from `./renderDevelopment` (unchanged, from Task 1's file).
- Produces: `WorkItemDetailInput` gains a required `prDetails: Record<string, PullRequestDetails>` field — no other task depends on this.

- [ ] **Step 1: Write the failing tests**

In `src/view/renderWorkItemDetail.test.ts`, update the `input()` helper (around line 32) to include the new required field:

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
    prDetails: {},
    ...overrides,
  };
}
```

Replace (currently lines 122–131, the last test in the `describe('renderWorkItemDetail', ...)` block and its closing brace):

```ts
  it('strips script tags from comment bodies', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<script>alert(1)</script>ok', createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).not.toContain('<script>');
    expect(html).toContain('ok');
  });
});
```

with:

```ts
  it('strips script tags from comment bodies', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<script>alert(1)</script>ok', createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).not.toContain('<script>');
    expect(html).toContain('ok');
  });

  it('does not show a Development section when the work item has no development links', () => {
    const html = renderWorkItemDetail(input());
    expect(html).not.toContain('kb-dev-label');
  });

  it('shows the Development section with resolved pull request details when the work item has development links', () => {
    const html = renderWorkItemDetail(
      input({
        workItem: workItem({ development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }] }),
        prDetails: { 'repo-1:57': { title: 'Fix login bug', status: 'active' } },
      }),
    );
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('#57 Fix login bug (Active)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: FAIL — TypeScript error, `prDetails` does not exist on type `WorkItemDetailInput` (the test file references a field the interface doesn't have yet).

- [ ] **Step 3: Update `renderWorkItemDetail.ts`**

Replace:
```ts
import type { WorkItem, KanbrainConfig } from '../types';
import type { DetailGroup, DetailField, WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';
```
with:
```ts
import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
import type { DetailGroup, DetailField, WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';
import { renderDevelopmentSection } from './renderDevelopment';
```

Replace:
```ts
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
```
with:
```ts
export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
  prDetails: Record<string, PullRequestDetails>;
}

export function renderWorkItemDetail(input: WorkItemDetailInput): string {
  const { workItem, config, description, groups, htmlSections, comments, avatars, prDetails } = input;
```

Replace:
```ts
      <div class="kb-detail-side">
        ${groups.map(renderDetailGroup).join('')}
      </div>
```
with:
```ts
      <div class="kb-detail-side">
        ${groups.map(renderDetailGroup).join('')}
        ${renderDevelopmentSection(workItem.development, prDetails)}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Wire PR resolution into `WorkItemDetailPanelManager.ts`**

Replace:
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
```
with:
```ts
import * as vscode from 'vscode';
import type { WorkItem, KanbrainConfig, DevelopmentLink, PullRequestDetails } from '../types';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { resolveDetailFields } from '../azureDevOps/workItemDetail';
import { readConfig } from '../config/config';
import { renderWorkItemDetail } from './renderWorkItemDetail';

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();
```

Replace:
```ts
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
```
with:
```ts
    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const [avatars, prDetails] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
    ]);

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
        prDetails,
      }),
    );
```

Add a new private method right after `resolveAvatars` (which ends with `return resolved;\n  }`):

```ts

  private async resolvePullRequestDetails(workItem: WorkItem, config: KanbrainConfig): Promise<Record<string, PullRequestDetails>> {
    const prLinks = workItem.development.filter((d): d is Extract<DevelopmentLink, { kind: 'pullRequest' }> => d.kind === 'pullRequest');
    const uncached = prLinks.filter(link => !this.prCache.has(`${link.repositoryId}:${link.pullRequestId}`));

    await Promise.all(
      uncached.map(async link => {
        const key = `${link.repositoryId}:${link.pullRequestId}`;
        this.prCache.set(key, await this.client.getPullRequest(config.organization, config.project, link.repositoryId, link.pullRequestId));
      }),
    );

    const resolved: Record<string, PullRequestDetails> = {};
    for (const link of prLinks) {
      const key = `${link.repositoryId}:${link.pullRequestId}`;
      const details = this.prCache.get(key);
      if (details) {
        resolved[key] = details;
      }
    }
    return resolved;
  }
```

- [ ] **Step 6: Add the CSS the moved section needs**

In `WorkItemDetailPanelManager.ts`'s `css()` method, replace:
```ts
      .kb-comment-body { line-height: 1.5; }
    `;
```
with:
```ts
      .kb-comment-body { line-height: 1.5; }
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
    `;
```

- [ ] **Step 7: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no failures (there is no dedicated test file for `WorkItemDetailPanelManager.ts` — same precedent as `resolveAvatars`, coupled to the VS Code API/client. Verified via compile + full suite + manual check in Task 5).

- [ ] **Step 9: Commit**

```bash
git add src/view/renderWorkItemDetail.ts src/view/renderWorkItemDetail.test.ts src/view/WorkItemDetailPanelManager.ts
git commit -m "feat: show the full Development list (branches/PRs) in the work item detail panel"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass, no failures.

- [ ] **Step 2: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 3: Manual verification (F5)**

Press F5 to launch the Extension Development Host. Open a work item card (Flow or Home) that has a linked branch or PR:
- Confirm the card shows the gold fork icon + a number (not a list), matching the total count of linked branches+PRs.
- Click the card's title to open the detail panel; confirm the side column shows the full "Development" list with branch names / `#id title (Status)` for each linked item, same as before this change.

- [ ] **Step 4: Report back**

Tell the user the manual F5 check outcome — if the count or the detail list looks wrong for a real work item, capture what was linked in Azure DevOps vs. what rendered, so the discrepancy can be investigated.
