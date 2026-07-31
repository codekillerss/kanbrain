# Branch tag: Checkout / Compare with

## Problem

Clicking a branch tag (in PR detail, Reviews list, or Development page) currently only offers checkout:

```ts
const choice = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
```

We want a second option — comparing the branch against another one via GitLens — without touching the existing "View Diff" button on the PR page, which already has both branches of a PR to compare and works fine as-is.

## Scope

Applies uniformly to every clickable branch tag rendered by `renderBranchTag()` (`src/view/renderRepoBranchTags.ts`), i.e. all three call sites:

- `src/view/renderPullRequestDetail.ts` (source and target branch tags)
- `src/view/renderReviews.ts` (source branch tag in the PR list)
- `src/view/renderDevelopment.ts` (branch-only development links, no associated PR)

The "View Diff" button (`src/commands/viewPullRequestDiff.ts`, rendered in `renderPullRequestDetail.ts`) is **out of scope** — unchanged.

## Flow

Clicking a branch tag shows two sequential modals:

```
Click branch tag "X"
  |
  v
Modal 1 (action choice): "Branch "X"" [Checkout] [Compare with] [Cancel]
  |
  |-- Checkout ------------> Modal 2: "Check out branch "X"?" [Checkout] [Cancel]
  |                              |-- Checkout --> git fetch + git checkout X (unchanged today's logic)
  |                              '-- Cancel   --> no-op
  |
  '-- Compare with ---------> QuickPick: local branches of the repo, excluding "X"
                                  |
                                  '-- picks "Y" --> Modal 2: "Compare "X" with "Y"?" [Compare] [Cancel]
                                                        |-- Compare --> gitlens.compareWith(ref1: Y, ref2: X)
                                                        '-- Cancel  --> no-op
```

Dismissing any modal/QuickPick (Esc, click-away) is a no-op, same as today's cancel behavior.

No new render-time data is needed: the command signature stays `(repositoryId: string, branchName: string)`, so `renderBranchTag()` and all three callers are unchanged.

## Implementation

### `src/commands/checkoutBranch.ts`

Rewritten to:

1. Resolve `repoEntry` from config as today (unchanged error handling for unmapped repo).
2. Show Modal 1 with `showWarningMessage('Branch "X"', { modal: true }, 'Checkout', 'Compare with')`.
3. **Checkout branch:** show today's exact Modal 2 and, on confirm, call the existing `checkoutBranch()` git helper — logic unchanged from current implementation.
4. **Compare with branch:**
   - Call new `listLocalBranches(repoEntry.path)`.
   - Filter out `branchName` itself from the results.
   - If empty, show `showErrorMessage('No other local branches found to compare with.')` and stop (no QuickPick).
   - Otherwise `showQuickPick(otherBranches, { placeHolder: 'Compare "X" with...' })`.
   - If a branch `Y` is picked, show Modal 2: `showWarningMessage('Compare "X" with "Y"?', { modal: true }, 'Compare')`.
   - On confirm, call `vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoEntry.path), { ref1: Y, ref2: X })` — same command `viewPullRequestDiff.ts` already uses.
   - Wrap the `executeCommand` call in try/catch; on failure (e.g. GitLens not installed), show `showErrorMessage('GitLens is required to compare branches. Install it from the Extensions view.')`.

### `src/git/listBranches.ts` (new)

```ts
export async function listLocalBranches(workspaceRoot: string): Promise<string[]>
```

Runs `git branch --format=%(refname:short)` in `workspaceRoot`, splits stdout into trimmed non-empty lines. Returns `[]` on failure (spawn error, not a git repo, etc.) — same defensive pattern as `src/git/getCurrentBranch.ts`.

Local branches only (no remote-tracking branches) — matches what's directly checkout-able/comparable without a fetch.

## Edge cases

| Case | Behavior |
|---|---|
| Repo not mapped locally | Tag is already rendered disabled (`checkoutCommandArgs === null`) — unaffected, no click possible. |
| GitLens not installed | Modal 1 and QuickPick still show normally; the `gitlens.compareWith` call fails and is caught, showing an install-GitLens error message. |
| Only one local branch exists (the one clicked) | "Compare with" shows an error message instead of an empty QuickPick. |
| User cancels Modal 1, QuickPick, or Modal 2 | No-op, nothing happens. |

## Testing

- `src/commands/checkoutBranch.test.ts` (new/extended): mock `vscode.window.showWarningMessage`, `showQuickPick`, `executeCommand`. Cover: checkout happy path (unchanged), compare happy path, compare with no other branches, compare with GitLens missing (command execution throws), cancel at each of the three steps.
- `src/git/listBranches.test.ts` (new): mock `execFile`/`child_process`, cover success (multiple branches parsed) and failure (returns `[]`).

## Non-goals

- No change to the "View Diff" button or its underlying command.
- No new "default branch" detection (via git or Azure DevOps API) — replaced by the manual QuickPick selection instead.
- No changes to `renderBranchTag()` signature or any of its callers.
