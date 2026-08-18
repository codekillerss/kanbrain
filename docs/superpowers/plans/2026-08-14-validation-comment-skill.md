# Validation Comment Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed a second global skill, `validation-comment`, alongside `explain-card` — written on `Kanbrain: Setup`, backfilled by `Kanbrain: Sync Board Configuration`, and reported as missing by `isBootstrapContentMissing` until a project has it.

**Architecture:** No new patterns. `bootstrapContent.ts` already owns every piece of seeded content (`EXPLAIN_CARD_*`, `USAGE_GUIDE_*`, `DEFAULT_PROFILES`) plus the idempotent `ensure*` helpers that Setup and Sync both call. This adds one more set of constants and one more `ensure*`, and extends `isBootstrapContentMissing`. `setup.ts` and `syncBoardConfig.ts` each gain a copy of the same three-line "write the file if it isn't there" block they already run for `explain-card` and `USAGE.md`.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- The skill content is a markdown document held in a TypeScript template literal. It contains 20 backticks (fenced blocks and inline code) which must be escaped as `` \` ``. It contains no `${` sequences.
- `ensureValidationCommentGlobalSkill` must never overwrite an existing entry — a user who edited the label, colours or path keeps them, exactly like `ensureExplainCardGlobalSkill`.
- The file is only written when absent. Setup and Sync must never overwrite a skill file the user has edited.
- Kanbrain still writes nothing to Azure DevOps. The skill instructs the agent to publish, after explicit approval; nothing in this change touches the client.
- Every task must leave `npm run compile` and `npx vitest run` green.

---

### Task 1: Add the skill content and its bootstrap helpers

**Files:**
- Modify: `src/skills/bootstrapContent.ts`
- Modify: `src/skills/bootstrapContent.test.ts`

**Interfaces:**
- `VALIDATION_COMMENT_SKILL_ID = 'validation-comment'`
- `VALIDATION_COMMENT_SKILL_RELATIVE_PATH = '.kanbrain/skills/validation-comment.md'`
- `VALIDATION_COMMENT_SKILL_CONTENT: string`
- `buildValidationCommentSkillEntry(): SkillEntry`
- `ensureValidationCommentGlobalSkill(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry>`
- `isBootstrapContentMissing` additionally returns `true` when the `validation-comment` entry is absent.

- [ ] **Step 1: Extend the test file first**

Add to `src/skills/bootstrapContent.test.ts` a `describe('ensureValidationCommentGlobalSkill')` mirroring the three `ensureExplainCardGlobalSkill` cases (adds when absent, keeps other entries, leaves a customized entry untouched), and one more case in `describe('isBootstrapContentMissing')`: true when USAGE.md, the explain-card entry and the default profiles are all present but the validation-comment entry is missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/skills/bootstrapContent.test.ts`
Expected: FAIL — `ensureValidationCommentGlobalSkill` is not exported yet.

- [ ] **Step 3: Add the constants, the builder and the ensure helper**

Follow the `EXPLAIN_CARD_*` block exactly, including `pickReadableTextColor` for the text colour. Use a distinct button colour so the two seeded skills are visually distinguishable in the "▾" menu.

- [ ] **Step 4: Extend `isBootstrapContentMissing`**

Add `validationCommentEntryMissing` next to the existing checks and include it in the returned disjunction.

- [ ] **Step 5: Add the USAGE.md sentence**

In `USAGE_GUIDE_CONTENT`, in the paragraph describing global skills, record that a global skill's file can also be referenced from a `skills[type][status]` entry, so a team with a clear validation status gets the button on the card at that status while keeping it available from the "▾" menu.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/skills/bootstrapContent.test.ts` — expected PASS.
Run: `npm run compile` — expected clean.

---

### Task 2: Seed the skill on Setup and Sync

**Files:**
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/syncBoardConfig.ts`

**Interfaces:** none new — both commands already import from `bootstrapContent` and both already write `explain-card` and `USAGE.md` when absent.

- [ ] **Step 1: Setup writes the file and seeds the entry**

Next to the existing `explainCardSkillPath` block, write `VALIDATION_COMMENT_SKILL_CONTENT` to `VALIDATION_COMMENT_SKILL_RELATIVE_PATH` when the file does not exist. In the `writeConfig` call, wrap `globalSkills` with `ensureValidationCommentGlobalSkill(...)` around the existing `ensureExplainCardGlobalSkill(undefined)`.

- [ ] **Step 2: Sync backfills the same way**

Mirror both changes in `syncBoardConfig.ts`: the file-write block next to the existing one, and `ensureValidationCommentGlobalSkill` composed around `ensureExplainCardGlobalSkill(updated.globalSkills)` in `writeConfig`.

- [ ] **Step 3: Verify**

Run: `npm run compile` and `npx vitest run` — both expected green.

These two files have no unit tests, by the same precedent as the rest of `commands/` — they are `vscode`/`fs` glue, and the substance lives in `bootstrapContent`, which is tested. Verified by hand through the README checklist instead.

---

### Task 3: Widen the sync/check summary

**Files:**
- Modify: `src/azureDevOps/checkBoardConfig.ts`
- Modify: `src/azureDevOps/checkBoardConfig.test.ts`

Surfaced while verifying Task 2 against a real project: `summarizeDiff` enumerated what could be
missing — `'missing global skill setup (explain-card skill / USAGE.md)'` — so once a second skill
is seeded, a missing `validation-comment` is reported as a missing `explain-card`. The message was
already incomplete before this change, since `isBootstrapContentMissing` has also covered the
default profiles since 0.7.5 without the message ever saying so.

- [ ] **Step 1: Replace the enumeration with a phrasing that will not rot**

`'missing seeded content (global skills, USAGE.md, or default profiles)'`.

- [ ] **Step 2: Update the assertion that pinned the old wording**

`checkBoardConfig.test.ts` asserts `toContain('global skill setup')`; the test's stated intent is
that the summary mentions the missing bootstrap content, so assert on the new phrasing instead.

- [ ] **Step 3: Verify**

Run: `npx vitest run` — expected green.

---

### Task 4: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry under `## [Unreleased]`**

`### Added`, narrative in the style of the existing entries: what the skill does, that it is seeded on Setup and backfilled by Sync, that it is global and why, and that Kanbrain still never writes to Azure DevOps — the agent publishes, after approval.

**No version bump.** Cutting a release is the maintainer's call, and the entry sits under
`[Unreleased]` so the number stays theirs to choose. The sync-summary change in Task 3 gets no
`### Fixed` entry of its own: the message only became wrong because of this same unreleased
change, so it is covered by the `### Added` entry.

- [ ] **Step 2: Full verification**

Run: `npm run compile`, `npx vitest run`, and the integration suite from a terminal outside VS
Code. Then exercise Setup and Sync against a real Azure DevOps project: Setup seeds both entries
and writes the file; deleting the file and the entry and running Sync restores both while leaving
`explain-card` untouched; running Sync again reports "already up to date".

---

### Task 5: Seed global skills from a table instead of chaining ensure helpers

**Files:**
- Modify: `src/skills/bootstrapContent.ts`
- Modify: `src/skills/bootstrapContent.test.ts`
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/syncBoardConfig.ts`

Task 2 left both call sites composing the two helpers by nesting —
`ensureValidationCommentGlobalSkill(ensureExplainCardGlobalSkill(...))`. That reads as if one skill
wrapped the other when they are siblings, duplicated the composition across two commands, and would
grow a level per future skill. It is also not how this repo aggregates seeded things: `DEFAULT_PROFILES`
and `migrations` are both a table plus a loop.

**Interfaces:**
- `ensureSeededGlobalSkills(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry>`,
  driven by a private `SEEDED_GLOBAL_SKILLS` table — mirroring `ensureDefaultProfiles`.
- `ensureExplainCardGlobalSkill` and `ensureValidationCommentGlobalSkill` are removed: the table makes
  them dead, and leaving two ways to do one thing is worse than deleting one pre-existing export. Their
  behaviour (never overwrite a customized entry) moves to the new helper's tests.

- [ ] **Step 1: Rewrite the tests first**

Replace both `describe` blocks with one for `ensureSeededGlobalSkills`: seeds both from `undefined`,
keeps a custom non-seeded skill, leaves a customized seeded entry untouched while adding the missing
one, and changes nothing when both are already present.

- [ ] **Step 2: Add the table and the helper, remove the two individual ones**

- [ ] **Step 3: Simplify `isBootstrapContentMissing`**

Two per-skill checks collapse into `Object.keys(SEEDED_GLOBAL_SKILLS).some(...)`, mirroring the
`defaultProfilesMissing` line. A future seeded skill needs no edit here at all.

- [ ] **Step 4: Collapse both call sites to a single call**

- [ ] **Step 5: Verify**

`npm run compile` and `npx vitest run` green, and the Setup/Sync behaviour unchanged end to end.

