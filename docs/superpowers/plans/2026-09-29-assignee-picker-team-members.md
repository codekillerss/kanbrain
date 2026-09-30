# Assignee Picker Team Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before editing anything:** `git branch --show-current` must not say `main`. This continues the branch behind PR #20, `worktree-reenable-assignee-editing`, branched from an up-to-date `main`. Nothing reaches `main` except through a PR the repo owner reviews.

**Goal:** Answer the change request on PR #20 — the assignee picker shows avatars, loads the selected team's members before anything is typed, and always offers the signed-in user. Design: `docs/superpowers/specs/2026-09-29-assignee-picker-team-members-design.md`.

**Architecture:** The picker currently has one source of identities (`searchIdentities`) and no avatars. It gains two more — the selected team's members and the signed-in user — and all three converge on one shape, `IdentitySearchResult` plus an `imageUrl`. Team members arrive from a new client method; the current user comes from widening the profile call that `getCurrentUserId` already makes. Whether the identity-search API returns an avatar at all is unknown, and deliberately not treated as a prerequisite: the search asks for the image and maps it when present, `renderAvatarOrInitial` already falls back to the initial when it is absent, and team members — the common case — carry a reliable `imageUrl` from their own endpoint either way. Ordering, filtering and deduplication live in a pure `mergePickerIdentities`, so the only thing left in `KanbrainViewProvider` is I/O and caching — the same split the repo already uses to keep `vscode` out of the tested surface. Avatars reach the webview as data URIs embedded in pre-rendered HTML, through the existing `avatarCache`, so the sidebar's new CSP is unaffected.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- Every identity that reaches the picker must have a non-empty `uniqueName`. An empty one is how "Unassigned" clears the field, so an identity without one would silently unassign. `searchIdentities` already filters for this; the two new sources must too.
- A missing avatar is a normal case, never an error. Any identity can reach the view with `imageUrl: null` and must render as an initial.
- The status picker is not touched. It shipped in 0.15.0 and was approved as-is.
- `renderIdentityOptions` and `mergePickerIdentities` stay pure — no `vscode` import, tested directly. No `vi.mock('vscode')` anywhere, per the standing rule.
- Team members are fetched once per team and cached. The Reviews N+1 (known debt 5) is the example not to repeat.
- Every task leaves `npm run compile` and `npx vitest run` green.

---

### Task 1: Give every identity an avatar URL

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- `IdentitySearchResult` gains `imageUrl: string | null`

- [ ] **Step 1: Write the failing tests**

In `client.test.ts`, following the existing fake-fetch style: a response carrying an image for one identity and none for another maps `imageUrl` to the value and to `null` respectively; an identity with no `uniqueName` is still dropped, as today.

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/azureDevOps/client.test.ts`

- [ ] **Step 3: Ask for the image and map it when it comes**

Add the image property to the `properties` array `searchIdentities` already sends, and map whatever the response carries into `imageUrl`, defaulting to `null`. Do not build anything on the assumption that it arrives — whether this API populates it is answered by the manual checklist, not by this plan.

- [ ] **Step 4: Verify** — `npx vitest run` green.

---

### Task 2: Read the signed-in user's profile, not just their id

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- `getCurrentUserProfile(): Promise<IdentitySearchResult | null>`
- `getCurrentUserId` keeps its signature and delegates to it

- [ ] **Step 1: Write the failing tests** — the profile response maps to `displayName` and a `uniqueName` taken from the profile's mail address; a profile without one resolves to `null` rather than an identity that would unassign; a failed request still resolves `null`, as `getCurrentUserId` does today.
- [ ] **Step 2: Run and confirm failure.**
- [ ] **Step 3: Implement**, and re-point `getCurrentUserId` at it so the Reviews filters keep working off a single call.
- [ ] **Step 4: Verify** — `npx vitest run` green, including the existing Reviews tests.

---

### Task 3: List a team's members

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- `listTeamMembers(organization: string, project: string, teamId: string): Promise<IdentitySearchResult[]>`

- [ ] **Step 1: Write the failing tests** — asserts the request URL for the team members endpoint, that each member maps to the shared shape including `imageUrl`, that members without a `uniqueName` are dropped, and that a failure propagates rather than silently returning `[]` (the picker needs to know it has no defaults, not pretend the team is empty).
- [ ] **Step 2: Run and confirm failure.**
- [ ] **Step 3: Implement** next to `listTeams`, reusing `mapIdentityRef`'s handling of `imageUrl` / `_links.avatar.href`.
- [ ] **Step 4: Verify** — `npx vitest run` green.

---

### Task 4: Decide the list, in a pure function

**Files:**
- Create: `src/view/mergePickerIdentities.ts`
- Create: `src/view/mergePickerIdentities.test.ts`

**Interfaces:**
- `mergePickerIdentities(currentUser, teamMembers, searchResults, query): IdentitySearchResult[]`

- [ ] **Step 1: Write the failing tests first.** Cover: with an empty query the result is the current user followed by the team members; the current user is not repeated when they are also in the team; a query filters team members case-insensitively on display name and unique name; search results are appended after the team ones; an identity already listed is not repeated, matching on `uniqueName` case-insensitively; and a null current user is simply absent rather than throwing.
- [ ] **Step 2: Run and confirm failure.**
- [ ] **Step 3: Implement.** One exported function named after the file, per the house convention.
- [ ] **Step 4: Verify** — `npx vitest run` green. The test file should end up roughly twice the size of the implementation; if it is much smaller, a case is missing.

---

### Task 5: Render the avatar in each option

**Files:**
- Modify: `src/view/renderIdentityOptions.ts`
- Modify: `src/view/renderIdentityOptions.test.ts`

**Interfaces:**
- `renderIdentityOptions(results, workItemId, avatars: Record<string, string>)`

- [ ] **Step 1: Write the failing tests** — an option renders the avatar before the name, reusing `renderAvatarOrInitial`; an identity whose image is missing from the map falls back to the initial rather than a broken image; the existing `data-action`, `data-id` and `data-unique-name` attributes are unchanged.
- [ ] **Step 2: Run and confirm failure.**
- [ ] **Step 3: Implement**, keeping the function pure.
- [ ] **Step 4: Verify** — `npx vitest run` green.

---

### Task 6: Load the defaults and answer typing

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:** none exported — a widened `assignee-options` message and private helpers.

- [ ] **Step 1: Resolve the team, once** — turn the `selectedTeam` name into a team id via `listTeams`, fetch its members, and cache both per team so reopening the picker costs nothing.
- [ ] **Step 2: Add an avatar resolver for bare URLs** — a sibling of `resolveAvatars` that takes image URLs instead of `WorkItem[]`, sharing `avatarCache`.
- [ ] **Step 3: Fill the menu on open** — when the picker opens, post the merged list for an empty query, so people are offered before anything is typed.
- [ ] **Step 4: Answer each keystroke twice** — first with the local filter over the cached team members, immediately; then, once the debounced identity search returns, with the merged list. A stale response for an older query is discarded, the way the active work item guard already discards stale fetches.
- [ ] **Step 5: Degrade, don't break** — if the team members call fails, the picker still opens with the current user and search, and the failure is surfaced rather than swallowed into an empty-looking team.
- [ ] **Step 6: Verify** — `npm run compile` and `npx vitest run` green. `KanbrainViewProvider` has no unit tests, by the same precedent as the rest of the `vscode` glue; this task is covered by manual verification below.

---

### Task 7: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Fold this into the existing `[Unreleased]` entry** for assignee editing rather than adding a second one — from the reader's side it is one feature, and the entry already on the branch describes a picker that no longer matches what ships.

**No version bump.** Cutting a release is the maintainer's call.

---

## Manual verification (nothing here is covered by tests)

In an Extension Development Host (F5) against a real Azure DevOps project:

- [ ] Opening the picker shows people immediately, without typing: the signed-in user first, then the selected team's members.
- [ ] Team members show real avatars, falling back to the initial only where the person genuinely has no picture.
- [ ] **Whether organization-wide search results carry avatars too.** This is the open question about the identity API, and it is answered here rather than up front: faces mean it populates the image; initials mean it does not, and the fallback is doing its job. Record the answer in the design doc either way.
- [ ] Typing narrows the loaded list instantly, before any network response.
- [ ] Someone outside the team is still reachable by typing their name, and appears below the team's people.
- [ ] Nobody appears twice when they are both in the team and in the search results.
- [ ] Changing the team on the Home screen changes which members the picker offers.
- [ ] Picking any option writes to the board, confirmed in the browser; "Unassigned" clears it.

## Commits

One per task, in order. Suggested subjects:

```
feat: carry an avatar URL on identity search results
feat: read the signed-in user's profile, not just their id
feat: add listTeamMembers to the Azure DevOps client
feat: add mergePickerIdentities to order and dedupe picker options
feat: show an avatar next to every identity option
feat: offer team members and the current user when the picker opens
docs: update the changelog entry for the assignee picker
```

Plus the two `docs:` commits for this plan and its design, first.

## PR

This continues PR #20 rather than opening a new one. The description gains a section answering the review point by point, and naming the one decision taken without asking: typing filters the loaded list and merges organization results below it, deduped, rather than replacing the list — because replacing is the behaviour that was objected to, and filtering alone would drop the ability to assign someone outside the team.
