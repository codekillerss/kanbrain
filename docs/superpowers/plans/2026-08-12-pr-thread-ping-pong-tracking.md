# PR Thread Ping-Pong Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new views to the Kanbrain Reviews page — "Fixed" (PRs where every thread I opened is now resolved, so I should re-review) and "Needs my fix" (my own PRs that still have an unresolved review thread) — driven by Azure DevOps PR *thread* status rather than the PR's own status or the reviewer's vote (which stays stuck at Rejected/Waiting unless a branch policy resets it).

**Architecture:** Three exclusive top-level tabs (All / Fixed / Needs my fix) replace the page's implicit single-status view. Only the "All" tab keeps today's controls — a status filter (now multi-select, since Azure only accepts one status per API call so multiple selections mean parallel calls merged client-side) and the existing My PRs / Assigned to me checkboxes. "Fixed" and "Needs my fix" have no visible controls — their scope (`reviewerId`/`creatorId` = current user, status = Active) is implicit in the tab itself. Classifying a PR as "Fixed" or "Needs my fix" requires its thread list, fetched per-PR (Azure has no cross-PR thread endpoint) only for the already-narrow list of PRs each tab's base query returns.

**Tech Stack:** TypeScript, VS Code Webview API, Vitest.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-08-12-pr-thread-ping-pong-tracking-design.md`.
- Test command: `npm run test:unit` (vitest). Run scoped with `npx vitest run <path>` per task, full suite before each task's commit.
- `KanbrainViewProvider.ts` has no automated test coverage (no test file exists) — its task in this plan is verified by `npm run compile` plus careful manual re-reading, the standard already used for this file's existing untested code.
- A thread counts as "resolved" only for these exact `status` values: `fixed`, `closed`, `wontFix`, `byDesign`. `active`, `pending`, and `unknown` all count as unresolved. A PR with zero threads I opened is never "Fixed" — an empty set must not vacuously count as "all resolved."
- `getPullRequestThreads` already filters out system-generated comments (`commentType !== 'text'`) and threads left with zero comments after that filter — no additional system-message filtering is needed anywhere in this plan.
- The "thread I opened" check compares `thread.comments[0].createdBy.id` against the current user's id (`AssignedTo.id`, added by Task 1) — comparing by `displayName` is not acceptable (not guaranteed unique).
- `reviewsStatusFilters` (the new multi-select array) must never be emptied by the UI — toggling off the last remaining selected status is a no-op, both client-side (webview JS) and server-side (`KanbrainViewProvider`).
- A single PR's thread-fetch failing (network error, deleted repo, etc.) inside the "Fixed"/"Needs my fix" per-PR `Promise.all` must not fail the whole tab — that PR is silently excluded, the rest of the list still renders.

---

### Task 1: `AssignedTo.id` and `mapIdentityRef`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `AssignedTo.id?: string` — consumed by Task 2 (`classifyPrThreads`'s comparison against `currentUserId`).

- [ ] **Step 1: Add the optional `id` field to `AssignedTo`**

In `src/types.ts`, replace:

```ts
export interface AssignedTo {
  displayName: string;
  imageUrl: string | null;
}
```

with:

```ts
export interface AssignedTo {
  id?: string;
  displayName: string;
  imageUrl: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Add to `src/azureDevOps/client.test.ts`, inside the existing `describe('AzureDevOpsClient.getPullRequestThreads', ...)` block (after the last existing `it(...)` in that block — the one titled `'excludes deleted comments, dropping the thread entirely if none remain'`):

```ts
  it('captures the comment author id when present, for identifying who opened a thread', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: 148,
            status: 'active',
            comments: [
              {
                id: 1,
                content: 'Please fix this',
                author: { id: 'user-123', displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
                publishedDate: '2026-01-02T00:00:00Z',
                commentType: 'text',
              },
            ],
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const threads = await client.getPullRequestThreads('my-org', 'MyProject', 'repo-1', 57);

    expect(threads[0].comments[0].createdBy).toEqual({ id: 'user-123', displayName: 'Jane', imageUrl: 'https://example.com/jane.png' });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `createdBy` currently comes back as `{ displayName: 'Jane', imageUrl: '...' }` with no `id` key, so `toEqual` fails on the missing `id: 'user-123'`.

- [ ] **Step 3: Capture the id in `mapIdentityRef`**

In `src/azureDevOps/client.ts`, replace:

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

with:

```ts
interface RawIdentityRef {
  id?: string;
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function mapIdentityRef(raw: unknown): AssignedTo {
  const identity = raw as RawIdentityRef | undefined;
  const imageUrl = identity?.imageUrl ?? identity?._links?.avatar?.href ?? null;
  return { id: identity?.id, displayName: identity?.displayName ?? 'Unknown', imageUrl };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS (all tests in the file, old and new — pre-existing tests whose fixtures have no `author.id` keep passing because `toEqual` treats an `undefined` property as equivalent to an absent one, and `identity?.id` is `undefined` when the raw fixture has no `id`).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: capture identity id in mapIdentityRef, add AssignedTo.id"
```

---

### Task 2: `classifyPrThreads` pure helper

**Files:**
- Create: `src/azureDevOps/classifyPrThreads.ts`
- Test: `src/azureDevOps/classifyPrThreads.test.ts`

**Interfaces:**
- Consumes: `PullRequestThread` from `../types` (existing type, unchanged); `AssignedTo.id` (Task 1).
- Produces: `export interface PrThreadClassification { hasAnyActiveThread: boolean; hasMyThreadsAllResolved: boolean; }` and `export function classifyPrThreads(threads: PullRequestThread[], currentUserId: string): PrThreadClassification` — consumed by Task 4 (`KanbrainViewProvider.fetchReviewsPullRequests`).

- [ ] **Step 1: Write the failing tests**

Create `src/azureDevOps/classifyPrThreads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyPrThreads } from './classifyPrThreads';
import type { PullRequestThread } from '../types';

function thread(overrides: Partial<PullRequestThread> & { openedById?: string } = {}): PullRequestThread {
  const { openedById, ...rest } = overrides;
  return {
    id: 1,
    status: 'active',
    filePath: null,
    line: null,
    comments: [
      {
        id: 1,
        parentCommentId: 0,
        text: 'Please fix this',
        createdBy: { id: openedById ?? 'other-user', displayName: 'Someone', imageUrl: null },
        createdDate: '2026-01-01T00:00:00Z',
      },
    ],
    ...rest,
  };
}

describe('classifyPrThreads', () => {
  it('hasAnyActiveThread is true when any thread (from anyone) is active', () => {
    const result = classifyPrThreads([thread({ status: 'active', openedById: 'reviewer-1' })], 'me');
    expect(result.hasAnyActiveThread).toBe(true);
  });

  it('hasAnyActiveThread is false when no thread is active', () => {
    const result = classifyPrThreads([thread({ status: 'fixed', openedById: 'reviewer-1' })], 'me');
    expect(result.hasAnyActiveThread).toBe(false);
  });

  it('hasMyThreadsAllResolved is true when every thread I opened is resolved', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'closed', openedById: 'me' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(true);
  });

  it('hasMyThreadsAllResolved is false when at least one thread I opened is still active', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'active', openedById: 'me' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(false);
  });

  it('hasMyThreadsAllResolved is false when I opened no threads at all (empty set is not "all resolved")', () => {
    const result = classifyPrThreads([thread({ status: 'fixed', openedById: 'reviewer-1' })], 'me');
    expect(result.hasMyThreadsAllResolved).toBe(false);
  });

  it('ignores other people\'s resolved/unresolved threads when computing hasMyThreadsAllResolved', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'active', openedById: 'reviewer-2' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(true);
  });

  it('treats pending and unknown statuses as unresolved, not fixed', () => {
    const pending = classifyPrThreads([thread({ status: 'pending', openedById: 'me' })], 'me');
    expect(pending.hasMyThreadsAllResolved).toBe(false);
    const unknown = classifyPrThreads([thread({ status: 'unknown', openedById: 'me' })], 'me');
    expect(unknown.hasMyThreadsAllResolved).toBe(false);
  });

  it('returns both false for an empty thread list', () => {
    const result = classifyPrThreads([], 'me');
    expect(result).toEqual({ hasAnyActiveThread: false, hasMyThreadsAllResolved: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/classifyPrThreads.test.ts`
Expected: FAIL — cannot find module `./classifyPrThreads` (file doesn't exist yet).

- [ ] **Step 3: Implement `classifyPrThreads`**

Create `src/azureDevOps/classifyPrThreads.ts`:

```ts
import type { PullRequestThread } from '../types';

const RESOLVED_STATUSES = new Set(['fixed', 'closed', 'wontFix', 'byDesign']);

export interface PrThreadClassification {
  hasAnyActiveThread: boolean;
  hasMyThreadsAllResolved: boolean;
}

export function classifyPrThreads(threads: PullRequestThread[], currentUserId: string): PrThreadClassification {
  const hasAnyActiveThread = threads.some(t => t.status === 'active');

  const myThreads = threads.filter(t => t.comments[0]?.createdBy.id === currentUserId);
  const hasMyThreadsAllResolved = myThreads.length > 0 && myThreads.every(t => RESOLVED_STATUSES.has(t.status));

  return { hasAnyActiveThread, hasMyThreadsAllResolved };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/classifyPrThreads.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/classifyPrThreads.ts src/azureDevOps/classifyPrThreads.test.ts
git commit -m "feat: add classifyPrThreads to detect fixed/needs-fix PRs from thread status"
```

---

### Task 3: Reviews page markup — `renderReviews.ts` and `render.ts`

**Files:**
- Modify: `src/view/renderReviews.ts`
- Modify: `src/view/render.ts`
- Test: `src/view/renderReviews.test.ts` (full replacement — see Step 1)

**Interfaces:**
- Consumes: nothing new from earlier tasks — this task is markup-only, driven by `RenderState` fields it defines itself.
- Produces: `RenderState.reviewsTab?: 'all' | 'fixed' | 'needsMyFix'` and `RenderState.reviewsStatusFilters?: ('active' | 'completed' | 'abandoned')[]` (replacing the old `reviewsStatusFilter?: 'active' | 'completed' | 'abandoned'`) — consumed by Task 4 (`KanbrainViewProvider`'s call into `render()`).
- Produces: `data-action="set-reviews-tab"` / `data-tab="..."` on the 3 new top tabs, and `data-action="toggle-reviews-status-filter"` / `data-status="..."` on the status multi-select buttons (replacing `data-action="set-reviews-status-filter"`) — consumed by Task 4's webview click handlers.

This task changes `RenderState`'s shape, so the whole test file needs the field rename applied everywhere it appears — done as one full-file replacement in Step 1 rather than 20 individual edits, to guarantee nothing is missed.

- [ ] **Step 1: Replace `src/view/renderReviews.test.ts` in full**

```ts
import { describe, it, expect } from 'vitest';
import { renderReviews } from './renderReviews';
import type { RenderState } from './render';
import type { KanbrainConfig, PullRequestSummary } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function pr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    id: 57,
    repositoryId: 'repo-1',
    repositoryName: 'kanbrain',
    title: 'Fix <login> bug',
    status: 'active',
    isDraft: false,
    sourceBranch: 'feature/login-fix',
    targetBranch: 'main',
    createdBy: { displayName: 'Jane Doe', imageUrl: null },
    creationDate: '2026-07-30T11:00:00Z',
    webUrl: 'https://dev.azure.com/org/proj/_git/kanbrain/pullrequest/57',
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'reviews',
    ...overrides,
  };
}

describe('renderReviews', () => {
  it('shows an empty message for the active filter when there are no pull requests', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('No active pull requests.');
  });

  it('shows an empty message reflecting a non-default filter', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    expect(html).toContain('No completed pull requests.');
  });

  it('shows a generic empty message when multiple statuses are selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'completed'] }));
    expect(html).toContain('No pull requests match the selected status filters.');
  });

  it('shows the status filter as tabs, not a select', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'] }));
    expect(html).not.toContain('<select');
    expect(html).toContain('kb-search-tabs');
    expect(html).toContain('data-action="toggle-reviews-status-filter"');
  });

  it('wraps the pull request groups in a scrollable list separate from the filters header', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    const filtersIndex = html.indexOf('kb-reviews-filters');
    const listIndex = html.indexOf('kb-reviews-list');
    const groupIndex = html.indexOf('kb-review-repo-group');
    expect(listIndex).toBeGreaterThan(filtersIndex);
    expect(groupIndex).toBeGreaterThan(listIndex);
  });

  it('shows "My PRs" and "Assigned to me" checkboxes, both unchecked by default', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    expect(html).toContain('id="kb-reviews-filter-mine"');
    expect(html).toContain('My PRs');
    expect(html).toContain('id="kb-reviews-filter-assigned"');
    expect(html).toContain('Assigned to me');

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).not.toContain('checked');

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).not.toContain('checked');
  });

  it('checks only "My PRs" when reviewsOwnerFilter is "mine"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'mine' }));

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).toContain('checked');

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).not.toContain('checked');
  });

  it('checks only "Assigned to me" when reviewsOwnerFilter is "assigned"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'assigned' }));

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).toContain('checked');

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).not.toContain('checked');
  });

  it('appends "created by you" to the empty message when reviewsOwnerFilter is "mine"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'mine' }));
    expect(html).toContain('No active pull requests created by you.');
  });

  it('appends "assigned to you" to the empty message when reviewsOwnerFilter is "assigned"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'assigned' }));
    expect(html).toContain('No active pull requests assigned to you.');
  });

  it('marks the selected status tab as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const tabStart = html.indexOf('data-status="completed"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('does not mark non-selected status tabs as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const tabStart = html.indexOf('data-status="active"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).not.toContain('kb-search-tab-active');
  });

  it('marks multiple status tabs as active at once when multiple are selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'abandoned'] }));
    const activeStart = html.indexOf('data-status="active"');
    const activeTag = html.slice(html.lastIndexOf('<button', activeStart), html.indexOf('>', activeStart));
    expect(activeTag).toContain('kb-search-tab-active');
    const abandonedStart = html.indexOf('data-status="abandoned"');
    const abandonedTag = html.slice(html.lastIndexOf('<button', abandonedStart), html.indexOf('>', abandonedStart));
    expect(abandonedTag).toContain('kb-search-tab-active');
    const completedStart = html.indexOf('data-status="completed"');
    const completedTag = html.slice(html.lastIndexOf('<button', completedStart), html.indexOf('>', completedStart));
    expect(completedTag).not.toContain('kb-search-tab-active');
  });

  it('groups pull requests into a section card per repository, with the repo shown as a tag plus a count in the header', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-section-card');
    expect(html).toContain('kb-chevron');
    expect(html).toContain('kb-collapsible-body');
    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('kanbrain');
    expect(html).toContain('(1)');
  });

  it('renders the count as its own trailing element so it lands opposite the repo tag (kb-section-label justifies space-between)', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('<span class="kb-review-group-count">(1)</span>');
  });

  it('marks the repo tag as unmapped when there is no local path configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: {} }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-repo-tag-unmapped');
  });

  it('does not mark the repo tag as unmapped when a local path is configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '/local/kanbrain' } } }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).not.toContain('kb-repo-tag-unmapped');
  });

  it('puts pull requests from different repos into separate groups', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [
          pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
          pr({ id: 2, repositoryId: 'repo-2', repositoryName: 'ado-shared-libs' }),
        ],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kanbrain');
    expect(html).toContain('ado-shared-libs');
    expect(html.split('kb-review-repo-group').length - 1).toBe(2);
  });

  it('keeps pull requests from the same repo under one group', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [
          pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
          pr({ id: 2, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
        ],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('(2)');
    expect(html.split('kb-review-repo-group').length - 1).toBe(1);
  });

  it('renders the title as its own link on the first line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('class="kb-review-row-title"');
    expect(html).toContain('#57');
    expect(html).toContain('Fix &lt;login&gt; bug');
  });

  it('escapes the title instead of injecting raw HTML', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilters: ['active'] }));
    expect(html).not.toContain('Fix <login> bug');
  });

  it('links the title to the openPullRequestDetail command with repositoryId and id', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ repositoryId: 'repo-1', id: 57 })], reviewsStatusFilters: ['active'] }));
    const commandArgs = encodeURIComponent(JSON.stringify(['repo-1', 57]));
    expect(html).toContain(`command:kanbrain.openPullRequestDetail?${commandArgs}`);
  });

  it('shows the assignee as an avatar-initial plus name on the second line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ createdBy: { displayName: 'Jane Doe', imageUrl: null } })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>J<');
    expect(html).toContain('kb-review-row-author');
    expect(html).toContain('Jane Doe');
  });

  it('shows the branch as a real branch tag, not plain text', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '/local/kanbrain' } } }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', sourceBranch: 'feature/login-fix' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-branch-tag');
    expect(html).toContain('feature/login-fix');
  });

  it('renders the branch tag as disabled (not a checkout link) when the repo has no local path configured', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: {} }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', sourceBranch: 'feature/login-fix' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-branch-tag-disabled');
  });

  it('colors the row border for the status instead of showing a status badge', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'active', isDraft: false })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('border-left-color: var(--vscode-charts-blue)');
    expect(html).not.toContain('kb-review-status-badge');
  });

  it('colors the row border yellow and titles it Draft for draft PRs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'completed', isDraft: true })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('border-left-color: var(--vscode-charts-yellow)');
    expect(html).toContain('title="Draft"');
  });

  it('sorts pull requests newest first within a group', () => {
    const older = pr({ id: 1, creationDate: '2026-07-20T00:00:00Z', title: 'Older' });
    const newer = pr({ id: 2, creationDate: '2026-07-29T00:00:00Z', title: 'Newer' });
    const html = renderReviews(state({ reviewsPullRequests: [older, newer], reviewsStatusFilters: ['active'] }));
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });

  it('shows three top-level tabs: All, Fixed, Needs my fix', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    expect(html).toContain('data-action="set-reviews-tab" data-tab="all"');
    expect(html).toContain('data-action="set-reviews-tab" data-tab="fixed"');
    expect(html).toContain('data-action="set-reviews-tab" data-tab="needsMyFix"');
    expect(html).toContain('>All<');
    expect(html).toContain('>Fixed<');
    expect(html).toContain('>Needs my fix<');
  });

  it('marks the "all" tab active by default', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    const tabStart = html.indexOf('data-tab="all"');
    const tag = html.slice(html.lastIndexOf('<button', tabStart), html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('marks the "fixed" tab active when reviewsTab is "fixed"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    const tabStart = html.indexOf('data-tab="fixed"');
    const tag = html.slice(html.lastIndexOf('<button', tabStart), html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('shows the status multi-select and owner checkboxes only on the "all" tab', () => {
    const onAll = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'all' }));
    expect(onAll).toContain('data-action="toggle-reviews-status-filter"');
    expect(onAll).toContain('id="kb-reviews-filter-mine"');

    const onFixed = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    expect(onFixed).not.toContain('data-action="toggle-reviews-status-filter"');
    expect(onFixed).not.toContain('id="kb-reviews-filter-mine"');

    const onNeedsMyFix = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'needsMyFix' }));
    expect(onNeedsMyFix).not.toContain('data-action="toggle-reviews-status-filter"');
    expect(onNeedsMyFix).not.toContain('id="kb-reviews-filter-mine"');
  });

  it('shows a dedicated empty message on the "fixed" tab', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    expect(html).toContain('No pull requests fixed and ready for re-review.');
  });

  it('shows a dedicated empty message on the "needsMyFix" tab', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'needsMyFix' }));
    expect(html).toContain('No pull requests need your fix.');
  });

  it('still renders the pull request list normally on the "fixed"/"needsMyFix" tabs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsTab: 'fixed' }));
    expect(html).toContain('kb-review-repo-group');
    expect(html).toContain('#57');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderReviews.test.ts`
Expected: FAIL — `RenderState` doesn't have `reviewsStatusFilters`/`reviewsTab` yet (TypeScript compile error surfaces as a vitest failure), and `renderReviews` doesn't render the new tabs or accept the new fields.

- [ ] **Step 3: Update `RenderState`**

In `src/view/render.ts`, replace:

```ts
  reviewsPullRequests?: PullRequestSummary[];
  reviewsStatusFilter?: 'active' | 'completed' | 'abandoned';
  reviewsOwnerFilter?: 'all' | 'mine' | 'assigned';
}
```

with:

```ts
  reviewsPullRequests?: PullRequestSummary[];
  reviewsTab?: 'all' | 'fixed' | 'needsMyFix';
  reviewsStatusFilters?: ('active' | 'completed' | 'abandoned')[];
  reviewsOwnerFilter?: 'all' | 'mine' | 'assigned';
}
```

- [ ] **Step 4: Replace `src/view/renderReviews.ts` in full**

```ts
import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { resolvePrStatusColor } from './renderPrStatus';
import { capitalize } from './renderDevelopment';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';
import { renderAvatarOrInitial } from './renderAssignee';

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const OWNER_FILTER_OPTIONS: { value: 'mine' | 'assigned'; id: string; label: string }[] = [
  { value: 'mine', id: 'kb-reviews-filter-mine', label: 'My PRs' },
  { value: 'assigned', id: 'kb-reviews-filter-assigned', label: 'Assigned to me' },
];

const TAB_OPTIONS: { value: 'all' | 'fixed' | 'needsMyFix'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'needsMyFix', label: 'Needs my fix' },
];

function renderReviewsTopTabs(selected: 'all' | 'fixed' | 'needsMyFix'): string {
  return `
    <div class="kb-search-tabs">
      ${TAB_OPTIONS.map(
        o =>
          `<button type="button" class="kb-search-tab${o.value === selected ? ' kb-search-tab-active' : ''}" data-action="set-reviews-tab" data-tab="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewsStatusMultiSelect(selected: ('active' | 'completed' | 'abandoned')[]): string {
  return `
    <div class="kb-search-tabs">
      ${STATUS_FILTER_OPTIONS.map(
        o =>
          `<button type="button" class="kb-search-tab${selected.includes(o.value) ? ' kb-search-tab-active' : ''}" data-action="toggle-reviews-status-filter" data-status="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewsOwnerFilters(selected: 'all' | 'mine' | 'assigned'): string {
  return `
    <div class="kb-reviews-owner-filters">
      ${OWNER_FILTER_OPTIONS.map(
        o => `
          <label class="kb-checkbox-row">
            <input type="checkbox" id="${o.id}" ${selected === o.value ? 'checked' : ''}>
            ${o.label}
          </label>
        `,
      ).join('')}
    </div>
  `;
}

function renderReviewRow(pr: PullRequestSummary, repositories: Record<string, RepositoryPathEntry>): string {
  const statusColor = resolvePrStatusColor(pr.status, pr.isDraft);
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));
  const isMapped = !!repositories[pr.repositoryId]?.path;
  const branchTagHtml = renderBranchTag(pr.sourceBranch, isMapped ? [pr.repositoryId, pr.sourceBranch] : null);
  const avatarHtml = renderAvatarOrInitial(pr.createdBy.displayName, pr.createdBy.imageUrl, {});

  return `
    <div class="kb-review-row" style="border-left-color: ${statusColor}" title="${escapeHtml(statusLabel)}">
      <a class="kb-review-row-title" href="command:kanbrain.openPullRequestDetail?${commandArgs}">#${pr.id} ${escapeHtml(pr.title)}</a>
      <div class="kb-review-row-meta">
        ${avatarHtml}<span class="kb-review-row-author">${escapeHtml(pr.createdBy.displayName)}</span>
        ${branchTagHtml}
      </div>
    </div>
  `;
}

interface RepoGroup {
  repositoryId: string;
  label: string;
  items: PullRequestSummary[];
}

function groupByRepo(prs: PullRequestSummary[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  for (const pr of prs) {
    const existing = groups.get(pr.repositoryId);
    if (existing) {
      existing.items.push(pr);
    } else {
      groups.set(pr.repositoryId, { repositoryId: pr.repositoryId, label: pr.repositoryName, items: [pr] });
    }
  }
  return [...groups.values()];
}

function renderRepoGroup(group: RepoGroup, repositories: Record<string, RepositoryPathEntry>): string {
  const repoTagHtml = renderRepoTag(group.repositoryId, repositories[group.repositoryId] ?? { name: group.label, path: '' });

  return `
    <div class="kb-section-card kb-review-repo-group">
      <div class="kb-section-label" data-action="toggle-group">
        <span><span class="kb-chevron">▾</span>${repoTagHtml}</span>
        <span class="kb-review-group-count">(${group.items.length})</span>
      </div>
      <div class="kb-collapsible-body">
        ${group.items.map(pr => renderReviewRow(pr, repositories)).join('')}
      </div>
    </div>
  `;
}

function renderEmptyMessage(
  tab: 'all' | 'fixed' | 'needsMyFix',
  statusFilters: ('active' | 'completed' | 'abandoned')[],
  ownerFilter: 'all' | 'mine' | 'assigned',
): string {
  if (tab === 'fixed') {
    return '<div class="kb-empty">No pull requests fixed and ready for re-review.</div>';
  }
  if (tab === 'needsMyFix') {
    return '<div class="kb-empty">No pull requests need your fix.</div>';
  }
  const ownerSuffix = ownerFilter === 'mine' ? ' created by you' : ownerFilter === 'assigned' ? ' assigned to you' : '';
  if (statusFilters.length === 1) {
    return `<div class="kb-empty">No ${statusFilters[0]} pull requests${ownerSuffix}.</div>`;
  }
  return `<div class="kb-empty">No pull requests${ownerSuffix} match the selected status filters.</div>`;
}

export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const repositories = config.repositories ?? {};
  const tab = state.reviewsTab ?? 'all';
  const statusFilters = state.reviewsStatusFilters ?? ['active'];
  const ownerFilter = state.reviewsOwnerFilter ?? 'all';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsTopTabs(tab)}
    <div class="kb-reviews-filters">
      ${tab === 'all' ? `${renderReviewsStatusMultiSelect(statusFilters)}${renderReviewsOwnerFilters(ownerFilter)}` : ''}
    </div>
    <div class="kb-reviews-list">
      ${
        sorted.length
          ? groupByRepo(sorted)
              .map(group => renderRepoGroup(group, repositories))
              .join('')
          : renderEmptyMessage(tab, statusFilters, ownerFilter)
      }
    </div>
  `;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderReviews.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS. `npm run compile` is important here — it will surface every other call site in `KanbrainViewProvider.ts` that still passes the old `reviewsStatusFilter` (singular) field into `render()`, which Task 4 fixes. It's expected that `KanbrainViewProvider.ts` itself won't compile yet after this task alone if it references the removed field — if `npm run compile` fails specifically on `KanbrainViewProvider.ts`'s reference to `reviewsStatusFilter`, that's expected and resolved by Task 4; do not attempt to fix `KanbrainViewProvider.ts` in this task.

- [ ] **Step 7: Commit**

```bash
git add src/view/render.ts src/view/renderReviews.ts src/view/renderReviews.test.ts
git commit -m "feat: add All/Fixed/Needs-my-fix tabs and status multi-select to the Reviews page markup"
```

---

### Task 4: Backend wiring and webview JS — `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

No test file exists for this class — verification is `npm run compile` plus careful manual re-reading against the exact code below.

**Interfaces:**
- Consumes: `classifyPrThreads` from `../azureDevOps/classifyPrThreads` (Task 2); `RenderState.reviewsTab`/`reviewsStatusFilters` (Task 3); `client.getPullRequestThreads` (existing, unchanged signature).

- [ ] **Step 1: Add the import**

At the top of `src/view/KanbrainViewProvider.ts`, change:

```ts
import { filterWorkItemsByText, countItemsByType } from '../azureDevOps/wiql';
```

to:

```ts
import { filterWorkItemsByText, countItemsByType } from '../azureDevOps/wiql';
import { classifyPrThreads } from '../azureDevOps/classifyPrThreads';
```

- [ ] **Step 2: Replace the reviews state fields**

Find:

```ts
  private reviewsStatusFilter: 'active' | 'completed' | 'abandoned' = 'active';
  private reviewsOwnerFilter: 'all' | 'mine' | 'assigned' = 'all';
  private reviewsPullRequests: PullRequestSummary[] = [];
  private currentUserId: string | null | undefined;
  private lastReviewsFetchAt = 0;
  private lastReviewsStatusFilterFetched: 'active' | 'completed' | 'abandoned' | undefined;
  private lastReviewsOwnerFilterFetched: 'all' | 'mine' | 'assigned' | undefined;
```

Replace with:

```ts
  private reviewsTab: 'all' | 'fixed' | 'needsMyFix' = 'all';
  private reviewsStatusFilters: Array<'active' | 'completed' | 'abandoned'> = ['active'];
  private reviewsOwnerFilter: 'all' | 'mine' | 'assigned' = 'all';
  private reviewsPullRequests: PullRequestSummary[] = [];
  private currentUserId: string | null | undefined;
  private lastReviewsFetchAt = 0;
  private lastReviewsFilterKeyFetched: string | undefined;
```

(This is a targeted replacement — the surrounding fields, e.g. `private workItemHistoryIds`, are untouched; find this exact block by its unique field names.)

- [ ] **Step 3: Replace the message routing for the reviews filters**

Find:

```ts
      } else if (message.type === 'set-reviews-status-filter') {
        this.setReviewsStatusFilter(message.status);
      } else if (message.type === 'set-reviews-owner-filter') {
        this.setReviewsOwnerFilter(message.value);
```

Replace with:

```ts
      } else if (message.type === 'set-reviews-tab') {
        this.setReviewsTab(message.tab);
      } else if (message.type === 'toggle-reviews-status-filter') {
        this.toggleReviewsStatusFilter(message.status);
      } else if (message.type === 'set-reviews-owner-filter') {
        this.setReviewsOwnerFilter(message.value);
```

- [ ] **Step 4: Replace `setReviewsStatusFilter` with `setReviewsTab` and `toggleReviewsStatusFilter`**

Find:

```ts
  private setReviewsStatusFilter(status: unknown): void {
    if (status !== 'active' && status !== 'completed' && status !== 'abandoned') {
      return;
    }
    if (status === this.reviewsStatusFilter) {
      // Already on this tab — the periodic 10s poll (REVIEWS_POLL_INTERVAL_MS) keeps it fresh,
      // no need to force an extra fetch just because the same tab was clicked again.
      return;
    }
    this.reviewsStatusFilter = status;
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }
```

Replace with:

```ts
  private setReviewsTab(tab: unknown): void {
    if (tab !== 'all' && tab !== 'fixed' && tab !== 'needsMyFix') {
      return;
    }
    if (tab === this.reviewsTab) {
      return;
    }
    this.reviewsTab = tab;
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }

  private toggleReviewsStatusFilter(status: unknown): void {
    if (status !== 'active' && status !== 'completed' && status !== 'abandoned') {
      return;
    }
    const isSelected = this.reviewsStatusFilters.includes(status);
    if (isSelected && this.reviewsStatusFilters.length === 1) {
      // At least one status must always stay selected.
      return;
    }
    this.reviewsStatusFilters = isSelected ? this.reviewsStatusFilters.filter(s => s !== status) : [...this.reviewsStatusFilters, status];
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }
```

(`setReviewsOwnerFilter`, immediately below this block, is unchanged — leave it exactly as-is.)

- [ ] **Step 5: Replace the reviews-fetching block in `refresh()`**

Find:

```ts
    if (config && this.client && this.currentScreen === 'reviews') {
      if (this.reviewsOwnerFilter !== 'all' && this.currentUserId === undefined) {
        this.currentUserId = await this.client.getCurrentUserId();
      }
      const now = Date.now();
      const filterChanged =
        this.lastReviewsStatusFilterFetched !== this.reviewsStatusFilter || this.lastReviewsOwnerFilterFetched !== this.reviewsOwnerFilter;
      if (filterChanged || now - this.lastReviewsFetchAt >= REVIEWS_POLL_INTERVAL_MS) {
        const creatorId = this.reviewsOwnerFilter === 'mine' && this.currentUserId ? this.currentUserId : undefined;
        const reviewerId = this.reviewsOwnerFilter === 'assigned' && this.currentUserId ? this.currentUserId : undefined;
        this.reviewsPullRequests = await this.client.listProjectPullRequests(config.organization, config.project, this.reviewsStatusFilter, {
          creatorId,
          reviewerId,
        });
        this.lastReviewsFetchAt = now;
        this.lastReviewsStatusFilterFetched = this.reviewsStatusFilter;
        this.lastReviewsOwnerFilterFetched = this.reviewsOwnerFilter;
      }
    }
```

Replace with:

```ts
    if (config && this.client && this.currentScreen === 'reviews') {
      const needsCurrentUser = this.reviewsTab !== 'all' || this.reviewsOwnerFilter !== 'all';
      if (needsCurrentUser && this.currentUserId === undefined) {
        this.currentUserId = await this.client.getCurrentUserId();
      }
      const now = Date.now();
      const filterKey = `${this.reviewsTab}|${this.reviewsStatusFilters.join(',')}|${this.reviewsOwnerFilter}`;
      const filterChanged = this.lastReviewsFilterKeyFetched !== filterKey;
      if (filterChanged || now - this.lastReviewsFetchAt >= REVIEWS_POLL_INTERVAL_MS) {
        this.reviewsPullRequests = await this.fetchReviewsPullRequests(config);
        this.lastReviewsFetchAt = now;
        this.lastReviewsFilterKeyFetched = filterKey;
      }
    }
```

- [ ] **Step 6: Add `fetchReviewsPullRequests`**

Add this new private method directly above `refresh()` (find `private async refresh(): Promise<void> {` and insert immediately before it):

```ts
  private async fetchReviewsPullRequests(config: KanbrainConfig): Promise<PullRequestSummary[]> {
    if (!this.client) return [];

    if (this.reviewsTab === 'all') {
      const creatorId = this.reviewsOwnerFilter === 'mine' && this.currentUserId ? this.currentUserId : undefined;
      const reviewerId = this.reviewsOwnerFilter === 'assigned' && this.currentUserId ? this.currentUserId : undefined;
      const perStatus = await Promise.all(
        this.reviewsStatusFilters.map(status =>
          this.client!.listProjectPullRequests(config.organization, config.project, status, { creatorId, reviewerId }),
        ),
      );
      return perStatus.flat();
    }

    if (!this.currentUserId) return [];
    const isFixed = this.reviewsTab === 'fixed';
    const base = await this.client.listProjectPullRequests(config.organization, config.project, 'active', {
      creatorId: isFixed ? undefined : this.currentUserId,
      reviewerId: isFixed ? this.currentUserId : undefined,
    });
    const classified = await Promise.all(
      base.map(async pr => {
        try {
          const threads = await this.client!.getPullRequestThreads(config.organization, config.project, pr.repositoryId, pr.id);
          const { hasAnyActiveThread, hasMyThreadsAllResolved } = classifyPrThreads(threads, this.currentUserId!);
          return { pr, keep: isFixed ? hasMyThreadsAllResolved : hasAnyActiveThread };
        } catch {
          // One PR's thread fetch failing (network blip, deleted repo, etc.) shouldn't take down
          // the whole tab — just exclude that PR rather than rejecting the whole Promise.all.
          return { pr, keep: false };
        }
      }),
    );
    return classified.filter(c => c.keep).map(c => c.pr);
  }

```

(Keep the blank line after the closing `}` before `private async refresh()` — matches this file's existing spacing between methods.)

- [ ] **Step 7: Update the `render()` call site**

Find, inside `refresh()`, the object passed to `render(...)`:

```ts
        reviewsPullRequests: this.reviewsPullRequests,
        reviewsStatusFilter: this.reviewsStatusFilter,
        reviewsOwnerFilter: this.reviewsOwnerFilter,
```

Replace with:

```ts
        reviewsPullRequests: this.reviewsPullRequests,
        reviewsTab: this.reviewsTab,
        reviewsStatusFilters: this.reviewsStatusFilters,
        reviewsOwnerFilter: this.reviewsOwnerFilter,
```

- [ ] **Step 8: Update the webview click handler**

Find:

```ts
      } else if (target.dataset && target.dataset.action === 'set-reviews-status-filter' && !target.classList.contains('kb-search-tab-active')) {
        disableReviewsFilterControls(target);
        const tabBar = target.closest('.kb-search-tabs');
        if (tabBar) {
          tabBar.querySelectorAll('.kb-search-tab').forEach((btn) => btn.classList.remove('kb-search-tab-active'));
        }
        target.classList.add('kb-search-tab-active');
        setLoading(target);
        vscode.postMessage({ type: 'set-reviews-status-filter', status: target.dataset.status });
      } else if (target.dataset && target.dataset.action === 'pick-repository-folder') {
```

Replace with:

```ts
      } else if (target.dataset && target.dataset.action === 'set-reviews-tab' && !target.classList.contains('kb-search-tab-active')) {
        const tabBar = target.closest('.kb-search-tabs');
        if (tabBar) {
          tabBar.querySelectorAll('.kb-search-tab').forEach((btn) => btn.classList.remove('kb-search-tab-active'));
        }
        target.classList.add('kb-search-tab-active');
        setLoading(target);
        vscode.postMessage({ type: 'set-reviews-tab', tab: target.dataset.tab });
      } else if (target.dataset && target.dataset.action === 'toggle-reviews-status-filter') {
        disableReviewsFilterControls(target);
        target.classList.toggle('kb-search-tab-active');
        setLoading(target);
        vscode.postMessage({ type: 'toggle-reviews-status-filter', status: target.dataset.status });
      } else if (target.dataset && target.dataset.action === 'pick-repository-folder') {
```

(`set-reviews-tab` keeps the exclusive-selection behavior the old `set-reviews-status-filter` branch had — clear all tabs in the bar, then activate the clicked one, guarded against re-clicking the already-active tab. `toggle-reviews-status-filter` is new: it only toggles its own class, no guard, no clearing siblings, since multiple can be active at once. Note `set-reviews-tab`'s tab bar is a *different* `.kb-search-tabs` element than the status multi-select's — `target.closest('.kb-search-tabs')` correctly scopes to whichever bar was actually clicked, since each renders its own separate `.kb-search-tabs` container per Task 3's markup.)

- [ ] **Step 9: Compile and run the full unit test suite**

Run: `npm run compile && npm run test:unit`
Expected: both PASS. This is the primary safety net for this task — pay special attention to any TypeScript error naming a stale reference to `reviewsStatusFilter` (singular), `lastReviewsStatusFilterFetched`, or `lastReviewsOwnerFilterFetched` anywhere in this file; all three were removed in Step 2 and must have no remaining references.

- [ ] **Step 10: Manual self-review of the diff**

Before committing, re-read the full diff of this task and confirm:
- `fetchReviewsPullRequests`'s `'all'` branch never touches `getPullRequestThreads` — only the `'fixed'`/`'needsMyFix'` branch does, and only for PRs already narrowed by `creatorId`/`reviewerId` + status `'active'`.
- `toggleReviewsStatusFilter` refuses to remove the last remaining selected status (mirrors the webview's own multi-select toggle, which has no such guard client-side — the server-side guard is what actually prevents the empty state from persisting).
- The per-PR `try/catch` inside `fetchReviewsPullRequests` returns `{ pr, keep: false }` on failure — never lets one PR's error reject the whole `Promise.all`.
- `set-reviews-tab`'s click handler still guards against re-clicking the already-active tab (`!target.classList.contains('kb-search-tab-active')`); `toggle-reviews-status-filter`'s does not (by design — toggling an active one off is the intended action).

- [ ] **Step 11: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire All/Fixed/Needs-my-fix reviews tabs and status multi-select to the backend"
```
