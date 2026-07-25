# Global Skills Bootstrap and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed a real, useful global skill (`explain-card`) on `Kanbrain: Setup`/`Kanbrain: Sync Board Configuration`, write a single canonical `.kanbrain/USAGE.md` usage guide alongside it, and point both `Kanbrain: Configure with AI`'s generated content and `README.md` at that guide instead of duplicating the explanation.

**Architecture:** One new pure/static content module (`src/skills/bootstrapContent.ts`) holds the skill content, the config-entry builder, and the merge helper that both commands call. `setup.ts` always builds `globalSkills` fresh (matching how it already treats `skills`); `syncBoardConfig.ts` merges the same entry in only if missing, preserving anything the user already configured. `buildSetupAssistantFile.ts` and `README.md` each get a short new section pointing at `.kanbrain/USAGE.md` rather than re-explaining it.

**Tech Stack:** TypeScript, Node `fs`/`path` (VS Code extension host, not browser), Vitest.

## Global Constraints

- `explain-card` is the only global skill seeded — no picker, no other seeded skills. (Spec: "Escopo")
- `.kanbrain/USAGE.md` and `.kanbrain/skills/explain-card.md` are written once — only if the file doesn't already exist — both in `Kanbrain: Setup` and, as a backfill, in `Kanbrain: Sync Board Configuration`. (Spec: "Contexto e motivação", user decision in brainstorming)
- `Kanbrain: Sync Board Configuration` must never overwrite or remove an existing `globalSkills` entry — including a user's own customization of `explain-card` itself — it only adds the entry when the key is absent. (Spec: "Design" — `ensureExplainCardGlobalSkill`)
- `Kanbrain: Configure with AI`'s generated content gets a short mention of global skills, not a workflow — its job stays mapping status → skill file. (Spec: "Escopo")
- No test suite exists for `src/commands/*.ts` today (verified: zero `.test.ts` files under `src/commands/`) — those changes are verified manually via the README checklist, consistent with every other command file in this repo.

---

### Task 1: `bootstrapContent.ts` — skill content, entry builder, merge helper

**Files:**
- Create: `src/skills/bootstrapContent.ts`
- Test: `src/skills/bootstrapContent.test.ts`

**Interfaces:**
- Produces: `EXPLAIN_CARD_SKILL_ID: string`, `EXPLAIN_CARD_SKILL_RELATIVE_PATH: string`, `EXPLAIN_CARD_SKILL_CONTENT: string`, `USAGE_GUIDE_RELATIVE_PATH: string`, `USAGE_GUIDE_CONTENT: string`, `buildExplainCardSkillEntry(): SkillEntry`, `ensureExplainCardGlobalSkill(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry>` — all consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/skills/bootstrapContent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EXPLAIN_CARD_SKILL_ID, EXPLAIN_CARD_SKILL_RELATIVE_PATH, ensureExplainCardGlobalSkill } from './bootstrapContent';
import type { SkillEntry } from '../types';

describe('ensureExplainCardGlobalSkill', () => {
  it('adds the explain-card entry when there is no existing map', () => {
    const result = ensureExplainCardGlobalSkill(undefined);

    expect(Object.keys(result)).toEqual([EXPLAIN_CARD_SKILL_ID]);
    expect(result[EXPLAIN_CARD_SKILL_ID].path).toBe(EXPLAIN_CARD_SKILL_RELATIVE_PATH);
  });

  it('keeps existing entries and adds explain-card when it is missing', () => {
    const existing: Record<string, SkillEntry> = { 'other-skill': { path: 'x.md' } };
    const result = ensureExplainCardGlobalSkill(existing);

    expect(result['other-skill']).toEqual({ path: 'x.md' });
    expect(result[EXPLAIN_CARD_SKILL_ID].path).toBe(EXPLAIN_CARD_SKILL_RELATIVE_PATH);
  });

  it('leaves an existing explain-card entry untouched, including user customizations', () => {
    const existing: Record<string, SkillEntry> = { [EXPLAIN_CARD_SKILL_ID]: { path: 'custom.md', label: 'Custom' } };
    const result = ensureExplainCardGlobalSkill(existing);

    expect(result).toEqual(existing);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- bootstrapContent`
Expected: FAIL — `bootstrapContent.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Create `src/skills/bootstrapContent.ts`**

```ts
import type { SkillEntry } from '../types';
import { pickReadableTextColor } from '../view/badgeColor';

export const EXPLAIN_CARD_SKILL_ID = 'explain-card';
export const EXPLAIN_CARD_SKILL_RELATIVE_PATH = '.kanbrain/skills/explain-card.md';
const EXPLAIN_CARD_BUTTON_COLOR = 'b2b2b2';

export const EXPLAIN_CARD_SKILL_CONTENT = `# Skill: Explain Card

Work item: {{title}} (#{{id}})
Type: {{type}}
Status: {{status}}
Description: {{description}}

Parent: {{parent.title}} (#{{parent.id}})

Subtasks:
{{subtasks}}

## Instructions
Explain this work item to the user in your own words: what it's asking for, why it likely matters given its type/description/parent (if any), and how far along it is based on its status and subtasks (if any). Keep it clear and concise — a short paragraph or a few bullet points, not a restatement of the raw fields above. This is an explanation only — don't take any action on the work item or the Azure DevOps board.
`;

export function buildExplainCardSkillEntry(): SkillEntry {
  return {
    path: EXPLAIN_CARD_SKILL_RELATIVE_PATH,
    label: 'Explain Card',
    buttonColor: EXPLAIN_CARD_BUTTON_COLOR,
    textColor: pickReadableTextColor(`#${EXPLAIN_CARD_BUTTON_COLOR}`).replace(/^#/, ''),
  };
}

export function ensureExplainCardGlobalSkill(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry> {
  if (existing?.[EXPLAIN_CARD_SKILL_ID]) {
    return existing;
  }
  return { ...(existing ?? {}), [EXPLAIN_CARD_SKILL_ID]: buildExplainCardSkillEntry() };
}

export const USAGE_GUIDE_RELATIVE_PATH = '.kanbrain/USAGE.md';

export const USAGE_GUIDE_CONTENT = `# Kanbrain Usage Guide

This file is generated once by \`Kanbrain: Setup\` (and backfilled by \`Kanbrain: Sync Board Configuration\` if it's missing) and is meant to be read by anyone — human or AI agent — working in this workspace who wants to understand how Kanbrain is wired up here.

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item (and its children) in a VS Code side panel. Buttons on that panel generate a context file describing the work item and send a "read this file" command to an agent running in an integrated terminal — that agent is you, if you're reading a file Kanbrain generated.

There are two kinds of skill:

- **Status skills** — \`.kanbrain/config.json\`'s \`skills\` map links one skill file to each (work item type, status) pair. The button shown on the active work item's card always reflects that work item's current status.
- **Global skills** — \`.kanbrain/config.json\`'s \`globalSkills\` map holds skills that aren't tied to any status. They show up as a small "▾" menu next to the status skill button (or alone, if the current status has no skill mapped) — pick one to run it against the active work item regardless of its status. Useful for actions that make sense across the whole flow, like the auto-generated \`explain-card\` skill (explain the current work item in plain language), or a custom one like "estimate Effort for this Backlog item."

Both kinds resolve the same placeholders in the skill file: \`{{id}}\` \`{{title}}\` \`{{description}}\` \`{{status}}\` \`{{type}}\` \`{{url}}\` \`{{branch}}\` \`{{parent.id}}\` \`{{parent.title}}\` \`{{parent.description}}\` \`{{subtasks}}\`.

## Azure DevOps access

Kanbrain authenticates using the same Microsoft account session VS Code already has for this workspace. That means: if you're an agent reading this because a Kanbrain skill button sent you here, you're running in a workspace that already has real, live access to this project's Azure DevOps board — the active work item's real id, title, status, description, parent, and subtasks are already in the context file you were pointed to.

Because of that, feel free to suggest concrete actions on the board to the user when a skill's instructions call for it (e.g. "this looks done, want me to move it to Closed?", or "should I fill in the Effort field with X?"). Kanbrain itself stays strictly read-only — it never writes to Azure DevOps. Any actual change to the board has to go through your own tools/credentials (the Azure DevOps CLI, an MCP server, the REST API, or the web UI), with the user's confirmation — never by editing Kanbrain's own files.

## Where things live

- \`.kanbrain/config.json\` — the shared config: organization/project, \`skills\`, \`globalSkills\`, colors, icons, team settings. Commit this.
- \`.kanbrain/skills/*.md\` — the skill files themselves. Commit these too.
- \`.kanbrain/generated/\` — context files Kanbrain writes each time a skill runs (gitignored, one-off/disposable).

Edit skills directly, or use the Config screen in the Kanbrain panel — both status skills and global skills have a path/label/color editor there.
`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- bootstrapContent`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/skills/bootstrapContent.ts src/skills/bootstrapContent.test.ts
git commit -m "feat: add bootstrap content for the explain-card global skill and USAGE.md"
```

---

### Task 2: `setup.ts` — write the seeded skill, USAGE.md, and globalSkills entry

**Files:**
- Modify: `src/commands/setup.ts`

**Interfaces:**
- Consumes: `EXPLAIN_CARD_SKILL_CONTENT`, `EXPLAIN_CARD_SKILL_RELATIVE_PATH`, `USAGE_GUIDE_CONTENT`, `USAGE_GUIDE_RELATIVE_PATH`, `ensureExplainCardGlobalSkill` (Task 1).

- [ ] **Step 1: Add the import**

In `src/commands/setup.ts`, add to the top import block:

```ts
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
} from '../skills/bootstrapContent';
```

- [ ] **Step 2: Write the two files if missing**

Right after the existing `exampleSkillPath` block:

```ts
    const exampleSkillPath = path.join(skillsDir, 'example.md');
    if (!fs.existsSync(exampleSkillPath)) {
      fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    }

    const explainCardSkillPath = path.join(workspaceRoot, EXPLAIN_CARD_SKILL_RELATIVE_PATH);
    if (!fs.existsSync(explainCardSkillPath)) {
      fs.writeFileSync(explainCardSkillPath, EXPLAIN_CARD_SKILL_CONTENT, 'utf-8');
    }

    const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
    if (!fs.existsSync(usageGuidePath)) {
      fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
    }

    writeConfig(workspaceRoot, {
```

(The `writeConfig(workspaceRoot, {` line already exists — this step only inserts the two new blocks directly above it, changing nothing else there yet.)

- [ ] **Step 3: Add `globalSkills` to the written config**

Inside the same `writeConfig({...})` call, add one field (next to the existing `repositories` field):

```ts
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
      taskBacklogTypesByTeam,
      repositories,
      globalSkills: ensureExplainCardGlobalSkill(undefined),
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 4: Compile**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — no test targets `setup.ts` directly, so this just confirms no regression elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/commands/setup.ts
git commit -m "feat: seed the explain-card global skill and USAGE.md on Kanbrain: Setup"
```

---

### Task 3: `syncBoardConfig.ts` — backfill when missing

**Files:**
- Modify: `src/commands/syncBoardConfig.ts`

**Interfaces:**
- Consumes: same four bootstrap exports as Task 2, plus `ensureExplainCardGlobalSkill` applied to `updated.globalSkills` instead of `undefined`.

- [ ] **Step 1: Add imports**

In `src/commands/syncBoardConfig.ts`, add:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
} from '../skills/bootstrapContent';
```

- [ ] **Step 2: Write the two files if missing, after discovery succeeds**

In `src/commands/syncBoardConfig.ts`, right after the `try { boardState = ...; types = ...; } catch { ...; return; }` block (i.e. once discovery has actually succeeded, so a failed sync still exits without writing anything) and before `const freshStatusColors = ...`:

```ts
    const explainCardSkillPath = path.join(workspaceRoot, EXPLAIN_CARD_SKILL_RELATIVE_PATH);
    if (!fs.existsSync(explainCardSkillPath)) {
      fs.writeFileSync(explainCardSkillPath, EXPLAIN_CARD_SKILL_CONTENT, 'utf-8');
    }

    const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
    if (!fs.existsSync(usageGuidePath)) {
      fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
    }

    const freshStatusColors = discoverStatusColors(types);
```

- [ ] **Step 3: Merge the global skill into the synced config**

Change:

```ts
    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
      freshRepositories,
    );
    writeConfig(workspaceRoot, { ...updated, lastSyncedVersion: extensionVersion });
```

to:

```ts
    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
      freshRepositories,
    );
    writeConfig(workspaceRoot, {
      ...updated,
      globalSkills: ensureExplainCardGlobalSkill(updated.globalSkills),
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 4: Compile**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/syncBoardConfig.ts
git commit -m "feat: backfill the explain-card global skill and USAGE.md on Kanbrain: Sync Board Configuration"
```

---

### Task 4: `buildSetupAssistantFile.ts` — mention global skills to the agent

**Files:**
- Modify: `src/skills/buildSetupAssistantFile.ts`
- Test: `src/skills/buildSetupAssistantFile.test.ts`

**Interfaces:**
- None — pure template string change, no new function signature.

- [ ] **Step 1: Write the failing test**

Add to `src/skills/buildSetupAssistantFile.test.ts`, inside the `describe('buildSetupAssistantContent', ...)` block (after the last existing `it`, before the closing `});`):

```ts
  it('mentions global skills and points to the usage guide', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('## Global skills');
    expect(content).toContain('globalSkills');
    expect(content).toContain('.kanbrain/USAGE.md');
  });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm run test:unit -- buildSetupAssistantFile`
Expected: FAIL — no `## Global skills` heading exists in the generated content yet.

- [ ] **Step 3: Insert the new section**

In `src/skills/buildSetupAssistantFile.ts`, insert a new section between `## Important nuance: status vs. board column`'s paragraph and `## This project's real configuration`:

```ts
## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) per work item type — \`skills\` maps exactly **one skill per status, per work item type**. There is no board-column mode to choose between; board columns aren't a real Kanbrain configuration option, they're listed below purely for your reference. Many teams still think and work in terms of **board columns** rather than raw statuses (common, and often the more natural mental model) — a column can group several statuses together, or have a name that doesn't match any status. When that's the case here, the way to honor it is to point every status that belongs to the same column at the *same* skill file — not to look for a column-level setting that doesn't exist.

## Global skills

Kanbrain also supports skills that aren't tied to any status — \`.kanbrain/config.json\`'s \`globalSkills\` map. They show up as a small "▾" menu next to the status skill button on the active work item's card, and run against whatever work item is active regardless of its status. \`Kanbrain: Setup\`/\`Kanbrain: Sync Board Configuration\` already seed one, \`explain-card\`, that explains the active work item in plain language. See \`.kanbrain/USAGE.md\` for the full guide — including why you (the agent) already have real access to this project's Azure DevOps board data, and can suggest board actions to the user when it makes sense.

## This project's real configuration
```

(Only the text between `## Important nuance...` and `## This project's real configuration` is new — everything else in the template literal stays exactly as it is today.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- buildSetupAssistantFile`
Expected: PASS — the new test plus all pre-existing ones (the "includes all four instructional sections" test uses `toContain`, so an added fifth heading doesn't break it).

- [ ] **Step 5: Compile and run the full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/skills/buildSetupAssistantFile.ts src/skills/buildSetupAssistantFile.test.ts
git commit -m "feat: mention global skills and USAGE.md in the Configure with AI content"
```

---

### Task 5: `README.md` — document global skills for human readers

**Files:**
- Modify: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Insert the new paragraph**

In `README.md`, insert a new paragraph right after the existing paragraph that ends "...re-run **Kanbrain: Setup** (or **Kanbrain: Sync Board Configuration**) to pick them up." and before step 5 ("Run **Kanbrain: Select Work Item** ..."):

```md
   `statusColors` maps each status name to the hex color Azure DevOps assigns it (shown as a small dot next to the status text). `typeColors` colors the right border of each work item card, and `typeIcons` holds the real work item type icon as inline SVG markup shown next to the `#id` — both fetched and sanitized during Setup. `defaultTeam` is the project's actual default team, and `cardSettingsByTeam` holds each team's Parent/AssignedTo card field visibility (keyed by team, then board, then work item type) — the Home screen's Team section lets you pick which team breaks the tie when a type is configured differently across teams. All of this is captured automatically during Setup — projects configured before these fields existed need to re-run **Kanbrain: Setup** (or **Kanbrain: Sync Board Configuration**) to pick them up.

   Setup also seeds one **global skill** — a skill not tied to any status, shown as a small "▾" menu next to the status skill button on the active work item's card (or alone, if the current status has none) — called `explain-card`, which asks the agent to explain the active work item in plain language. Add more of your own via the "+ Add global skill" section on the Config screen, or edit `.kanbrain/config.json`'s `globalSkills` map directly (same `SkillEntry` shape as `skills`, just without a status/type key). Setup (and Sync, if it's missing) also writes `.kanbrain/USAGE.md` — a single reference guide, meant to be read by your coding agent as well as your team, covering both kinds of skills and the fact that Kanbrain runs with the same Azure DevOps access your VS Code session already has.

5. Run **Kanbrain: Select Work Item** to pick which work item shows in the panel. Drag the "Kanbrain" view (from the activity bar) into the secondary sidebar if you want it on the right, like the backoffice flow mode.
```

- [ ] **Step 2: Add manual verification checklist items**

At the end of the "Manual verification checklist" section (after the last existing `- [ ]` line), add:

```md
- [ ] `Kanbrain: Setup` writes `.kanbrain/skills/explain-card.md` and a `globalSkills.explain-card` entry in `.kanbrain/config.json`.
- [ ] `Kanbrain: Setup` writes `.kanbrain/USAGE.md`.
- [ ] Deleting `.kanbrain/USAGE.md` and `.kanbrain/skills/explain-card.md` (and its config entry), then running `Kanbrain: Sync Board Configuration`, recreates both without touching any other global skill already configured.
- [ ] Running `Kanbrain: Sync Board Configuration` again when both already exist changes neither file nor the config entry.
- [ ] `Kanbrain: Configure with AI`'s generated file contains a "Global skills" section mentioning `.kanbrain/USAGE.md`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document global skills and USAGE.md in the README"
```

- [ ] **Step 4: Manual verification (F5)**

Press F5 to launch the Extension Development Host in a fresh (or already-configured, to test the Sync backfill path) workspace. Run `Kanbrain: Setup` end to end and confirm `.kanbrain/skills/explain-card.md`, `.kanbrain/USAGE.md`, and `.kanbrain/config.json`'s `globalSkills.explain-card` entry all exist and read correctly. Delete `.kanbrain/USAGE.md` and `.kanbrain/skills/explain-card.md` (and its config entry), run `Kanbrain: Sync Board Configuration`, and confirm both are recreated without disturbing any other global skill already configured. Run `Kanbrain: Configure with AI` and confirm the generated file has the new "Global skills" section pointing at `.kanbrain/USAGE.md`.

---

## Self-Review Notes

- **Spec coverage:** `explain-card` seeded on Setup (Task 2) ✓; backfilled on Sync without clobbering existing entries (Task 3, `ensureExplainCardGlobalSkill`) ✓; `.kanbrain/USAGE.md` written once by both commands (Task 2, Task 3) ✓; Configure with AI mentions global skills + points to USAGE.md, no workflow change (Task 4) ✓; README documents the same for humans (Task 5) ✓; Azure DevOps access / agent board-suggestion note lives in `USAGE_GUIDE_CONTENT` (Task 1), referenced not duplicated, exactly as decided in brainstorming ✓.
- **Placeholder scan:** no TBD/TODO; every step has literal file content or an exact command.
- **Type consistency:** `ensureExplainCardGlobalSkill(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry>` signature and `EXPLAIN_CARD_SKILL_ID`/`EXPLAIN_CARD_SKILL_RELATIVE_PATH`/`USAGE_GUIDE_RELATIVE_PATH` constants are identical between their Task 1 definition and every consuming call site in Task 2 and Task 3.
