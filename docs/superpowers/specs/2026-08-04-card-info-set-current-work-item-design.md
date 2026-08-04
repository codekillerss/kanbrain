# Set current work item from card info header

## Problem

The Flow screen already lets the user swap the active work item from a parent or
child card via a ⇄ "Set as current work item" button. The card info panel
(`WorkItemDetailPanelManager` / `renderWorkItemDetail.ts`) has no equivalent — to
switch context to the item currently being viewed in detail, the user has to go
back to the Flow screen and find it as a parent/child card first.

## Goal

Add a "Set as current work item" action to the card info header, visible only
when the item being viewed is not already the current work item.

Scope: header only. Parent/child links inside the "Related Work" section of the
card info page are explicitly out of scope for this change.

## Why this needs new plumbing

`WorkItemDetailPanelManager` and `KanbrainViewProvider` are fully decoupled today:
`KanbrainViewProvider.activeWorkItemId` is a private field with no getter, and
`WorkItemDetailPanelManager` has no concept of "current work item" at all. The
card info panel also renders with `enableScripts: false`, so the button must be a
`command:` URI anchor (the pattern already used for "Open in browser" and for the
existing `kb-pick-link` anchor in `renderPullRequestDetail.ts`'s
`renderLinkedWorkItem`), not the `data-action` + `postMessage` JS button used on
the Flow screen (`renderPickButton` in `renderWorkItemCard.ts`).

## Changes

### 1. `KanbrainViewProvider.ts`

Add a public getter over the existing private field:

```ts
getActiveWorkItemId(): number | undefined {
  return this.activeWorkItemId;
}
```

### 2. `extension.ts`

`detailPanelManager` is currently constructed (line 43) before `provider` (line
46), so `WorkItemDetailPanelManager` cannot take a direct reference to `provider`
at construction time. Use a forward-reference closure:

```ts
let providerRef: KanbrainViewProvider | undefined;
const detailPanelManager = workspaceRoot && client
  ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri, () => providerRef?.getActiveWorkItemId())
  : undefined;
...
const provider = new KanbrainViewProvider(...);
providerRef = provider;
```

### 3. `WorkItemDetailPanelManager.ts`

- New constructor parameter `getActiveWorkItemId: () => number | undefined`,
  stored as a private readonly field.
- In `loadAndRender`, resolve `currentWorkItemId = this.getActiveWorkItemId()`
  and include it in the `stateKey` JSON used for poll-based change detection, so
  the 5s poll re-renders the panel (and hides the button) when the active work
  item changes while the panel is open.
- Pass `currentWorkItemId` through to `renderWorkItemDetail(...)`.
- Add `'kanbrain.pickWorkItem'` to the `enableCommandUris` allowlist passed to
  `vscode.window.createWebviewPanel` — it's missing today, so the command URI
  link would otherwise be silently blocked by VS Code.

### 4. `renderWorkItemDetail.ts`

- Add `currentWorkItemId: number | undefined` to `WorkItemDetailInput`.
- In the header block, next to the existing "Open in browser" link, render:

```html
<a class="kb-pick-link" href="command:kanbrain.pickWorkItem?${encodeURIComponent(JSON.stringify([workItem.id]))}" title="Set as current work item">&#8644;</a>
```

  only when `workItem.id !== currentWorkItemId`. Reuses the existing
  `.kb-pick-link` CSS class already defined in `detailPanelCss.ts`.

## Non-goals / explicitly out of scope

- No button on the parent/child mini-links in the "Related Work" section of the
  card info page (user confirmed header-only).
- No shared/extracted helper component for the pick-link markup. The codebase
  already has three independent variants of this affordance (`renderPickButton`
  in `renderWorkItemCard.ts`, the inline anchor in
  `renderPullRequestDetail.ts`'s `renderLinkedWorkItem`, and the search-results
  variant). Adding a fourth call site doesn't justify extracting a shared
  component now — follow existing convention and keep it local to
  `renderWorkItemDetail.ts`.

## Testing

Update `renderWorkItemDetail.test.ts` to cover both cases:
- `currentWorkItemId` differs from `workItem.id` → the pick link is rendered.
- `currentWorkItemId` equals `workItem.id` → the pick link is absent.
