# Work Item Status From The Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before editing anything:** `git branch --show-current` must not say `main`. This work belongs on the
> branch `worktree-work-item-status-from-panel`, branched from an up-to-date `main`. Nothing reaches
> `main` except through a PR the repo owner reviews. A plan without this step already caused a change to be
> pushed to `main` unreviewed (`a10f692`, issue #9).

**Goal:** Let the user change the active work item's status from the sidebar card, writing straight to Azure DevOps. Closes #10. Design: `docs/superpowers/specs/2026-09-03-work-item-status-from-panel-design.md`.

**Architecture:** This is the first write Kanbrain performs. `fetchWithAuth` currently forces `Content-Type: application/json` after spreading the caller's headers, so no caller can send the `application/json-patch+json` the work item PATCH endpoint requires — that ordering has to change before a write method can exist at all. On top of it, `updateWorkItemStatus` issues the JSON Patch. The status options need no new discovery call: `config.skills[type]` is already keyed by that type's real statuses. The control renders only on the Flow screen's main card, reaching `renderWorkItemCard` through a new trailing `options` object rather than an eleventh positional parameter. `KanbrainViewProvider` routes the message, guards the 5s poll against clobbering an in-flight write, and surfaces failures instead of swallowing them the way a failed poll is swallowed.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- The three texts that promise read-only (`USAGE_GUIDE_CONTENT`, `buildSkillsAssistantFile.ts`, `README.md`) must be rewritten **scoped**, not generalised. Kanbrain writes *the status, from an explicit panel action* — everything else still goes through the agent's own tooling. A text saying "Kanbrain writes to the board" would tell skills to stop acting, and the skill → agent → MCP path stays the right mechanism for anything that needs judgement (the validation-comment skill is the live example).
- `renderWorkItemCard` already takes 10 positional parameters. Do not add an eleventh. New flags go in a trailing `options` object; migrating the existing 10 into it is a separate refactor and the owner's call.
- The status control renders **only** on the Flow screen's main card — not on children, the Home card, or search results.
- Do not touch `WorkItemDetailPanelManager` or `PullRequestDetailPanelManager`. They run `enableScripts: false` with a full CSP; that is the repo's secure model and trading it for a dropdown is not this PR's decision.
- `updateWorkItemStatus` lets errors propagate. The optional-enrichment pattern (`getPullRequest`, `listRepositories` returning `null`/`[]`) is wrong for a write.
- Every task leaves `npm run compile` and `npx vitest run` green.

---

### Task 1: Let callers set their own Content-Type

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:** none new. `fetchWithAuth` keeps its signature; only header precedence changes.

- [ ] **Step 1: Write the failing test**

In `client.test.ts`, following the existing fake-fetch style, assert that a request whose `init.headers` sets `Content-Type: application/json-patch+json` reaches `fetchImpl` with that value, and that a request passing no `Content-Type` still gets `application/json`.

- [ ] **Step 2: Run it and watch the first case fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — the caller's value is overwritten.

- [ ] **Step 3: Move the default ahead of the spread**

```ts
headers: {
  'Content-Type': 'application/json',
  ...(init?.headers ?? {}),
  Authorization: `Bearer ${token}`,
},
```

`Authorization` stays last: it is not the caller's to override. No existing call site passes `Content-Type`, so behaviour is unchanged for every current request.

- [ ] **Step 4: Verify** — `npx vitest run` green.

---

### Task 2: Add the first write method

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- `updateWorkItemStatus(organization: string, project: string, id: number, status: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Assert the method issues `PATCH` to `.../{project}/_apis/wit/workitems/{id}?api-version=7.1`, with `Content-Type: application/json-patch+json` and body `[{ op: 'add', path: '/fields/System.State', value: <status> }]`; and that a non-ok response rejects rather than resolving, so the caller can surface it.

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement it** next to the other work item methods, reusing `fetchWithAuth`. No `try/catch` — `AzureDevOpsHttpError` carries the status and body, and the UI needs both.

- [ ] **Step 4: Verify** — `npx vitest run` green.

---

### Task 3: Render the status control on the main card

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/renderWorkItemCard.test.ts`
- Modify: `src/view/render.ts`

**Interfaces:**
- `renderWorkItemCard(..., options?: { editableStatus?: boolean })` — trailing, optional, no existing call site changed.

- [ ] **Step 1: Write the failing tests**

Cover: with `editableStatus: true` the card renders a `<select>` carrying `data-action="set-work-item-status"` and the work item id, with one `<option>` per key of `config.skills[type]` and the current status selected; without the flag the card renders exactly what it renders today; and a type absent from `config.skills` renders the plain status row rather than an empty select.

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement**, replacing the `kb-status-row` content with the select only when the flag is on. Keep `renderStatusDot` beside it so the colour cue survives.

- [ ] **Step 4: Pass the flag from the Flow screen only** — in `render.ts`, the `kb-main-card` call gets `{ editableStatus: true }`; the parent card, the children and every other call stay untouched.

- [ ] **Step 5: Verify** — `npx vitest run` green.

---

### Task 4: Wire the write, guard the poll, surface failures

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:** none exported — a `set-work-item-status` message type and a private handler.

- [ ] **Step 1: Route the message**

Add the `else if (message.type === 'set-work-item-status')` branch alongside the existing ones, and a `change` listener in the inline script that posts the id and the chosen status. Follow the four-point contract: `data-action` in the markup, listener in `wrapHtml`, branch in `onDidReceiveMessage`, assertion in the render test (already covered by Task 3).

- [ ] **Step 2: Guard the poll**

Add a private `statusWriteInFlight = false`. Set it before the PATCH, clear it in a `finally`. `refresh()` returns early while it is true, so a poll already in flight cannot restore the old status under the user's cursor.

- [ ] **Step 3: Re-read after writing**

On success, set `lastState = ''` and call `refresh()`. Do not assume the written value is what the board now holds — a process rule may change other fields alongside the state.

- [ ] **Step 4: Make failure visible**

On error, `vscode.window.showErrorMessage` with the message from `AzureDevOpsHttpError`, then refresh so the control snaps back to the board's real value. This is the opposite of the poll's silent-retry behaviour, and deliberately so.

- [ ] **Step 5: Show progress**

Reuse the existing pair: add `kb-loading` to the control while the write is in flight and release it with the `command-finished` message.

- [ ] **Step 6: Verify** — `npm run compile` and `npx vitest run` green. `KanbrainViewProvider` has no unit tests, by the same precedent as the rest of the `vscode` glue; this task is covered by the manual checklist instead.

---

### Task 5: Rewrite the read-only promise

**Files:**
- Modify: `src/skills/bootstrapContent.ts` (`USAGE_GUIDE_CONTENT`)
- Modify: `src/skills/buildSkillsAssistantFile.ts`
- Modify: `README.md`

- [ ] **Step 1: Rewrite each of the three, scoped**

In spirit: *"Kanbrain writes exactly one thing to Azure DevOps: the work item's status, when you change it from the panel. Everything else — comments, fields, board configuration — still goes through your own tooling, with the user's confirmation."*

The agent-facing texts must keep telling the agent it is the one that acts for everything else. Do not let them collapse into "Kanbrain writes now".

- [ ] **Step 2: Add the manual checklist lines to the README**

One for changing the status from the main card and seeing it on the real board; one for an invalid transition surfacing the Azure DevOps message instead of failing silently; one for the poll not reverting the choice.

- [ ] **Step 3: Verify** — `npx vitest run` green (`bootstrapContent.test.ts` asserts the guide's presence, not its prose, but re-run to be sure).

---

### Task 6: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry under `## [Unreleased]`**

`### Added` for the status control, `### Changed` for the boundary. Narrative, in the style of the existing entries, and explicit that the read-only promise now has exactly one documented exception.

**No version bump.** Cutting a release is the maintainer's call.

---

## Manual verification (nothing here is covered by tests)

Run in an Extension Development Host (F5) against a real Azure DevOps project:

- [ ] The main card on Flow shows the status as a dropdown; children, Home and search results still show plain text.
- [ ] Changing it writes to the board — confirm in the browser.
- [ ] The panel does not revert the choice on the next 5s poll.
- [ ] An invalid transition shows the Azure DevOps message in a VS Code error notification, and the control returns to the board's real value.
- [ ] A work item whose type is missing from `config.skills` still renders, with the plain status row.

## Commits

One per task, in order. Suggested subjects:

```
feat: let callers override the request Content-Type
feat: add updateWorkItemStatus to the Azure DevOps client
feat: render the status as an editable dropdown on the Flow card
feat: write the chosen status and guard the poll while it is in flight
docs: scope the read-only promise to everything except the status
docs: add changelog entry for changing status from the panel
```

Plus the two `docs:` commits for this plan and its spec, first.

## PR

Title: `Change a work item's status from the panel`
Body opens with `Closes #10`, states that the owner chose option 1 in that issue (Kanbrain writes directly, the three texts change with it), explains the scoped rewrite and why it is not "Kanbrain writes to the board", and flags that projects which already have `USAGE.md` will not receive the new text until #7 is decided.
