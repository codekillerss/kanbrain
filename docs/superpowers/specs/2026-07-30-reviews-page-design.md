# Reviews Page Design

## Summary

Add a new **Reviews** tab to the Kanbrain sidebar webview, alongside the existing Home and Brain tabs. It shows a compact list of all pull requests across every repository in the configured Azure DevOps project (not just repositories with a local path mapping), filterable by status (Active, Completed, Abandoned; Active by default), sorted newest-first, refreshed automatically in the background. Clicking a PR opens the existing PR detail panel — no changes needed there.

## Goals

- Give a project-wide overview of pull request activity, not tied to the currently selected work item.
- Reuse existing rendering/navigation/detail-panel infrastructure as much as possible.
- Keep the first version simple: no grouping, no text/author search, no reviewer votes or comment counts in the list — just enough to see what's open and jump into detail.

## Non-goals (this iteration)

- Text search or author filter within the Reviews list.
- Grouping by repository.
- Showing reviewer votes, required/optional tags, or unresolved comment counts in the list (available already in the PR detail panel).
- Any change to `PullRequestDetailPanelManager` or `renderPullRequestDetail.ts`.

## Data: new project-wide PR listing

Azure DevOps exposes a project-scoped "Get Pull Requests By Project" endpoint (distinct from the per-repository one already used by `getPullRequestDetail`):

```
GET https://dev.azure.com/{organization}/{project}/_apis/git/pullrequests
    ?searchCriteria.status={active|completed|abandoned}
    &api-version=7.1
```

New method on `AzureDevOpsClient` (`src/azureDevOps/client.ts`):

```ts
async listProjectPullRequests(
  organization: string,
  project: string,
  status: 'active' | 'completed' | 'abandoned',
): Promise<PullRequestSummary[]>
```

Follows the existing error-handling convention in this file: on failure, catch and return `[]` (transient failures are retried on the next poll by the caller; 401/403 is handled by the caller the same way it already is for the current work item fetch).

New type in `src/types.ts` — only what the compact card needs:

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

## UI: `renderReviews.ts`

New render function, following the pattern of `renderHome.ts` / `renderBrain.ts`:

- **Status filter**: a `<select>` at the top (same visual pattern as the Team selector on Home) with Active / Completed / Abandoned options.
- **List of compact cards**, one per PR, newest first (`creationDate` descending), no grouping:
  - Status dot + label (reuse/extract `STATUS_COLORS` + a `renderStatusDot`-style helper — currently duplicated conceptually between here and `renderPullRequestDetail.ts`; extract to a shared module, e.g. `renderPrStatus.ts`, and update `renderPullRequestDetail.ts` to use it too).
  - Repo tag (`renderRepoTag`) and source branch tag (`renderBranchTag`) from `renderRepoBranchTags.ts`.
  - PR icon: export `renderPullRequestIcon`/`PULL_REQUEST_ICON` from `renderDevelopment.ts` instead of redefining it.
  - Title (`#id title`), author display name, relative creation time.
- Each card is a link to `command:kanbrain.openPullRequestDetail?[repositoryId, pullRequestId]` — the same command the Development section already uses. No new command needed.
- **Empty state**: `<div class="kb-empty">No {status} pull requests.</div>` matching the existing `kb-empty` convention.

Card layout:

```
● Active   [repo-tag] [branch-tag]
  #123 Corrige validação de datas no formulário de cadastro
  João Silva · há 2 horas
```

## Navigation

- `renderFooter.ts`: new button between the Brain button and the board-config-actions divider, using the PR icon, `title="Reviews"`, active state when `state.screen === 'reviews'`.
- `render.ts`: `RenderState.screen` gains `'reviews'`. New branch:
  ```ts
  if (state.screen === 'reviews') {
    return `${renderReviews(state)}${renderFooter(state)}`;
  }
  ```
  (No search dialog — not applicable to this screen.)
- `RenderState` gains:
  ```ts
  reviewsPullRequests?: PullRequestSummary[];
  reviewsStatusFilter?: 'active' | 'completed' | 'abandoned';
  ```

## `KanbrainViewProvider.ts` integration

- New message handler (`show-reviews`, mirroring `show-brain`) sets `this.currentScreen = 'reviews'` and calls `refresh()`.
- New persisted field `private reviewsStatusFilter: 'active' | 'completed' | 'abandoned' = 'active'`, with a message handler for the `<select>` change that updates it and calls `refresh()` — persists across re-renders and tab switches, same as `selectedTeam` and `openBrainSegment`.
- Inside `refresh()`: the provider already polls every 5s (`POLL_INTERVAL_MS`) to refresh the current work item regardless of active screen. Fetching the full project PR list on every one of those ticks would be unnecessarily heavy, so:
  - Only fetch `listProjectPullRequests` when `this.currentScreen === 'reviews'`.
  - Throttle: track `private lastReviewsFetchAt = 0` and `private lastReviewsStatusFilter`; only call the API if ≥30s have elapsed since the last fetch, OR the status filter changed, OR this is the first refresh since entering the Reviews screen. This gives an effective ~30s auto-refresh without adding a second polling loop.
  - Store the result in an instance field (e.g. `this.reviewsPullRequests`) and pass it into `render()` as `reviewsPullRequests`.
  - Errors follow the existing pattern: transient failure → keep the previous list, let the next scheduled refresh retry; 401/403 → same disconnected-screen handling already in `refresh()`.

## Testing

Following the repo's convention of a `*.test.ts` beside each source file:

- `client.test.ts`: `listProjectPullRequests` — happy path mapping, status passed through in the query string, error → `[]`.
- `renderReviews.test.ts`: empty list per status, list with items renders cards with correct fields/links, selected filter reflected in the `<select>`.
- `renderFooter.test.ts`: Reviews button present and marked active when `state.screen === 'reviews'`.
- `render.test.ts`: `'reviews'` screen renders `renderReviews` + `renderFooter`, no search dialog.
- Extracted status-dot helper: existing `renderPullRequestDetail.test.ts` coverage continues to pass unchanged after the extraction.
