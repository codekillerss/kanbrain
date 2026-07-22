# Development (branch/PR) Card Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Development" section (branches and pull requests linked to the work item, matching Azure Boards' own grouping) on every card rendered by `renderWorkItemCard` — main card, subtask cards, and the Home screen's active card.

**Architecture:** `mapWorkItem` gains a synchronous parser for `ArtifactLink` relations, turning each into a `DevelopmentLink` (branch name decoded directly from the URL, or a bare `repositoryId`+`pullRequestId` for PRs). A new `AzureDevOpsClient.getPullRequest` call resolves PR title/status separately, cached indefinitely per session in `KanbrainViewProvider` (same pattern as the existing avatar cache). A new pure `renderDevelopmentSection` renders the list; `renderWorkItemCard` calls it unconditionally (no config gating, matching how "Children (N)" is always shown today).

**Tech Stack:** TypeScript, VS Code extension API, vitest for unit tests, Azure DevOps REST API 7.1.

## Global Constraints

- Branches and pull requests render together in one "Development" section — not two separate lists (spec: "Contexto e motivação").
- Branch shows only its name (decoded from the relation URL, no extra API call). Pull Request shows `#id`, title, and status — requires one `getPullRequest` call per linked PR (spec: "Escopo").
- No configurability, no board mirroring — the section is always shown when `development.length > 0`, same unconditional treatment as "Children (N)" (spec: "Escopo").
- No click action in this iteration — display only (spec: "Escopo").
- Any `ArtifactLink` relation that isn't a branch or PR (Build, Commit, etc.) is silently ignored, never throws (spec: "Escopo", "Tratamento de erros").
- `getPullRequest` failures return `null`, never throw; the affected PR falls back to showing only `#id` (spec: "Tratamento de erros").
- PR details are cached indefinitely per session, same pattern as `avatarCache` (spec: "Escopo").
- The Fluent UI "Branch Fork" SVG (MIT license) is embedded verbatim with `fill="currentColor"` — do not substitute an emoji or a different icon (spec: "Contexto e motivação").

---

### Task 1: Types, `mapWorkItem` parsing, and fixture updates across the test suite

**Files:**
- Modify: `src/types.ts`
- Modify: `src/azureDevOps/mapWorkItem.ts`
- Test: `src/azureDevOps/mapWorkItem.test.ts`
- Modify (fixtures — add `development: []` next to the existing `assignedTo: null,` line): `src/config/resolveSkill.test.ts`, `src/skills/resolvePlaceholders.test.ts`, `src/view/filterSearchResults.test.ts`, `src/view/groupByStatus.test.ts`, `src/view/renderSearchResults.test.ts`, `src/view/renderWorkItemDetail.test.ts`, `src/view/render.test.ts`, `src/view/renderHome.test.ts`, `src/view/renderParent.test.ts`, `src/view/renderWorkItemCard.test.ts`
- Modify (different shape, no `...overrides`): `src/skills/generateContextFile.test.ts`
- Modify (inline literal, not a fixture function): `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `DevelopmentLink` (`{ kind: 'branch'; repositoryId: string; branchName: string } | { kind: 'pullRequest'; repositoryId: string; pullRequestId: number }`), `PullRequestDetails { title: string; status: string }`, `WorkItem.development: DevelopmentLink[]` (new required field), `RawRelation.attributes?: { name?: string }`, `parseDevelopmentLink(relation: RawRelation): DevelopmentLink | null` (exported from `mapWorkItem.ts`).

- [ ] **Step 1: Write the failing tests for `parseDevelopmentLink` and `mapWorkItem`'s `development` field**

Add to `src/azureDevOps/mapWorkItem.test.ts`, as a new `describe` block after the existing `describe('mapWorkItem', ...)` block (at the end of the file):

```ts
describe('parseDevelopmentLink', () => {
  it('parses a pull request ArtifactLink', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/PullRequestId/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/57',
      attributes: { name: 'Pull Request' },
    });
    expect(link).toEqual({ kind: 'pullRequest', repositoryId: '22222222-2222-2222-2222-222222222222', pullRequestId: 57 });
  });

  it('parses a branch ArtifactLink, decoding a slash in the branch name', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Ref/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/GBfeature%2Ffoo',
      attributes: { name: 'Branch' },
    });
    expect(link).toEqual({ kind: 'branch', repositoryId: '22222222-2222-2222-2222-222222222222', branchName: 'feature/foo' });
  });

  it('returns null for an ArtifactLink that is neither a branch nor a pull request', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Commit/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/abc123',
      attributes: { name: 'Fixed in Commit' },
    });
    expect(link).toBeNull();
  });

  it('returns null for a malformed url that does not match either pattern', () => {
    const link = parseDevelopmentLink({ rel: 'ArtifactLink', url: 'not-a-vstfs-url' });
    expect(link).toBeNull();
  });
});

describe("mapWorkItem's development field", () => {
  it('populates development from ArtifactLink relations, ignoring Hierarchy relations', () => {
    const item = mapWorkItem(
      raw({
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/101' },
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/57',
            attributes: { name: 'Pull Request' },
          },
        ],
      }),
      'my-org',
      'MyProject',
    );
    expect(item.development).toEqual([
      { kind: 'pullRequest', repositoryId: '22222222-2222-2222-2222-222222222222', pullRequestId: 57 },
    ]);
  });

  it('defaults to an empty array when there are no ArtifactLink relations', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.development).toEqual([]);
  });
});
```

Update the top of the file to import `parseDevelopmentLink` alongside `mapWorkItem`:

```ts
import { describe, it, expect } from 'vitest';
import { mapWorkItem, parseDevelopmentLink, type RawWorkItem } from './mapWorkItem';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run mapWorkItem.test.ts`
Expected: FAIL — `parseDevelopmentLink` is not exported yet, and `item.development` is `undefined`

- [ ] **Step 3: Add the new types**

In `src/types.ts`, add after the `WorkItem` interface's closing brace, and add the `development` field to `WorkItem` itself:

```ts
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
  development: DevelopmentLink[];
}

export type DevelopmentLink =
  | { kind: 'branch'; repositoryId: string; branchName: string }
  | { kind: 'pullRequest'; repositoryId: string; pullRequestId: number };

export interface PullRequestDetails {
  title: string;
  status: string;
}
```

- [ ] **Step 4: Implement `parseDevelopmentLink` and wire it into `mapWorkItem`**

Update `src/azureDevOps/mapWorkItem.ts`:

```ts
import type { WorkItem, AssignedTo, DevelopmentLink } from '../types';

export interface RawRelation {
  rel: string;
  url: string;
  attributes?: { name?: string };
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

const PULL_REQUEST_URL = /^vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/([^/]+)\/(\d+)$/;
const BRANCH_URL = /^vstfs:\/\/\/Git\/Ref\/[^/]+\/([^/]+)\/GB(.+)$/;

export function parseDevelopmentLink(relation: RawRelation): DevelopmentLink | null {
  const prMatch = relation.url.match(PULL_REQUEST_URL);
  if (prMatch) {
    return { kind: 'pullRequest', repositoryId: prMatch[1], pullRequestId: Number(prMatch[2]) };
  }
  const branchMatch = relation.url.match(BRANCH_URL);
  if (branchMatch) {
    return { kind: 'branch', repositoryId: branchMatch[1], branchName: decodeURIComponent(branchMatch[2]) };
  }
  return null;
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
  const development = relations
    .filter(r => r.rel === 'ArtifactLink')
    .map(parseDevelopmentLink)
    .filter((link): link is DevelopmentLink => link !== null);

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
    development,
  };
}
```

- [ ] **Step 5: Run the `mapWorkItem` tests to verify they pass**

Run: `npx vitest run mapWorkItem.test.ts`
Expected: PASS (all cases, including the pre-existing ones)

- [ ] **Step 6: Run the full unit suite and compile to find every fixture that needs `development: []`**

Run: `npm run compile`
Expected: FAIL — TypeScript errors in every file listed under "Files" above (each object literal typed as `WorkItem` is missing the new required `development` property)

- [ ] **Step 7: Add `development: []` to every fixture using the `...overrides` pattern**

In each of these 10 files, find the line `    assignedTo: null,` immediately followed by `    ...overrides,` inside a `function workItem(overrides: Partial<WorkItem> = {}): WorkItem { return { ... }; }` helper (in `src/view/renderParent.test.ts` the helper is named `parent`, not `workItem` — same shape), and insert `development: [],` between them:

`src/config/resolveSkill.test.ts`, `src/skills/resolvePlaceholders.test.ts`, `src/view/filterSearchResults.test.ts`, `src/view/groupByStatus.test.ts`, `src/view/renderSearchResults.test.ts`, `src/view/renderWorkItemDetail.test.ts`, `src/view/render.test.ts`, `src/view/renderHome.test.ts`, `src/view/renderParent.test.ts`, `src/view/renderWorkItemCard.test.ts`

Change:
```ts
    assignedTo: null,
    ...overrides,
```
to:
```ts
    assignedTo: null,
    development: [],
    ...overrides,
```

- [ ] **Step 8: Fix `src/skills/generateContextFile.test.ts` (plain object literal, no `...overrides`)**

Change:
```ts
  parentId: null,
  childIds: [],
  assignedTo: null,
};
```
to:
```ts
  parentId: null,
  childIds: [],
  assignedTo: null,
  development: [],
};
```

- [ ] **Step 9: Fix the inline `parent` literal in `src/azureDevOps/client.test.ts`**

Change:
```ts
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101], assignedTo: null };
```
to:
```ts
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101], assignedTo: null, development: [] };
```

- [ ] **Step 10: Compile and run the full suite to verify everything is fixed**

Run: `npm run compile`
Expected: no TypeScript errors

Run: `npx vitest run`
Expected: PASS, no regressions

- [ ] **Step 11: Commit**

```bash
git add src/types.ts src/azureDevOps/mapWorkItem.ts src/azureDevOps/mapWorkItem.test.ts src/config/resolveSkill.test.ts src/skills/resolvePlaceholders.test.ts src/skills/generateContextFile.test.ts src/view/filterSearchResults.test.ts src/view/groupByStatus.test.ts src/view/renderSearchResults.test.ts src/view/renderWorkItemDetail.test.ts src/view/render.test.ts src/view/renderHome.test.ts src/view/renderParent.test.ts src/view/renderWorkItemCard.test.ts src/azureDevOps/client.test.ts
git commit -m "feat: parse branch/PR ArtifactLink relations into WorkItem.development"
```

---

### Task 2: Client method `getPullRequest`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `PullRequestDetails` (Task 1).
- Produces: `AzureDevOpsClient.getPullRequest(organization: string, project: string, repositoryId: string, pullRequestId: number): Promise<PullRequestDetails | null>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, as a new `describe` block after `describe('AzureDevOpsClient.getCardSettings', ...)`:

```ts
describe('AzureDevOpsClient.getPullRequest', () => {
  it('fetches and maps a pull request title and status', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ title: 'Fix login bug', status: 'active' }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequest('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toEqual({ title: 'Fix login bug', status: 'active' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories/repo-1/pullrequests/57?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'not found' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequest('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client.test.ts`
Expected: FAIL — `client.getPullRequest is not a function`

- [ ] **Step 3: Implement `getPullRequest`**

In `src/azureDevOps/client.ts`, add the import and the method. Update the type import:

```ts
import type { AssignedTo, WorkItem, CardFieldSettings, PullRequestDetails } from '../types';
```

Add the method right after `getCardSettings` (the last method, just before the closing `}` of the class):

```ts
  async getPullRequest(organization: string, project: string, repositoryId: string, pullRequestId: number): Promise<PullRequestDetails | null> {
    try {
      const data = await this.request<{ title: string; status: string }>(
        `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=7.1`,
      );
      return { title: data.title, status: data.status };
    } catch {
      return null;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client.test.ts`
Expected: PASS (all cases, no regressions)

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add AzureDevOpsClient.getPullRequest"
```

---

### Task 3: Rendering primitive — `renderDevelopmentSection`

**Files:**
- Create: `src/view/renderDevelopment.ts`
- Test: `src/view/renderDevelopment.test.ts`

**Interfaces:**
- Consumes: `DevelopmentLink`, `PullRequestDetails` (Task 1), `escapeHtml` (existing, `src/view/escapeHtml.ts`).
- Produces: `renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderDevelopment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderDevelopmentSection } from './renderDevelopment';
import type { DevelopmentLink, PullRequestDetails } from '../types';

describe('renderDevelopmentSection', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentSection([], {})).toBe('');
  });

  it('renders the "Development" label with the branch-fork icon when there is at least one link', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'main' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('Development');
    expect(html).toContain('<svg');
  });

  it('renders a branch link by its escaped name', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/<xss>' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-dev-item');
    expect(html).toContain('feature/&lt;xss&gt;');
  });

  it('renders a pull request with its resolved title and capitalized status', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const prDetails: Record<string, PullRequestDetails> = { 'repo-1:57': { title: 'Fix <login> bug', status: 'active' } };
    const html = renderDevelopmentSection(links, prDetails);
    expect(html).toContain('#57 Fix &lt;login&gt; bug (Active)');
  });

  it('renders only the #id when the pull request details were not resolved', () => {
    const links: DevelopmentLink[] = [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('#57');
    expect(html).not.toContain('(Active)');
  });

  it('renders multiple links (branch and pull request) in the same section', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
    ];
    const html = renderDevelopmentSection(links, {});
    expect(html.split('kb-dev-item').length - 1).toBe(2);
    expect(html).toContain('main');
    expect(html).toContain('#57');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run renderDevelopment.test.ts`
Expected: FAIL — cannot find module `./renderDevelopment`

- [ ] **Step 3: Implement `renderDevelopmentSection`**

Create `src/view/renderDevelopment.ts`:

```ts
import type { DevelopmentLink, PullRequestDetails } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_FORK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z" fill="currentColor"/></svg>`;

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run renderDevelopment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/view/renderDevelopment.ts src/view/renderDevelopment.test.ts
git commit -m "feat: add renderDevelopmentSection view primitive"
```

---

### Task 4: `renderWorkItemCard.ts` wiring

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/renderWorkItemCard.test.ts`

**Interfaces:**
- Consumes: `renderDevelopmentSection` (Task 3).
- Produces: `renderWorkItemCard(...)` gains a 10th optional trailing parameter `prDetails: Record<string, PullRequestDetails> = {}`.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemCard.test.ts`, inside the existing `describe('renderWorkItemCard', ...)` block, after the last test (`shows the parent row before the assignee row`):

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run renderWorkItemCard.test.ts`
Expected: FAIL — `kb-dev-label` never appears, and the 10th argument is silently ignored since the parameter doesn't exist yet

- [ ] **Step 3: Wire `renderDevelopmentSection` into `renderWorkItemCard`**

Update `src/view/renderWorkItemCard.ts`:

```ts
import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { renderParentRow } from './renderParent';
import { renderDevelopmentSection } from './renderDevelopment';
import { resolveShowAssignedTo } from '../config/resolveCardFieldVisibility';
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
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedBoard: string | undefined = undefined,
  prDetails: Record<string, PullRequestDetails> = {},
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedBoard);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentSection(workItem.development, prDetails);
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
      ${parentHtml}
      ${assigneeHtml}
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run renderWorkItemCard.test.ts`
Expected: PASS (all cases, including the pre-existing ones — `prDetails` defaults to `{}` so old calls are unaffected)

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/renderWorkItemCard.test.ts
git commit -m "feat: render the Development section unconditionally on every work item card"
```

---

### Task 5: `render.ts` and `renderHome.ts` wiring

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Modify: `src/view/renderHome.ts`
- Modify: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `renderWorkItemCard`'s new `prDetails` parameter (Task 4).
- Produces: `RenderState.prDetails?: Record<string, PullRequestDetails>` (new optional field).

- [ ] **Step 1: Write the failing test for `render.ts`**

Add to `src/view/render.test.ts`, after the last test (`does not show the parent row on subtask cards`), inside the `describe('render', ...)` block:

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run render.test.ts`
Expected: FAIL — neither "Main PR" nor "Sub PR" appear yet (compile also fails on `prDetails` in the state object until Step 3 lands, since `RenderState` doesn't have that field yet)

- [ ] **Step 3: Wire `prDetails` into `render.ts`**

Update `src/view/render.ts`:

```ts
import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedBoard?: string;
  prDetails?: Record<string, PullRequestDetails>;
}
```

And, in the body (where `avatars`/`showParent` are computed and the two `renderWorkItemCard` calls happen):

```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedBoard);
  const prDetails = state.prDetails ?? {};
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedBoard, prDetails))
        .join('')
    : '<div class="kb-empty">No child items.</div>';
```

```ts
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedBoard, prDetails)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run render.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Write the failing test for `renderHome.ts`**

Add to `src/view/renderHome.test.ts`, after the last test (`does not make the title clickable on the home screen card`), inside the `describe('renderHome', ...)` block:

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

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run renderHome.test.ts`
Expected: FAIL — "Home PR" never appears

- [ ] **Step 7: Wire `prDetails` into `renderHome.ts`**

Update the `renderWorkItemCard` call in `src/view/renderHome.ts`:

```ts
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedBoard, state.prDetails ?? {})}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run renderHome.test.ts`
Expected: PASS (all cases)

- [ ] **Step 9: Run the full unit suite and compile**

Run: `npm run compile`
Expected: no TypeScript errors

Run: `npx vitest run`
Expected: PASS, no regressions

- [ ] **Step 10: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "feat: thread prDetails through render.ts and renderHome.ts"
```

---

### Task 6: `KanbrainViewProvider.ts` — PR details cache and wiring

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

No dedicated unit test for this task: `KanbrainViewProvider` is coupled to the VS Code API and already has no test file (`resolveAvatars`, its closest analog, is untested directly too) — verified via `npm run compile`, the full test suite, and the README manual verification checklist (Task 7).

- [ ] **Step 1: Add the `prCache` field and the `DevelopmentLink`/`PullRequestDetails` import**

Read `src/view/KanbrainViewProvider.ts` in full first to confirm line numbers haven't shifted from what's quoted below.

Update the type import (currently line 4):

```ts
import type { WorkItem, KanbrainConfig, SkillEntry, DevelopmentLink, PullRequestDetails } from '../types';
```

Add a new field next to `avatarCache` (currently line 31):

```ts
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();
```

- [ ] **Step 2: Add the `resolvePullRequestDetails` method**

Add it right after `resolveAvatars` (currently ends at line 206, right before `private setShowAssignedTo`):

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

- [ ] **Step 3: Call it from `refresh()` and pass the result into `render(...)`**

Update `refresh()` (currently around lines 390-410):

```ts
    // Whether the assignee actually renders is decided per work item type by resolveShowAssignedTo
    // (mirrored from the real board), so avatars are always resolved here rather than gated by the
    // (now search-only) manual showAssignedTo toggle.
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
    const prDetails = config ? await this.resolvePullRequestDetails([workItem, ...subtasks].filter((w): w is WorkItem => !!w)) : {};

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
        selectedBoard: this.selectedBoard,
        prDetails,
      }),
    );
  }
```

Note `parent` is deliberately excluded from `resolvePullRequestDetails`'s input list — the parent work item is only ever rendered through `renderParentRow`, never through `renderWorkItemCard`, so it never needs `prDetails`.

- [ ] **Step 4: Add the CSS for the Development section**

Add right before the closing template literal backtick of the `css()` method (currently `.kb-select-row select { ... }` is the last rule, at line 656):

```ts
      .kb-select-row select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; padding: 2px 4px; }
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
    `;
```

- [ ] **Step 5: Compile and run the full unit suite**

Run: `npm run compile`
Expected: no TypeScript errors

Run: `npx vitest run`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: resolve and cache pull request details for the Development section"
```

---

### Task 7: README manual verification checklist

**Files:**
- Modify: `README.md`

No test — documentation-only task, matching how the existing manual verification checklist is maintained.

- [ ] **Step 1: Add checklist items**

Read `README.md`'s "Manual verification checklist" section first. Add these items at the end of the list:

```markdown
- [ ] A work item with a linked branch shows a "Development" section (branch-fork icon + "Development" label) on its card, listing the branch name — on the main card, every subtask card, and the Home screen's active card.
- [ ] A work item with a linked pull request shows `#id Title (Status)` in the Development section; a work item with no linked branches/PRs shows no Development section at all.
- [ ] If the pull request's title/status fails to load, the Development section still shows that PR's `#id` alone, without breaking the rest of the card.
- [ ] The Development section is never gated by any Config screen setting — it shows the same way regardless of `showAssignedTo`, `cardSettingsByBoard`, or the selected board.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add manual verification checklist items for the Development section"
```
