# Development List Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Development list in the work item detail panel: bordered container matching the other detail groups, CSS-only paginated "See more" (3 visible + repeatable batches of 5), text ellipsis with a hover tooltip, and a distinct icon per link kind (branch vs pull request).

**Architecture:** All changes are contained in `renderDevelopment.ts` (the single consumer, `renderWorkItemDetail.ts`'s side column, is unaffected structurally) plus the CSS block in `WorkItemDetailPanelManager.ts`. Pagination is a recursive HTML generator (`renderMoreBatches`) producing nested `<input type="checkbox">` + `<div>` + `<label>` groups, styled with CSS sibling selectors — no JavaScript, no change to the panel's `enableScripts: false`.

**Tech Stack:** TypeScript, Vitest, plain CSS (`:checked` sibling-selector toggle, no JS).

## Global Constraints

- `renderDevelopmentBadge` (the card badge) is untouched — this plan only touches `renderDevelopmentSection` and its test file, plus CSS in `WorkItemDetailPanelManager.ts`.
- No new `enableScripts: true` — the "See more" toggle must work via CSS only.
- The new PR icon is a custom glyph (circle + circle + 2 paths), not a reproduction of an exact Fluent UI asset — do not replace it with a guessed/memorized Fluent path.
- Pagination: 3 items always visible, then batches of 5, each revealed by its own "See more" click (repeatable — not "reveal everything on first click").

---

### Task 1: Bordered container, per-kind icons, ellipsis, and pagination

**Files:**
- Modify: `src/view/renderDevelopment.ts`
- Test: `src/view/renderDevelopment.test.ts`

**Interfaces:**
- Consumes: nothing new — `DevelopmentLink`, `PullRequestDetails` from `../types` (existing).
- Produces: `renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string` — same exported signature, only its output HTML/CSS classes change. `renderWorkItemDetail.ts` (its only caller) needs no changes since the signature is identical.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/view/renderDevelopment.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { renderDevelopmentSection, renderDevelopmentBadge } from './renderDevelopment';
import type { DevelopmentLink, PullRequestDetails } from '../types';

describe('renderDevelopmentSection', () => {
  it('returns an empty string when there are no development links', () => {
    expect(renderDevelopmentSection([], {})).toBe('');
  });

  it('wraps the section in the same bordered group used by other detail fields', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'main' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-detail-group');
    expect(html).toContain('kb-detail-group-label');
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('Development');
    expect(html).toContain('<svg');
  });

  it('renders a branch link by its escaped name, inside a text span, with a hover tooltip', () => {
    const links: DevelopmentLink[] = [{ kind: 'branch', repositoryId: 'repo-1', branchName: 'feature/<xss>' }];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('kb-dev-item');
    expect(html).toContain('kb-dev-item-text');
    expect(html).toContain('feature/&lt;xss&gt;');
    expect(html).toContain('title="feature/&lt;xss&gt;"');
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

  it('uses a visually distinct icon for branch vs pull request items', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
      { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
    ];
    const html = renderDevelopmentSection(links, {});
    expect(html).toContain('M11 5.5'); // branch fork icon signature
    expect(html).toContain('<circle'); // pull request icon signature, absent from the branch icon
  });

  it('does not paginate when there are 3 or fewer links', () => {
    const links: DevelopmentLink[] = [
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'a' },
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'b' },
      { kind: 'branch', repositoryId: 'repo-1', branchName: 'c' },
    ];
    const html = renderDevelopmentSection(links, {});
    expect(html).not.toContain('kb-dev-more-toggle');
    expect(html).not.toContain('See more');
  });

  it('shows only 3 items plus a "See more" control when there are more than 3 links', () => {
    const links: DevelopmentLink[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'branch' as const,
      repositoryId: 'repo-1',
      branchName: `branch-${i}`,
    }));
    const html = renderDevelopmentSection(links, {});
    expect(html.split('kb-dev-item').length - 1).toBe(5);
    expect(html.split('kb-dev-more-toggle').length - 1).toBe(1);
    expect(html.split('See more').length - 1).toBe(1);
  });

  it('adds one more repeatable "See more" batch per additional 5 items beyond the first 3', () => {
    const links: DevelopmentLink[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'branch' as const,
      repositoryId: 'repo-1',
      branchName: `branch-${i}`,
    }));
    const html = renderDevelopmentSection(links, {});
    // 10 items - 3 initial = 7 remaining -> ceil(7 / 5) = 2 batches/buttons.
    expect(html.split('kb-dev-item').length - 1).toBe(10);
    expect(html.split('kb-dev-more-toggle').length - 1).toBe(2);
    expect(html.split('See more').length - 1).toBe(2);
  });
});

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
Expected: FAIL — the new/changed assertions (`kb-detail-group`, `kb-dev-item-text`, `title="..."`, `<circle`, `kb-dev-more-toggle`, `See more`) don't match the current output, which still uses `kb-field-row`/`kb-field-label` and has no pagination or per-kind icon.

- [ ] **Step 3: Implement the new `renderDevelopment.ts`**

Replace the full contents of `src/view/renderDevelopment.ts` with:

```ts
import type { DevelopmentLink, PullRequestDetails } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_FORK_ICON_PATH =
  'M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z';

function renderBranchForkIcon(fill: string): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${BRANCH_FORK_ICON_PATH}" fill="${fill}"/></svg>`;
}

function renderPullRequestIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M6 15.5V9a3 3 0 0 1 3-3h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3l4 3-4 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const BRANCH_FORK_ICON = renderBranchForkIcon('currentColor');
const PULL_REQUEST_ICON = renderPullRequestIcon();
const BADGE_ICON_COLOR = '#EAA300';
const INITIAL_VISIBLE = 3;
const BATCH_SIZE = 5;

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    const name = escapeHtml(link.branchName);
    return `<div class="kb-dev-item" title="${name}">${BRANCH_FORK_ICON}<span class="kb-dev-item-text">${name}</span></div>`;
  }
  const details = prDetails[`${link.repositoryId}:${link.pullRequestId}`];
  const label = details
    ? `#${link.pullRequestId} ${escapeHtml(details.title)} (${escapeHtml(capitalize(details.status))})`
    : `#${link.pullRequestId}`;
  return `<div class="kb-dev-item" title="${label}">${PULL_REQUEST_ICON}<span class="kb-dev-item-text">${label}</span></div>`;
}

function renderMoreBatches(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>, startIndex: number): string {
  if (startIndex >= development.length) {
    return '';
  }
  const batch = development.slice(startIndex, startIndex + BATCH_SIZE);
  const checkboxId = `kb-dev-more-${startIndex}`;
  return `
    <input type="checkbox" id="${checkboxId}" class="kb-dev-more-toggle" />
    <div class="kb-dev-extra">
      ${batch.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, startIndex + BATCH_SIZE)}
    </div>
    <label for="${checkboxId}" class="kb-dev-more-btn">See more</label>
  `;
}

export function renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string {
  if (development.length === 0) {
    return '';
  }
  const visible = development.slice(0, INITIAL_VISIBLE);
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label kb-dev-label">${BRANCH_FORK_ICON}<span>Development</span></div>
      ${visible.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, INITIAL_VISIBLE)}
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

Note: `renderDevelopmentBadge` is unchanged from before — it still uses `renderBranchForkIcon(BADGE_ICON_COLOR)` directly (not the `BRANCH_FORK_ICON` constant, which is fixed to `currentColor`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderDevelopment.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Update the CSS in `WorkItemDetailPanelManager.ts`**

In `src/view/WorkItemDetailPanelManager.ts`'s `css()` method, replace (currently the two lines right after `.kb-checkbox-row`... actually they follow the comments section rules — find by content, not line number, since line numbers shift):

```ts
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
```

with:

```ts
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 4px; opacity: 0.85; }
      .kb-dev-item svg { flex-shrink: 0; }
      .kb-dev-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kb-dev-more-toggle { display: none; }
      .kb-dev-extra { display: none; }
      .kb-dev-more-toggle:checked + .kb-dev-extra { display: block; }
      .kb-dev-more-toggle:checked ~ .kb-dev-more-btn { display: none; }
      .kb-dev-more-btn { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--vscode-textLink-foreground); cursor: pointer; }
      .kb-dev-more-btn:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
```

- [ ] **Step 6: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass (`renderWorkItemDetail.test.ts` needs no changes — it only asserts the section appears/doesn't appear via `kb-dev-label`, which is still present).

- [ ] **Step 8: Commit**

```bash
git add src/view/renderDevelopment.ts src/view/renderDevelopment.test.ts src/view/WorkItemDetailPanelManager.ts
git commit -m "feat: polish Development list — bordered group, pagination, ellipsis, per-kind icons"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and type-check one more time**

Run: `npx vitest run && npm run compile`
Expected: all pass, no errors.

- [ ] **Step 2: Manual verification (F5)**

Press F5 to launch the Extension Development Host. Open the detail panel (click a card's title) for a work item with linked branches/PRs:
- Confirm the Development section now has the same bordered box look as the other field groups (State, Type, etc.) above it.
- Confirm branch items show the fork icon and PR items show the new circle+arrow icon.
- Confirm a long branch name / PR title truncates with `…` instead of wrapping, and hovering it shows the full text as a tooltip.
- If the work item has more than 3 linked items, confirm only 3 show initially, a "See more" link appears, and clicking it reveals the next batch (and, if there are more than 8 total, that a second "See more" appears and works too).

- [ ] **Step 3: Report back**

Tell the user the outcome of the manual check — if anything doesn't render as expected (e.g. the checkbox-hack toggle not appearing correctly in the actual VS Code webview), capture what happened so it can be investigated.
