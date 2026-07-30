# Reviews Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reviews" tab to the Kanbrain sidebar webview that lists all pull requests across every repository in the configured Azure DevOps project, filterable by status, refreshed automatically, and clickable into the existing PR detail panel.

**Architecture:** A new Azure DevOps client method (`listProjectPullRequests`) hits the project-wide "Get Pull Requests By Project" REST endpoint. A new pure render function (`renderReviews`) turns that data into compact cards, reusing existing tag/status-dot/icon helpers (one of which — the PR status dot — gets extracted out of `renderPullRequestDetail.ts` into a shared module first so both places use one implementation). `KanbrainViewProvider` gets a third screen (`'reviews'`), a persisted status filter, and a throttled fetch inside its existing 5s `refresh()` loop so the list updates roughly every 30s without adding a second poll timer.

**Tech Stack:** TypeScript, VS Code Webview API, vitest, Azure DevOps REST API 7.1.

## Global Constraints

- Follow the existing `AzureDevOpsClient` convention: every `client.ts` method catches its own errors and returns `null`/`[]` on failure — never throws past the method boundary (see `getPullRequest`, `getPullRequestDetail`).
- Follow the existing render-function convention: pure functions taking `RenderState` (or a narrower slice of it), returning an HTML string, escaping all user-controlled text via `escapeHtml`.
- No new npm dependencies.
- Run `npm run test:unit` (vitest) after every task; it must pass before moving on.
- UI copy is English, matching the rest of the extension (statuses "Active"/"Completed"/"Abandoned"/"Draft", "No comments.", etc.) — do not localize.

---

### Task 1: `PullRequestSummary` type and `listProjectPullRequests` client method

**Files:**
- Modify: `src/types.ts` (after `PullRequestDetail`, around line 64)
- Modify: `src/azureDevOps/client.ts` (after `getPullRequestDetail`, around line 374)
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `PullRequestSummary` type — `{ id: number; repositoryId: string; repositoryName: string; title: string; status: string; isDraft: boolean; sourceBranch: string; targetBranch: string; createdBy: AssignedTo; creationDate: string; webUrl: string }`
- Produces: `AzureDevOpsClient.listProjectPullRequests(organization: string, project: string, status: 'active' | 'completed' | 'abandoned'): Promise<PullRequestSummary[]>`

- [ ] **Step 1: Add the `PullRequestSummary` type**

In `src/types.ts`, insert immediately after the `PullRequestDetail` interface (after line 64):

```ts
export interface PullRequestSummary {
  id: number;
  repositoryId: string;
  repositoryName: string;
  title: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdBy: AssignedTo;
  creationDate: string;
  webUrl: string;
}
```

- [ ] **Step 2: Write the failing test for `listProjectPullRequests`**

In `src/azureDevOps/client.test.ts`, add after the `AzureDevOpsClient.getPullRequestDetail` describe block (search for `describe('AzureDevOpsClient.getRepository'` and insert before it):

```ts
describe('AzureDevOpsClient.listProjectPullRequests', () => {
  it('fetches and maps pull requests across the whole project', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            pullRequestId: 57,
            title: 'Fix login bug',
            status: 'active',
            isDraft: false,
            sourceRefName: 'refs/heads/feature/login-fix',
            targetRefName: 'refs/heads/main',
            creationDate: '2026-07-28T10:00:00Z',
            createdBy: { displayName: 'Jane Doe', imageUrl: 'https://example.com/jane.png' },
            repository: { id: 'repo-1', name: 'kanbrain', webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain' },
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const prs = await client.listProjectPullRequests('my-org', 'MyProject', 'active');

    expect(prs).toEqual([
      {
        id: 57,
        repositoryId: 'repo-1',
        repositoryName: 'kanbrain',
        title: 'Fix login bug',
        status: 'active',
        isDraft: false,
        sourceBranch: 'feature/login-fix',
        targetBranch: 'main',
        createdBy: { displayName: 'Jane Doe', imageUrl: 'https://example.com/jane.png' },
        creationDate: '2026-07-28T10:00:00Z',
        webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain/pullrequest/57',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/pullrequests?searchCriteria.status=active&api-version=7.1',
      expect.anything(),
    );
  });

  it('defaults a missing imageUrl to null', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            pullRequestId: 57,
            title: 'Fix login bug',
            status: 'active',
            isDraft: false,
            sourceRefName: 'refs/heads/feature/login-fix',
            targetRefName: 'refs/heads/main',
            creationDate: '2026-07-28T10:00:00Z',
            createdBy: { displayName: 'Jane Doe' },
            repository: { id: 'repo-1', name: 'kanbrain', webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain' },
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const prs = await client.listProjectPullRequests('my-org', 'MyProject', 'active');

    expect(prs[0].createdBy).toEqual({ displayName: 'Jane Doe', imageUrl: null });
  });

  it('returns an empty array when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'no access' }, false, 403));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const prs = await client.listProjectPullRequests('my-org', 'MyProject', 'active');

    expect(prs).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- client.test.ts`
Expected: FAIL with `client.listProjectPullRequests is not a function`

- [ ] **Step 4: Implement `listProjectPullRequests`**

In `src/azureDevOps/client.ts`, add this method immediately after `getPullRequestDetail` (after the closing brace on the line before `async getRepository`, around line 374):

```ts
  async listProjectPullRequests(
    organization: string,
    project: string,
    status: 'active' | 'completed' | 'abandoned',
  ): Promise<PullRequestSummary[]> {
    try {
      const data = await this.request<{
        value: {
          pullRequestId: number;
          title: string;
          status: string;
          isDraft: boolean;
          sourceRefName: string;
          targetRefName: string;
          creationDate: string;
          createdBy: { displayName: string; imageUrl?: string };
          repository: { id: string; name: string; webUrl: string };
        }[];
      }>(`https://dev.azure.com/${organization}/${project}/_apis/git/pullrequests?searchCriteria.status=${status}&api-version=7.1`);
      return data.value.map(pr => ({
        id: pr.pullRequestId,
        repositoryId: pr.repository.id,
        repositoryName: pr.repository.name,
        title: pr.title,
        status: pr.status,
        isDraft: pr.isDraft,
        sourceBranch: pr.sourceRefName.replace(/^refs\/heads\//, ''),
        targetBranch: pr.targetRefName.replace(/^refs\/heads\//, ''),
        createdBy: { displayName: pr.createdBy.displayName, imageUrl: pr.createdBy.imageUrl ?? null },
        creationDate: pr.creationDate,
        webUrl: `${pr.repository.webUrl}/pullrequest/${pr.pullRequestId}`,
      }));
    } catch {
      return [];
    }
  }
```

Also update the import at the top of `src/azureDevOps/client.ts` (line 1) to include the new type:

```ts
import type { AssignedTo, WorkItem, CardFieldSettings, PullRequestDetails, PullRequestDetail, PullRequestThread, PullRequestSummary } from '../types';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- client.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add listProjectPullRequests to fetch PRs across the whole project"
```

---

### Task 2: Extract shared PR status dot into `renderPrStatus.ts`

**Files:**
- Create: `src/view/renderPrStatus.ts`
- Test: `src/view/renderPrStatus.test.ts`
- Modify: `src/view/renderPullRequestDetail.ts:1-31` (imports + remove local `STATUS_COLORS`/`renderStatusDot`)

**Interfaces:**
- Produces: `renderPrStatusDot(status: string, isDraft: boolean): string` — returns `<span class="kb-status-dot" style="background-color: ...">` (uses the existing global `.kb-status-dot` CSS rule already defined in `KanbrainViewProvider.css()`).

- [ ] **Step 1: Write the failing test**

Create `src/view/renderPrStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderPrStatusDot } from './renderPrStatus';

describe('renderPrStatusDot', () => {
  it('uses blue for active', () => {
    expect(renderPrStatusDot('active', false)).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('uses green for completed', () => {
    expect(renderPrStatusDot('completed', false)).toContain('background-color: var(--vscode-charts-green)');
  });

  it('uses red for abandoned', () => {
    expect(renderPrStatusDot('abandoned', false)).toContain('background-color: var(--vscode-charts-red)');
  });

  it('falls back to blue for an unknown status', () => {
    expect(renderPrStatusDot('mystery', false)).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('uses yellow when isDraft is true, regardless of status', () => {
    expect(renderPrStatusDot('completed', true)).toContain('background-color: var(--vscode-charts-yellow)');
  });

  it('renders the kb-status-dot class', () => {
    expect(renderPrStatusDot('active', false)).toContain('class="kb-status-dot"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderPrStatus.test.ts`
Expected: FAIL — cannot find module `./renderPrStatus`

- [ ] **Step 3: Create `renderPrStatus.ts`**

Create `src/view/renderPrStatus.ts`:

```ts
const PR_STATUS_COLORS: Record<string, string> = {
  active: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  abandoned: 'var(--vscode-charts-red)',
};

export function renderPrStatusDot(status: string, isDraft: boolean): string {
  const color = isDraft ? 'var(--vscode-charts-yellow)' : (PR_STATUS_COLORS[status] ?? 'var(--vscode-charts-blue)');
  return `<span class="kb-status-dot" style="background-color: ${color}"></span>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderPrStatus.test.ts`
Expected: PASS

- [ ] **Step 5: Update `renderPullRequestDetail.ts` to use the shared module**

In `src/view/renderPullRequestDetail.ts`, remove lines 22-31 (the `STATUS_COLORS` const and `renderStatusDot` function):

```ts
const STATUS_COLORS: Record<string, string> = {
  active: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  abandoned: 'var(--vscode-charts-red)',
};

function renderStatusDot(status: string, isDraft: boolean): string {
  const color = isDraft ? 'var(--vscode-charts-yellow)' : (STATUS_COLORS[status] ?? 'var(--vscode-charts-blue)');
  return `<span class="kb-status-dot" style="background-color: ${color}"></span>`;
}
```

Replace the import block at the top (lines 1-8) with:

```ts
import type { WorkItem, KanbrainConfig, PullRequestDetail, PullRequestReviewer, PullRequestThread, PullRequestThreadComment } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';
import { capitalize } from './renderDevelopment';
import { renderComment } from './renderComment';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';
import { rewriteImageSrcs } from './inlineImages';
import { renderMarkdownText } from './renderMarkdownText';
import { renderPrStatusDot } from './renderPrStatus';
```

Then replace the one call site (originally around line 150):

```ts
      <div class="kb-detail-status-row">${renderStatusDot(pr.status, pr.isDraft)}${escapeHtml(statusLabel)}${repoTagHtml}</div>
```

with:

```ts
      <div class="kb-detail-status-row">${renderPrStatusDot(pr.status, pr.isDraft)}${escapeHtml(statusLabel)}${repoTagHtml}</div>
```

- [ ] **Step 6: Run the full existing suite for this file to confirm no regression**

Run: `npm run test:unit -- renderPullRequestDetail.test.ts renderPrStatus.test.ts`
Expected: PASS (all existing `renderPullRequestDetail` tests still pass unchanged)

- [ ] **Step 7: Commit**

```bash
git add src/view/renderPrStatus.ts src/view/renderPrStatus.test.ts src/view/renderPullRequestDetail.ts
git commit -m "refactor: extract PR status dot into a shared renderPrStatus module"
```

---

### Task 3: `formatRelativeTime` helper

**Files:**
- Create: `src/view/renderRelativeTime.ts`
- Test: `src/view/renderRelativeTime.test.ts`

**Interfaces:**
- Produces: `formatRelativeTime(dateIso: string, now: Date = new Date()): string`

- [ ] **Step 1: Write the failing test**

Create `src/view/renderRelativeTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './renderRelativeTime';

const NOW = new Date('2026-07-30T12:00:00Z');

describe('formatRelativeTime', () => {
  it('shows "just now" for under a minute ago', () => {
    expect(formatRelativeTime('2026-07-30T11:59:30Z', NOW)).toBe('just now');
  });

  it('shows minutes ago for under an hour', () => {
    expect(formatRelativeTime('2026-07-30T11:45:00Z', NOW)).toBe('15 minutes ago');
  });

  it('uses singular "minute" for exactly 1 minute', () => {
    expect(formatRelativeTime('2026-07-30T11:59:00Z', NOW)).toBe('1 minute ago');
  });

  it('shows hours ago for under a day', () => {
    expect(formatRelativeTime('2026-07-30T09:00:00Z', NOW)).toBe('3 hours ago');
  });

  it('uses singular "hour" for exactly 1 hour', () => {
    expect(formatRelativeTime('2026-07-30T11:00:00Z', NOW)).toBe('1 hour ago');
  });

  it('shows days ago for under a week', () => {
    expect(formatRelativeTime('2026-07-28T12:00:00Z', NOW)).toBe('2 days ago');
  });

  it('uses singular "day" for exactly 1 day', () => {
    expect(formatRelativeTime('2026-07-29T12:00:00Z', NOW)).toBe('1 day ago');
  });

  it('falls back to a locale date string at 7 days or older', () => {
    const result = formatRelativeTime('2026-07-01T12:00:00Z', NOW);
    expect(result).not.toContain('ago');
    expect(result).toBe(new Date('2026-07-01T12:00:00Z').toLocaleDateString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderRelativeTime.test.ts`
Expected: FAIL — cannot find module `./renderRelativeTime`

- [ ] **Step 3: Implement `formatRelativeTime`**

Create `src/view/renderRelativeTime.ts`:

```ts
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

export function formatRelativeTime(dateIso: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(dateIso).getTime();

  if (elapsedMs < MINUTE_MS) {
    return 'just now';
  }
  if (elapsedMs < HOUR_MS) {
    return pluralize(Math.floor(elapsedMs / MINUTE_MS), 'minute');
  }
  if (elapsedMs < DAY_MS) {
    return pluralize(Math.floor(elapsedMs / HOUR_MS), 'hour');
  }
  if (elapsedMs < WEEK_MS) {
    return pluralize(Math.floor(elapsedMs / DAY_MS), 'day');
  }
  return new Date(dateIso).toLocaleDateString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderRelativeTime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/view/renderRelativeTime.ts src/view/renderRelativeTime.test.ts
git commit -m "feat: add formatRelativeTime helper for PR card timestamps"
```

---

### Task 4: `hasStateChanged` / `serializeState` gain an `extra` slot

**Files:**
- Modify: `src/view/hasStateChanged.ts`
- Test: `src/view/hasStateChanged.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `serializeState(config, workItem, subtasks, avatars = {}, extra: unknown = null): string`; `hasStateChanged(previous, config, workItem, subtasks, avatars = {}, extra: unknown = null): boolean`. Existing 4-arg call sites are unaffected (fifth argument defaults to `null` on both sides). `KanbrainViewProvider` (Task 8) will pass `this.reviewsPullRequests` as `extra` so a Reviews-list refetch triggers a re-render the same way an avatar-map change does today.

- [ ] **Step 1: Write the failing tests**

In `src/view/hasStateChanged.test.ts`, add at the end of the `describe` block (before the closing `});` on the last line):

```ts
  it('is true when only the extra value changes', () => {
    const previous = serializeState(null, { id: 1 }, [], {});

    expect(hasStateChanged(previous, null, { id: 1 }, [], {}, [{ id: 99 }])).toBe(true);
  });

  it('is false when extra is omitted on both sides (defaults to the same null)', () => {
    const previous = serializeState(null, { id: 1 }, [], {});

    expect(hasStateChanged(previous, null, { id: 1 }, [], {})).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- hasStateChanged.test.ts`
Expected: FAIL on the new "extra value changes" case (both serializations currently omit `extra` entirely, so they'd compare equal)

- [ ] **Step 3: Implement the `extra` parameter**

Replace the full contents of `src/view/hasStateChanged.ts`:

```ts
export function serializeState(config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}, extra: unknown = null): string {
  return JSON.stringify({ config, workItem, subtasks, avatars, extra });
}

export function hasStateChanged(
  previous: string,
  config: unknown,
  workItem: unknown,
  subtasks: unknown,
  avatars: unknown = {},
  extra: unknown = null,
): boolean {
  return serializeState(config, workItem, subtasks, avatars, extra) !== previous;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- hasStateChanged.test.ts`
Expected: PASS (all tests, including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/view/hasStateChanged.ts src/view/hasStateChanged.test.ts
git commit -m "feat: let hasStateChanged track an arbitrary extra value"
```

---

### Task 5: `renderReviews.ts`

**Files:**
- Create: `src/view/renderReviews.ts`
- Test: `src/view/renderReviews.test.ts`
- Modify: `src/view/renderDevelopment.ts:12` (export `renderPullRequestIcon`)

**Interfaces:**
- Consumes: `RenderState` (from `./render`, defined in Task 6 — for this task's test file, a local `RenderState`-shaped object literal is used instead of importing the real type, since Task 6 hasn't added the `reviews*` fields yet; see test code below), `PullRequestSummary` (from `../types`, Task 1), `renderPrStatusDot` (Task 2), `formatRelativeTime` (Task 3), `renderRepoTag`/`renderBranchTag` (existing `./renderRepoBranchTags`), `capitalize`/`renderPullRequestIcon` (existing `./renderDevelopment`).
- Produces: `renderReviews(state: RenderState): string`

- [ ] **Step 1: Export `renderPullRequestIcon` from `renderDevelopment.ts`**

In `src/view/renderDevelopment.ts`, change line 12 from:

```ts
function renderPullRequestIcon(): string {
```

to:

```ts
export function renderPullRequestIcon(): string {
```

- [ ] **Step 2: Run the existing suite for that file to confirm no regression**

Run: `npm run test:unit -- renderDevelopment.test.ts`
Expected: PASS (unchanged — this is a pure visibility change)

- [ ] **Step 3: Write the failing test for `renderReviews`**

Create `src/view/renderReviews.test.ts`:

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
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'active' }));
    expect(html).toContain('No active pull requests.');
  });

  it('shows an empty message reflecting a non-default filter', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    expect(html).toContain('No completed pull requests.');
  });

  it('renders a card with id, title, author, repo, and branch', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).toContain('#57');
    expect(html).toContain('Fix &lt;login&gt; bug');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('feature/login-fix');
  });

  it('escapes the title instead of injecting raw HTML', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).not.toContain('Fix <login> bug');
  });

  it('links each card to the openPullRequestDetail command with repositoryId and id', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ repositoryId: 'repo-1', id: 57 })], reviewsStatusFilter: 'active' }));
    const commandArgs = encodeURIComponent(JSON.stringify(['repo-1', 57]));
    expect(html).toContain(`command:kanbrain.openPullRequestDetail?${commandArgs}`);
  });

  it('shows a status dot colored for the status', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'active', isDraft: false })], reviewsStatusFilter: 'active' }));
    expect(html).toContain('kb-status-dot');
    expect(html).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('shows the status filter select with the active option selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    expect(html).toContain('id="kb-reviews-status-filter"');
    const optionStart = html.indexOf('value="completed"');
    const optionTag = html.slice(optionStart - 40, optionStart + 60);
    expect(optionTag).toContain('selected');
  });

  it('defaults the filter to active when reviewsStatusFilter is omitted', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    const optionStart = html.indexOf('value="active"');
    const optionTag = html.slice(optionStart - 40, optionStart + 60);
    expect(optionTag).toContain('selected');
  });

  it('sorts pull requests newest first', () => {
    const older = pr({ id: 1, creationDate: '2026-07-20T00:00:00Z', title: 'Older' });
    const newer = pr({ id: 2, creationDate: '2026-07-29T00:00:00Z', title: 'Newer' });
    const html = renderReviews(state({ reviewsPullRequests: [older, newer], reviewsStatusFilter: 'active' }));
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test:unit -- renderReviews.test.ts`
Expected: FAIL — cannot find module `./renderReviews`

- [ ] **Step 5: Implement `renderReviews.ts`**

Create `src/view/renderReviews.ts`:

```ts
import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderRepoTag, renderBranchTag } from './renderRepoBranchTags';
import { renderPrStatusDot } from './renderPrStatus';
import { renderPullRequestIcon, capitalize } from './renderDevelopment';
import { formatRelativeTime } from './renderRelativeTime';

const PULL_REQUEST_ICON = renderPullRequestIcon();

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

function renderReviewsToolbar(selected: 'active' | 'completed' | 'abandoned'): string {
  return `
    <div class="kb-reviews-toolbar">
      <select id="kb-reviews-status-filter">
        ${STATUS_FILTER_OPTIONS.map(
          o => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`,
        ).join('')}
      </select>
    </div>
  `;
}

function renderReviewCard(pr: PullRequestSummary, repositories: Record<string, RepositoryPathEntry>): string {
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const repoTagHtml = renderRepoTag(pr.repositoryId, repositories[pr.repositoryId]);
  const isMapped = !!repositories[pr.repositoryId]?.path;
  const branchTagHtml = renderBranchTag(pr.sourceBranch, isMapped ? [pr.repositoryId, pr.sourceBranch] : null);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));

  return `
    <a class="kb-review-card" href="command:kanbrain.openPullRequestDetail?${commandArgs}">
      <div class="kb-review-card-header">${renderPrStatusDot(pr.status, pr.isDraft)}${escapeHtml(statusLabel)}${repoTagHtml}${branchTagHtml}</div>
      <div class="kb-review-card-title">${PULL_REQUEST_ICON}<span>#${pr.id} ${escapeHtml(pr.title)}</span></div>
      <div class="kb-review-card-meta">${escapeHtml(pr.createdBy.displayName)} &middot; ${formatRelativeTime(pr.creationDate)}</div>
    </a>
  `;
}

export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const statusFilter = state.reviewsStatusFilter ?? 'active';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsToolbar(statusFilter)}
    ${
      sorted.length
        ? sorted.map(pr => renderReviewCard(pr, config.repositories ?? {})).join('')
        : `<div class="kb-empty">No ${statusFilter} pull requests.</div>`
    }
  `;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:unit -- renderReviews.test.ts`
Expected: PASS

Note: this test file imports `RenderState` from `./render`, which does not yet have the `reviews*` fields (added in Task 6) — TypeScript will report the `reviewsPullRequests`/`reviewsStatusFilter` overrides as excess properties until Task 6 lands. Task 6 is next, so this is resolved immediately after; do not skip ahead.

- [ ] **Step 7: Commit**

```bash
git add src/view/renderDevelopment.ts src/view/renderReviews.ts src/view/renderReviews.test.ts
git commit -m "feat: add renderReviews to render the Reviews tab PR list"
```

---

### Task 6: Wire the `reviews` screen into `render.ts`

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `renderReviews` (Task 5), `PullRequestSummary` (Task 1)
- Produces: `RenderState.screen` includes `'reviews'`; `RenderState.reviewsPullRequests?: PullRequestSummary[]`; `RenderState.reviewsStatusFilter?: 'active' | 'completed' | 'abandoned'`

- [ ] **Step 1: Write the failing tests**

In `src/view/render.test.ts`, replace this existing test (around line 73):

```ts
  it('appends the footer on every configured screen', () => {
    for (const screen of ['home', 'flow', 'config', 'brain'] as const) {
      const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen });
      expect(html).toContain('kb-footer');
    }
  });
```

with:

```ts
  it('appends the footer on every configured screen', () => {
    for (const screen of ['home', 'flow', 'config', 'brain', 'reviews'] as const) {
      const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen });
      expect(html).toContain('kb-footer');
    }
  });
```

Then add a new test right after the existing `'delegates to the brain screen when screen is "brain"'` test (around line 88):

```ts
  it('delegates to the reviews screen when screen is "reviews"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).toContain('id="kb-reviews-status-filter"');
  });

  it('does not show the search dialog on the reviews screen', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).not.toContain('id="kb-search-input"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- render.test.ts`
Expected: FAIL — TypeScript error, `'reviews'` is not assignable to `RenderState['screen']`

- [ ] **Step 3: Update `RenderState` and add the `reviews` branch**

In `src/view/render.ts`, replace lines 1-22 (from the first `import` to the end of the `RenderState` interface) with:

```ts
import type { WorkItem, KanbrainConfig, PullRequestSummary } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { renderBrain } from './renderBrain';
import { renderReviews } from './renderReviews';
import { renderFooter } from './renderFooter';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config' | 'brain' | 'reviews';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
  parentCollapsed?: boolean;
  childrenCollapsed?: boolean;
  openBrainSegment?: 'repositories' | 'skills' | 'profiles' | null;
  reviewsPullRequests?: PullRequestSummary[];
  reviewsStatusFilter?: 'active' | 'completed' | 'abandoned';
}
```

Then, in the `render` function, add a new branch right after the `brain` branch (originally lines 64-66):

```ts
  if (state.screen === 'brain') {
    return `${renderBrain(state)}${renderSearchDialog()}${renderFooter(state)}`;
  }
```

becomes:

```ts
  if (state.screen === 'brain') {
    return `${renderBrain(state)}${renderSearchDialog()}${renderFooter(state)}`;
  }
  if (state.screen === 'reviews') {
    return `${renderReviews(state)}${renderFooter(state)}`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- render.test.ts renderReviews.test.ts`
Expected: PASS (this also resolves the TypeScript excess-property note left at the end of Task 5)

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts
git commit -m "feat: wire the reviews screen into the main render function"
```

---

### Task 7: Add the Reviews button to the footer

**Files:**
- Modify: `src/view/renderFooter.ts`
- Modify: `src/view/renderFooter.test.ts`

**Interfaces:**
- Produces: a `<button id="kb-show-reviews-btn">` in `renderFooter`'s output, active (`kb-footer-btn-active`) when `state.screen === 'reviews'`.

- [ ] **Step 1: Write the failing tests**

In `src/view/renderFooter.test.ts`, add at the end of the `describe` block (before the final `});`):

```ts
  it('shows a Reviews button', () => {
    const html = renderFooter(state());
    expect(html).toContain('id="kb-show-reviews-btn"');
  });

  it('places the Reviews button after Brain and before the divider that precedes Check', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const reviewsIndex = html.indexOf('id="kb-show-reviews-btn"');
    const dividerIndex = html.indexOf('kb-footer-divider', brainIndex);
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');

    expect(reviewsIndex).toBeGreaterThan(brainIndex);
    expect(dividerIndex).toBeGreaterThan(reviewsIndex);
    expect(checkIndex).toBeGreaterThan(dividerIndex);
  });

  it('marks the reviews icon as active on the Reviews screen', () => {
    const html = renderFooter(state({ screen: 'reviews' }));
    const btnStart = html.indexOf('id="kb-show-reviews-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });
```

Also update `state()`'s `screen` type acceptance — no change needed there since `RenderState['screen']` already includes `'reviews'` after Task 6.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderFooter.test.ts`
Expected: FAIL — no element with id `kb-show-reviews-btn`

- [ ] **Step 3: Add the button**

In `src/view/renderFooter.ts`, replace the return block (lines 20-32):

```ts
  return `
    <div class="kb-footer">
      <button id="kb-home-btn" class="${footerBtnClass(state.screen === 'home')}" title="Home">🏠</button>
      <div class="kb-footer-divider"></div>
      ${workItemBtn}
      <button id="kb-show-brain-btn" class="${footerBtnClass(state.screen === 'brain')}" title="Brain">🧠</button>
      <div class="kb-footer-divider"></div>
      <button id="kb-run-check-board-config-btn" class="kb-footer-btn" title="Check Board Configuration">✅</button>
      <button id="kb-run-sync-board-config-btn" class="kb-footer-btn" title="Sync Board Configuration">🔄</button>
      <div class="kb-footer-spacer"></div>
      <button id="kb-show-config-btn" class="${footerBtnClass(state.screen === 'config')}" title="Configuration">⚙️</button>
    </div>
  `;
```

with:

```ts
  return `
    <div class="kb-footer">
      <button id="kb-home-btn" class="${footerBtnClass(state.screen === 'home')}" title="Home">🏠</button>
      <div class="kb-footer-divider"></div>
      ${workItemBtn}
      <button id="kb-show-brain-btn" class="${footerBtnClass(state.screen === 'brain')}" title="Brain">🧠</button>
      <button id="kb-show-reviews-btn" class="${footerBtnClass(state.screen === 'reviews')}" title="Reviews">🔀</button>
      <div class="kb-footer-divider"></div>
      <button id="kb-run-check-board-config-btn" class="kb-footer-btn" title="Check Board Configuration">✅</button>
      <button id="kb-run-sync-board-config-btn" class="kb-footer-btn" title="Sync Board Configuration">🔄</button>
      <div class="kb-footer-spacer"></div>
      <button id="kb-show-config-btn" class="${footerBtnClass(state.screen === 'config')}" title="Configuration">⚙️</button>
    </div>
  `;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderFooter.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/view/renderFooter.ts src/view/renderFooter.test.ts
git commit -m "feat: add a Reviews button to the sidebar footer"
```

---

### Task 8: `KanbrainViewProvider` integration — screen switching, filter persistence, throttled polling

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `listProjectPullRequests` (Task 1), `renderReviews`/`reviews` screen via `render()` (Task 6), `hasStateChanged`/`serializeState` with the new `extra` param (Task 4).
- Produces: message types `'show-reviews'` and `'set-reviews-status-filter'`; public method `showReviewsScreen(): void`.

This file has no dedicated vitest unit tests today (it drives the VS Code Webview API directly); verification for this task is TypeScript compilation plus the full test suite (to confirm nothing else broke) plus a manual smoke test in the Extension Development Host.

- [ ] **Step 1: Import the new type**

In `src/view/KanbrainViewProvider.ts`, change line 4 from:

```ts
import type { WorkItem, KanbrainConfig, SkillEntry } from '../types';
```

to:

```ts
import type { WorkItem, KanbrainConfig, SkillEntry, PullRequestSummary } from '../types';
```

- [ ] **Step 2: Add the polling interval constant and instance fields**

Change line 19 from:

```ts
const POLL_INTERVAL_MS = 5000;
```

to:

```ts
const POLL_INTERVAL_MS = 5000;
const REVIEWS_POLL_INTERVAL_MS = 30000;
```

Change line 31 from:

```ts
  private currentScreen: 'home' | 'flow' | 'config' | 'brain' = 'home';
```

to:

```ts
  private currentScreen: 'home' | 'flow' | 'config' | 'brain' | 'reviews' = 'home';
```

Add these fields right after `private openBrainSegment: 'repositories' | 'skills' | 'profiles' | null = 'skills';` (line 36):

```ts
  private reviewsStatusFilter: 'active' | 'completed' | 'abandoned' = 'active';
  private reviewsPullRequests: PullRequestSummary[] = [];
  private lastReviewsFetchAt = 0;
  private lastReviewsStatusFilterFetched: 'active' | 'completed' | 'abandoned' | undefined;
```

- [ ] **Step 3: Add the message handlers**

In the `onDidReceiveMessage` handler, add a branch right after the `show-brain` branch (originally lines 121-122):

```ts
      } else if (message.type === 'show-brain') {
        this.showBrainScreen();
```

becomes:

```ts
      } else if (message.type === 'show-brain') {
        this.showBrainScreen();
      } else if (message.type === 'show-reviews') {
        this.showReviewsScreen();
      } else if (message.type === 'set-reviews-status-filter') {
        this.setReviewsStatusFilter(message.status);
```

- [ ] **Step 4: Add `showReviewsScreen` and `setReviewsStatusFilter`**

Add these two methods right after `showBrainScreen()` (originally lines 235-239):

```ts
  showBrainScreen(): void {
    this.currentScreen = 'brain';
    this.lastState = '';
    void this.refresh();
  }
```

becomes:

```ts
  showBrainScreen(): void {
    this.currentScreen = 'brain';
    this.lastState = '';
    void this.refresh();
  }

  showReviewsScreen(): void {
    this.currentScreen = 'reviews';
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }

  private setReviewsStatusFilter(status: unknown): void {
    if (status !== 'active' && status !== 'completed' && status !== 'abandoned') {
      return;
    }
    this.reviewsStatusFilter = status;
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }
```

- [ ] **Step 5: Fetch the PR list inside `refresh()`, throttled**

In `refresh()`, insert a new block right after the existing work-item fetch/staleness-check block and before the avatars line. Find this (originally lines 682-692):

```ts
    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    // Whether the assignee actually renders is decided per work item type by resolveShowAssignedTo
    // (mirrored from the real board), so avatars are always resolved here rather than gated by the
    // (now search-only) manual showAssignedTo toggle.
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
```

and insert between them:

```ts
    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    if (config && this.client && this.currentScreen === 'reviews') {
      const now = Date.now();
      const filterChanged = this.lastReviewsStatusFilterFetched !== this.reviewsStatusFilter;
      if (filterChanged || now - this.lastReviewsFetchAt >= REVIEWS_POLL_INTERVAL_MS) {
        this.reviewsPullRequests = await this.client.listProjectPullRequests(config.organization, config.project, this.reviewsStatusFilter);
        this.lastReviewsFetchAt = now;
        this.lastReviewsStatusFilterFetched = this.reviewsStatusFilter;
      }
    }

    // Whether the assignee actually renders is decided per work item type by resolveShowAssignedTo
    // (mirrored from the real board), so avatars are always resolved here rather than gated by the
    // (now search-only) manual showAssignedTo toggle.
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
```

- [ ] **Step 6: Pass `reviewsPullRequests` through `hasStateChanged`/`serializeState` and into `render()`**

Still inside `refresh()`, find (originally lines 694-712):

```ts
    if (!hasStateChanged(this.lastState, config, workItem, subtasks, avatars)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks, avatars);
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
        parentCollapsed: this.parentCollapsed,
        childrenCollapsed: this.childrenCollapsed,
        openBrainSegment: this.openBrainSegment,
      }),
    );
  }
```

Replace with:

```ts
    if (!hasStateChanged(this.lastState, config, workItem, subtasks, avatars, this.reviewsPullRequests)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks, avatars, this.reviewsPullRequests);
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
        parentCollapsed: this.parentCollapsed,
        childrenCollapsed: this.childrenCollapsed,
        openBrainSegment: this.openBrainSegment,
        reviewsPullRequests: this.reviewsPullRequests,
        reviewsStatusFilter: this.reviewsStatusFilter,
      }),
    );
  }
```

- [ ] **Step 7: Wire up the webview script — click and change handlers**

In `wrapHtml()`'s `<script>`, add a change listener right after the `profileSelect` block (originally lines 822-827):

```ts
    const profileSelect = document.getElementById('kb-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-profile', profileId: profileSelect.value });
      });
    }
```

becomes:

```ts
    const profileSelect = document.getElementById('kb-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-profile', profileId: profileSelect.value });
      });
    }

    const reviewsStatusFilter = document.getElementById('kb-reviews-status-filter');
    if (reviewsStatusFilter) {
      reviewsStatusFilter.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-reviews-status-filter', status: reviewsStatusFilter.value });
      });
    }
```

Then add a click branch right after the `kb-show-brain-btn` branch (originally lines 863-864):

```ts
      } else if (target.id === 'kb-show-brain-btn') {
        vscode.postMessage({ type: 'show-brain' });
```

becomes:

```ts
      } else if (target.id === 'kb-show-brain-btn') {
        vscode.postMessage({ type: 'show-brain' });
      } else if (target.id === 'kb-show-reviews-btn') {
        vscode.postMessage({ type: 'show-reviews' });
```

- [ ] **Step 8: Add CSS for the toolbar and cards**

In `css()`, add these rules right after the `.kb-dev-badge svg { flex-shrink: 0; }` line (originally line 1154):

```ts
      .kb-dev-badge svg { flex-shrink: 0; }
```

becomes:

```ts
      .kb-dev-badge svg { flex-shrink: 0; }
      .kb-reviews-toolbar { margin: 0 0 12px; }
      .kb-reviews-toolbar select { box-sizing: border-box; width: 100%; padding: 4px 6px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; font-family: var(--vscode-font-family); }
      .kb-review-card { display: block; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; color: var(--vscode-foreground); text-decoration: none; }
      .kb-review-card:hover { background: var(--vscode-list-hoverBackground); }
      .kb-review-card-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
      .kb-review-card-title { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-weight: 600; }
      .kb-review-card-title svg { flex-shrink: 0; }
      .kb-review-card-meta { margin-top: 4px; font-size: 11px; opacity: 0.75; }
```

- [ ] **Step 9: Compile and run the full test suite**

Run: `npm run compile`
Expected: no TypeScript errors

Run: `npm run test:unit`
Expected: PASS (all suites, including Tasks 1-7's tests)

- [ ] **Step 10: Manual smoke test in the Extension Development Host**

Press F5 (or use the Run and Debug panel) to launch the Extension Development Host against this repo. In the launched window, open a workspace already configured with Kanbrain (organization/project set, connected to Azure DevOps). In the Kanbrain sidebar:
1. Click the new 🔀 Reviews footer button — confirm the list appears with the status filter defaulted to "Active".
2. Confirm each card shows status dot + repo/branch tags, `#id title`, author, and a relative timestamp.
3. Click a card — confirm it opens the same PR detail panel that Development-section links open.
4. Change the status filter to "Completed" — confirm the list refreshes to show completed PRs (or the "No completed pull requests." empty state).
5. Leave the tab open for ~30+ seconds with a PR's state changed on the server (e.g. add a reviewer vote in the browser) — confirm the card list picks up the change without manual action.

- [ ] **Step 11: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire the Reviews screen into KanbrainViewProvider with throttled polling"
```

---

## Self-Review Notes

- **Spec coverage:** project-wide PR listing (Task 1), status filter defaulting to Active with Completed/Abandoned options (Tasks 5-8), compact card fields — title/author/repo/branch/status (Task 5), sidebar tab placement (Tasks 6-8), newest-first sort with no grouping (Task 5), no search/author filter (not built, per spec's non-goals), reuse of `kanbrain.openPullRequestDetail` command (Task 5), ~30s throttled background refresh (Task 8), shared status-dot extraction (Task 2) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact manual-test script.
- **Type consistency:** `PullRequestSummary` (Task 1) is used identically across `client.ts`, `renderReviews.ts`, and `render.ts`. `'active' | 'completed' | 'abandoned'` status-filter union is identical in `render.ts`, `renderReviews.ts`, and `KanbrainViewProvider.ts`. `renderPrStatusDot` (Task 2) signature matches its two call sites (`renderPullRequestDetail.ts`, `renderReviews.ts`).
- **Scope check:** single cohesive feature, no unrelated refactors beyond the one extraction (Task 2) that removes duplication the feature itself would otherwise introduce.
