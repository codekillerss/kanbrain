# Bootstrapping and documenting global skills

## Contexto e motivação

Global skills (`config.globalSkills`, the "▾" menu next to the status skill button) shipped without any onboarding: `Kanbrain: Setup` never seeds one, `Kanbrain: Configure with AI`'s generated instructions never mention the feature exists, and neither `README.md` nor any other doc explains it. A new project run through Setup today has zero global skills and no pointer telling anyone (human or agent) the feature is there.

## Escopo

**Dentro do escopo:**
- One real, useful global skill (`explain-card`) seeded by `Kanbrain: Setup`, and backfilled by `Kanbrain: Sync Board Configuration` if missing — not a blank placeholder.
- A new `.kanbrain/USAGE.md`, written once (Setup, and Sync as a backfill) — the single canonical explanation of both skill kinds and of the Azure DevOps access assumption, referenced instead of duplicated elsewhere.
- A short new section in `Kanbrain: Configure with AI`'s generated content (`buildSetupAssistantFile.ts`) pointing at `USAGE.md`.
- A short new paragraph in `README.md` covering the same, for human readers.

**Fora de escopo:**
- Multiple seeded global skills, or a picker for which ones to seed — just `explain-card`.
- Listing the project's already-configured global skills inside the Configure with AI generated content — that command's job stays "map status → skill file," global skills are a side mention.
- Any change to how global skills run, render, or are edited (already shipped).
- Migrating existing projects automatically on extension upgrade — backfill only happens the next time someone runs Setup or Sync.

## Design

### New module: `src/skills/bootstrapContent.ts`

Holds every piece of static bootstrap content in one place, since `setup.ts` and `syncBoardConfig.ts` both need it:

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

`ensureExplainCardGlobalSkill` is pure and shared: `setup.ts` calls it with `undefined` (Setup always builds `globalSkills` fresh, same as it already does for `skills`); `syncBoardConfig.ts` calls it with the existing `config.globalSkills`, so it only adds the entry when missing and never touches any global skill the user already configured.

### `src/commands/setup.ts`

Import `EXPLAIN_CARD_SKILL_CONTENT`, `EXPLAIN_CARD_SKILL_RELATIVE_PATH`, `USAGE_GUIDE_CONTENT`, `USAGE_GUIDE_RELATIVE_PATH`, `ensureExplainCardGlobalSkill` from `../skills/bootstrapContent`.

Right after the existing `exampleSkillPath` write-if-missing block (lines 118-121):

```ts
const explainCardSkillPath = path.join(workspaceRoot, EXPLAIN_CARD_SKILL_RELATIVE_PATH);
if (!fs.existsSync(explainCardSkillPath)) {
  fs.writeFileSync(explainCardSkillPath, EXPLAIN_CARD_SKILL_CONTENT, 'utf-8');
}

const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
if (!fs.existsSync(usageGuidePath)) {
  fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
}
```

In the `writeConfig({...})` call, add one field: `globalSkills: ensureExplainCardGlobalSkill(undefined),`.

### `src/commands/syncBoardConfig.ts`

Needs `fs`/`path` imports (not currently imported there) plus the same three names from `bootstrapContent`. After `discoverBoardState`/`discoverWorkItemTypes` succeed (so a failed discovery still exits early without writing anything, matching existing behavior), write the two files if missing — same two blocks as in `setup.ts`, verbatim. Then, where `updated` is built:

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

### `src/skills/buildSetupAssistantFile.ts`

New section inserted right after `## Important nuance: status vs. board column` and before `## This project's real configuration`:

```md
## Global skills

Kanbrain also supports skills that aren't tied to any status — \`.kanbrain/config.json\`'s \`globalSkills\` map. They show up as a small "▾" menu next to the status skill button on the active work item's card, and run against whatever work item is active regardless of its status. \`Kanbrain: Setup\`/\`Kanbrain: Sync Board Configuration\` already seed one, \`explain-card\`, that explains the active work item in plain language. See \`.kanbrain/USAGE.md\` for the full guide — including why you (the agent) already have real access to this project's Azure DevOps board data, and can suggest board actions to the user when it makes sense.
```

The numbered `## What to do` steps are unchanged — this command's job stays mapping status → skill file; global skills get a mention, not a workflow.

### `README.md`

New paragraph inserted after the existing `statusColors`/`typeColors`/`cardSettingsByTeam` explanatory paragraph (currently ending "...re-run **Kanbrain: Setup** (or **Kanbrain: Sync Board Configuration**) to pick them up.") and before step 5 of the Setup list:

```md
Setup also seeds one **global skill** — a skill not tied to any status, shown as a small "▾" menu next to the status skill button on the active work item's card (or alone, if the current status has none) — called `explain-card`, which asks the agent to explain the active work item in plain language. Add more of your own via the "+ Add global skill" section on the Config screen, or edit `.kanbrain/config.json`'s `globalSkills` map directly (same `SkillEntry` shape as `skills`, just without a status/type key). Setup (and Sync, if it's missing) also writes `.kanbrain/USAGE.md` — a single reference guide, meant to be read by your coding agent as well as your team, covering both kinds of skills and the fact that Kanbrain runs with the same Azure DevOps access your VS Code session already has.
```

## Testes

`src/skills/bootstrapContent.test.ts` (new):
- `ensureExplainCardGlobalSkill(undefined)` returns an object with only the `explain-card` entry, `path` equal to `EXPLAIN_CARD_SKILL_RELATIVE_PATH`.
- `ensureExplainCardGlobalSkill({ 'other-skill': { path: 'x.md' } })` keeps `other-skill` and adds `explain-card`.
- `ensureExplainCardGlobalSkill({ 'explain-card': { path: 'custom.md', label: 'Custom' } })` returns the input unchanged (by value) — an existing user customization of `explain-card` itself is never clobbered.

`src/skills/buildSetupAssistantFile.test.ts` (extend): one new case — `content` contains `## Global skills`, `globalSkills`, and `.kanbrain/USAGE.md`.

`src/commands/setup.ts` and `src/commands/syncBoardConfig.ts` have no automated test suite today (same as every other VS Code command file in this repo) — covered by manual verification:
- [ ] `Kanbrain: Setup` writes `.kanbrain/skills/explain-card.md` and a `globalSkills.explain-card` entry in `.kanbrain/config.json`.
- [ ] `Kanbrain: Setup` writes `.kanbrain/USAGE.md`.
- [ ] Deleting `.kanbrain/USAGE.md` and `.kanbrain/skills/explain-card.md` (and its config entry), then running `Kanbrain: Sync Board Configuration`, recreates both without touching any other global skill already configured.
- [ ] Running `Kanbrain: Sync Board Configuration` again when both already exist changes neither file nor the config entry.
- [ ] `Kanbrain: Configure with AI`'s generated file contains a "Global skills" section mentioning `.kanbrain/USAGE.md`.

These get added to `README.md`'s existing "Manual verification checklist" section, following its established one-bullet-per-behavior format.
