# Team Profiles (Requester Persona) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each teammate pick a personal "profile" (e.g. Developer, QA) from a team-shared list, and have that profile's description automatically prepended to every generated skill context file, so the agent reading it knows who is asking.

**Architecture:** `profiles` (a map of id → `{ label, description }`) is added to the shared `.kanbrain/config.json`, with two defaults (`developer`, `qa`) backfilled idempotently by both `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` — mirroring the existing `explain-card`/`USAGE.md` bootstrap pattern. Which profile is "mine" is a new `selectedProfileId` field that lives in the existing machine-local `.kanbrain/config.local.json` overlay (same mechanism already used for `repositories[].path`/`showAssignedTo`), picked from a new dropdown on the Home screen (same visual pattern as the Team dropdown). `KanbrainViewProvider.executeSkill` — the single choke point already shared by status skills and global skills — resolves the active profile and passes it into `generateContextFile`, which prepends a `## Requester profile` block to the generated file when one is selected.

**Tech Stack:** TypeScript, VS Code Extension API, vitest.

Full design: `docs/superpowers/specs/2026-07-27-team-profiles-design.md`.

## Global Constraints

- `profiles` is a map keyed by stable id (`Record<string, ProfileEntry>`), not an array — matches `globalSkills`/`repositories`.
- Each profile is exactly `{ label, description }` — no structured fields (competencies, seniority, etc.), `description` is free text.
- Default profiles are exactly `developer` ("Desenvolvedor") and `qa` ("QA") — content given verbatim in Task 3.
- Backfill of default profiles is idempotent: never overwrites an existing entry (customized or not), only adds ids that are missing.
- No interactive prompt anywhere ("which is your profile?") — neither `Setup` nor `Sync` ask; selection only ever happens via the Home dropdown.
- The profile block is injected automatically into every generated skill file (status and global) when a profile is selected — not an opt-in `{{profile}}` placeholder.
- Profile block format is exactly: `` `## Requester profile\n**{label}** — {description}\n\n---\n\n{rest of content}` ``.
- All local/stale-reference failures (no profile selected, selected id no longer exists) are silent — no error popups, just omit the block / fall back to unselected.
- Follow TDD: write the failing test, watch it fail, write minimal code, watch it pass, commit — for every task that has a pure/testable unit.

---

### Task 1: Config schema — `profiles` and `selectedProfileId`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Produces: `ProfileEntry { label: string; description: string }` (exported from `src/types.ts`)
- Produces: `KanbrainConfig.profiles?: Record<string, ProfileEntry>` (shared, written straight to `config.json` like `skills`/`globalSkills`)
- Produces: `KanbrainConfig.selectedProfileId?: string` (machine-local, overlaid from `config.local.json` like `showAssignedTo`)

- [ ] **Step 1: Write the failing tests**

Add to `src/config/config.test.ts`, inside `describe('machine-local config split', ...)` (after the existing `showAssignedTo`/`repositories` tests, using the same `baseConfig` already defined in that block):

```ts
  it('writes selectedProfileId to config.local.json, not config.json', () => {
    writeConfig(workspaceRoot, { ...baseConfig, selectedProfileId: 'developer' });

    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.selectedProfileId).toBeUndefined();

    const localRaw = JSON.parse(fs.readFileSync(getConfigLocalPath(workspaceRoot), 'utf-8'));
    expect(localRaw).toEqual({ selectedProfileId: 'developer' });
  });

  it('round-trips selectedProfileId through readConfig', () => {
    const config = { ...baseConfig, selectedProfileId: 'qa' };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
```

Add a new top-level `describe` block (after `describe('machine-local config split', ...)`) for the shared `profiles` field:

```ts
describe('profiles (shared field)', () => {
  it('round-trips profiles through readConfig, written to config.json not config.local.json', () => {
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      defaultTeam: 'MyProject Team',
      skills: {},
      statusColors: {},
      typeColors: {},
      typeIcons: {},
      profiles: { developer: { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' } },
    };
    writeConfig(workspaceRoot, config);

    expect(readConfig(workspaceRoot)).toEqual(config);
    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.profiles).toEqual({ developer: { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/config.test.ts`
Expected: the three new tests FAIL — the `selectedProfileId` ones because it's still written inline into `config.json` (not split into `config.local.json`, so `sharedRaw.selectedProfileId` is not `undefined` / `localRaw` doesn't equal `{ selectedProfileId: ... }`), and TypeScript would otherwise reject `selectedProfileId`/`profiles` as unknown properties — but since vitest transpiles without full type-checking, the failure will show as the assertion failures described above, not a compile error.

- [ ] **Step 3: Add the types**

In `src/types.ts`, add a new interface right before `export interface KanbrainConfig {`:

```ts
export interface ProfileEntry {
  label: string;
  description: string;
}

```

Then add these two fields at the end of `KanbrainConfig` (after `repoScanDepth?: number;`):

```ts
  profiles?: Record<string, ProfileEntry>;
  selectedProfileId?: string;
```

- [ ] **Step 4: Wire `selectedProfileId` through the local overlay**

In `src/config/config.ts`:

Extend `LocalConfig`:

```ts
interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
  selectedProfileId?: string;
}
```

Extend `extractLocalFields`:

```ts
function extractLocalFields(config: KanbrainConfig): LocalConfig {
  const local: LocalConfig = {};
  if (config.repositories !== undefined) {
    local.repositories = config.repositories;
  }
  if (config.showAssignedTo !== undefined) {
    local.showAssignedTo = config.showAssignedTo;
  }
  if (config.selectedProfileId !== undefined) {
    local.selectedProfileId = config.selectedProfileId;
  }
  return local;
}
```

Extend `applyLocalOverlay`:

```ts
function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
  const local = readLocalConfig(workspaceRoot);
  const result = { ...config };
  if ('repositories' in local) {
    result.repositories = local.repositories;
  }
  if ('showAssignedTo' in local) {
    result.showAssignedTo = local.showAssignedTo;
  }
  if ('selectedProfileId' in local) {
    result.selectedProfileId = local.selectedProfileId;
  }
  return result;
}
```

Extend the destructure in `writeConfig` so `selectedProfileId` is pulled out of the shared file too:

```ts
  const { repositories, showAssignedTo, selectedProfileId, ...shared } = config;
```

(`profiles` is *not* added to this destructure — it's a shared field and stays in `shared`, written straight into `config.json` like `skills`/`globalSkills` already are.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/config/config.ts src/config/config.test.ts
git commit -m "feat: add profiles and selectedProfileId to config schema"
```

---

### Task 2: `resolveActiveProfile`

**Files:**
- Create: `src/config/resolveActiveProfile.ts`
- Test: `src/config/resolveActiveProfile.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.profiles`, `KanbrainConfig.selectedProfileId` (from Task 1)
- Produces: `resolveActiveProfile(config: KanbrainConfig): ProfileEntry | null`

- [ ] **Step 1: Write the failing test**

Create `src/config/resolveActiveProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveActiveProfile } from './resolveActiveProfile';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('resolveActiveProfile', () => {
  it('returns null when no profile is selected', () => {
    expect(resolveActiveProfile(config())).toBeNull();
  });

  it('returns the matching profile entry when selectedProfileId resolves', () => {
    const result = resolveActiveProfile(
      config({
        profiles: { developer: { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' } },
        selectedProfileId: 'developer',
      }),
    );
    expect(result).toEqual({ label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' });
  });

  it('returns null when selectedProfileId does not match any entry in profiles', () => {
    const result = resolveActiveProfile(
      config({
        profiles: { developer: { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' } },
        selectedProfileId: 'removed-profile',
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when selectedProfileId is set but profiles is undefined', () => {
    expect(resolveActiveProfile(config({ selectedProfileId: 'developer' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/resolveActiveProfile.test.ts`
Expected: FAIL with a module-not-found error for `./resolveActiveProfile`.

- [ ] **Step 3: Write the implementation**

Create `src/config/resolveActiveProfile.ts`:

```ts
import type { KanbrainConfig, ProfileEntry } from '../types';

export function resolveActiveProfile(config: KanbrainConfig): ProfileEntry | null {
  if (!config.selectedProfileId) {
    return null;
  }
  return config.profiles?.[config.selectedProfileId] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/resolveActiveProfile.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config/resolveActiveProfile.ts src/config/resolveActiveProfile.test.ts
git commit -m "feat: add resolveActiveProfile"
```

---

### Task 3: Default profiles and bootstrap backfill

**Files:**
- Modify: `src/skills/bootstrapContent.ts`
- Test: `src/skills/bootstrapContent.test.ts`

**Interfaces:**
- Consumes: `ProfileEntry` (from Task 1)
- Produces: `DEFAULT_PROFILES: Record<string, ProfileEntry>`
- Produces: `ensureDefaultProfiles(existing: Record<string, ProfileEntry> | undefined): Record<string, ProfileEntry>`
- Modifies: `isBootstrapContentMissing(workspaceRoot, config)` to also account for missing default profiles

- [ ] **Step 1: Write the failing tests**

Add to `src/skills/bootstrapContent.test.ts`. First, extend the imports at the top of the file:

```ts
import {
  EXPLAIN_CARD_SKILL_ID,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  isBootstrapContentMissing,
  DEFAULT_PROFILES,
  ensureDefaultProfiles,
} from './bootstrapContent';
import type { KanbrainConfig, SkillEntry, ProfileEntry } from '../types';
```

Add a new `describe` block (after the `ensureExplainCardGlobalSkill` block):

```ts
describe('ensureDefaultProfiles', () => {
  it('creates developer and qa when there is no existing map', () => {
    const result = ensureDefaultProfiles(undefined);
    expect(result).toEqual(DEFAULT_PROFILES);
  });

  it('preserves a customized default entry and adds only the missing one', () => {
    const existing: Record<string, ProfileEntry> = { developer: { label: 'Dev Custom', description: 'Customized.' } };
    const result = ensureDefaultProfiles(existing);

    expect(result.developer).toEqual({ label: 'Dev Custom', description: 'Customized.' });
    expect(result.qa).toEqual(DEFAULT_PROFILES.qa);
  });

  it('keeps a custom, non-default profile untouched', () => {
    const existing: Record<string, ProfileEntry> = {
      ...DEFAULT_PROFILES,
      designer: { label: 'Designer', description: 'Sou um designer.' },
    };
    const result = ensureDefaultProfiles(existing);
    expect(result.designer).toEqual({ label: 'Designer', description: 'Sou um designer.' });
  });

  it('changes nothing when both defaults are already present', () => {
    const result = ensureDefaultProfiles({ ...DEFAULT_PROFILES });
    expect(result).toEqual(DEFAULT_PROFILES);
  });
});
```

Now update the local `config` helper in the `isBootstrapContentMissing` describe block to accept a `profiles` override, and add new test cases. Replace the existing `config` helper function:

```ts
function config(globalSkills?: Record<string, SkillEntry>, profiles?: Record<string, ProfileEntry>): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    globalSkills,
    profiles,
  };
}
```

Update the existing "is false once both USAGE.md exists and the explain-card entry is configured" test to also provide default profiles (since that test now needs all three bootstrap conditions satisfied to stay false):

```ts
  it('is false once USAGE.md exists, the explain-card entry, and the default profiles are all configured', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withEntry = config(ensureExplainCardGlobalSkill(undefined), ensureDefaultProfiles(undefined));

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(false);
  });
```

(This replaces the old "is false once both USAGE.md exists and the explain-card entry is configured" test — same scenario, now also seeding `profiles`.)

Add one more case:

```ts
  it('is true when USAGE.md and the explain-card entry are present but a default profile is missing', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withPartialProfiles = config(ensureExplainCardGlobalSkill(undefined), { developer: DEFAULT_PROFILES.developer });

    expect(isBootstrapContentMissing(workspaceRoot, withPartialProfiles)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/skills/bootstrapContent.test.ts`
Expected: FAIL — `ensureDefaultProfiles`/`DEFAULT_PROFILES` don't exist yet (module has no such exports), and the two `isBootstrapContentMissing` cases fail because it doesn't check profiles yet.

- [ ] **Step 3: Write the implementation**

In `src/skills/bootstrapContent.ts`, add the import for `ProfileEntry` to the existing type import line:

```ts
import type { KanbrainConfig, SkillEntry, ProfileEntry } from '../types';
```

Add, after `ensureExplainCardGlobalSkill` and before `USAGE_GUIDE_RELATIVE_PATH`:

```ts
export const DEFAULT_PROFILES: Record<string, ProfileEntry> = {
  developer: {
    label: 'Desenvolvedor',
    description:
      'Sou um desenvolvedor de software. Foco em qualidade de código, testes automatizados e arquitetura. ' +
      'Priorize instruções técnicas claras, com contexto de código e trade-offs de implementação.',
  },
  qa: {
    label: 'QA',
    description: 'Sou responsável por qualidade e testes. Priorize cenários de teste, casos de borda e critérios de aceite claros.',
  },
};

export function ensureDefaultProfiles(existing: Record<string, ProfileEntry> | undefined): Record<string, ProfileEntry> {
  const merged = { ...(existing ?? {}) };
  for (const [id, entry] of Object.entries(DEFAULT_PROFILES)) {
    if (!(id in merged)) {
      merged[id] = entry;
    }
  }
  return merged;
}
```

Update `isBootstrapContentMissing` at the bottom of the file:

```ts
export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const explainCardEntryMissing = !config.globalSkills?.[EXPLAIN_CARD_SKILL_ID];
  const defaultProfilesMissing = Object.keys(DEFAULT_PROFILES).some(id => !config.profiles?.[id]);
  return usageGuideMissing || explainCardEntryMissing || defaultProfilesMissing;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/skills/bootstrapContent.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/skills/bootstrapContent.ts src/skills/bootstrapContent.test.ts
git commit -m "feat: add default profiles (developer, qa) with idempotent backfill"
```

---

### Task 4: `syncConfig` preserves `profiles` and `selectedProfileId`

`syncConfig` rebuilds a fresh `KanbrainConfig` object field-by-field on every sync. It already explicitly carries `globalSkills`/`showAssignedTo` through unchanged (they're not derived from the Azure DevOps discovery calls) — `profiles`/`selectedProfileId` need the same treatment, otherwise a sync would silently wipe out any profile a team had customized or any teammate's local selection.

**Files:**
- Modify: `src/config/syncConfig.ts`
- Test: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.profiles`, `KanbrainConfig.selectedProfileId` (from Task 1)

- [ ] **Step 1: Write the failing tests**

Add to `src/config/syncConfig.test.ts`, in the main `describe('syncConfig', ...)` block (after the existing `globalSkills` tests):

```ts
  it('preserves profiles unchanged across a sync', () => {
    const withProfiles = config({ profiles: { developer: { label: 'Desenvolvedor', description: 'Custom.' } } });
    const result = syncConfig(withProfiles, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.profiles).toEqual({ developer: { label: 'Desenvolvedor', description: 'Custom.' } });
  });

  it('leaves profiles undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.profiles).toBeUndefined();
  });

  it('preserves selectedProfileId across a sync', () => {
    const result = syncConfig(config({ selectedProfileId: 'qa' }), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.selectedProfileId).toBe('qa');
  });

  it('leaves selectedProfileId undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.selectedProfileId).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: FAIL — `result.profiles`/`result.selectedProfileId` are both `undefined` in every case, including the "preserves ... unchanged" ones where a value was set on the input.

- [ ] **Step 3: Write the implementation**

In `src/config/syncConfig.ts`, add two lines to the object literal returned by `syncConfig` (alongside the existing `globalSkills: config.globalSkills,` and `showAssignedTo: config.showAssignedTo,` lines):

```ts
    globalSkills: config.globalSkills,
    profiles: config.profiles,
    selectedProfileId: config.selectedProfileId,
    repoScanDepth: config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/config/syncConfig.ts src/config/syncConfig.test.ts
git commit -m "fix: preserve profiles and selectedProfileId across syncConfig"
```

---

### Task 5: Wire the backfill into `Setup` and `Sync Board Configuration`

No dedicated automated test — `setup.ts`/`syncBoardConfig.ts` are VS Code command registrations with no existing unit tests (same precedent as the rest of the command layer in this codebase); correctness here is verified by the full test suite staying green, `tsc` staying clean, and a manual F5 check.

**Files:**
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/syncBoardConfig.ts`

**Interfaces:**
- Consumes: `ensureDefaultProfiles` (from Task 3)

- [ ] **Step 1: Wire it into `setup.ts`**

In `src/commands/setup.ts`, add `ensureDefaultProfiles` to the existing `bootstrapContent` import:

```ts
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  ensureDefaultProfiles,
} from '../skills/bootstrapContent';
```

In the `writeConfig(...)` call, add a `profiles` field (alongside the existing `globalSkills: ensureExplainCardGlobalSkill(undefined),` line):

```ts
      globalSkills: ensureExplainCardGlobalSkill(undefined),
      profiles: ensureDefaultProfiles(undefined),
```

- [ ] **Step 2: Wire it into `syncBoardConfig.ts`**

In `src/commands/syncBoardConfig.ts`, add `ensureDefaultProfiles` to the existing `bootstrapContent` import:

```ts
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  ensureDefaultProfiles,
  isBootstrapContentMissing,
} from '../skills/bootstrapContent';
```

In the `writeConfig(...)` call, add a `profiles` field (alongside the existing `globalSkills: ensureExplainCardGlobalSkill(updated.globalSkills),` line):

```ts
    writeConfig(workspaceRoot, {
      ...updated,
      globalSkills: ensureExplainCardGlobalSkill(updated.globalSkills),
      profiles: ensureDefaultProfiles(updated.profiles),
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all tests (no test file directly covers these two files, but this confirms nothing else broke).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts src/commands/syncBoardConfig.ts
git commit -m "feat: backfill default profiles from Setup and Sync Board Configuration"
```

---

### Task 6: Inject the profile block into generated skill content

**Files:**
- Modify: `src/skills/generateContextFile.ts`
- Modify: `src/view/KanbrainViewProvider.ts:492-497` (the one existing call site)
- Test: `src/skills/generateContextFile.test.ts`

**Interfaces:**
- Consumes: `ProfileEntry` (from Task 1)
- Produces: `generateContextFile(workspaceRoot: string, skillTemplatePath: string, context: SkillTemplateContext, profile: ProfileEntry | null, now?: Date): string` (new required 4th parameter, inserted before the existing `now` parameter)

- [ ] **Step 1: Update the existing tests for the new signature, and add profile-block tests**

In `src/skills/generateContextFile.test.ts`, add the `ProfileEntry` type to the existing type import:

```ts
import type { WorkItem, ProfileEntry } from '../types';
```

Update the 3 existing calls to `generateContextFile` to pass `null` as the new 4th argument (profile), keeping `new Date(...)` as the 5th:

```ts
describe('generateContextFile', () => {
  it('writes the resolved template under .kanbrain/generated', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(relativePath.startsWith(path.join('.kanbrain', 'generated'))).toBe(true);
    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).toBe('Title: Fix bug (#482)');
  });

  it('names the file with the work item id and a filesystem-safe timestamp', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(path.basename(relativePath)).toBe('482-2026-07-14T10-00-00-000Z.md');
  });

  it('creates the .kanbrain/generated directory if it does not exist', () => {
    generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain', 'generated'))).toBe(true);
  });

  it('prepends a Requester profile block when a profile is given', () => {
    const profile: ProfileEntry = { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' };
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, profile, new Date('2026-07-14T10:00:00.000Z'));

    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).toBe('## Requester profile\n**Desenvolvedor** — Sou um desenvolvedor.\n\n---\n\nTitle: Fix bug (#482)');
  });

  it('does not add a Requester profile block when profile is null', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).not.toContain('Requester profile');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/skills/generateContextFile.test.ts`
Expected: FAIL — too many arguments passed to `generateContextFile` (current signature only takes 4 params total, `now` being the 4th), so the 5-argument calls mis-align (`null` lands where `now` used to be, `new Date(...)` becomes a 5th unused argument), and the two new profile-block tests fail because the content has no such block yet.

- [ ] **Step 3: Write the implementation**

In `src/skills/generateContextFile.ts`, add the `ProfileEntry` type to the existing import from `'../types'` — there currently is no such import in this file, so add it:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import { writeGeneratedFile } from './writeGeneratedFile';
import type { ProfileEntry } from '../types';

function prependProfileBlock(content: string, profile: ProfileEntry | null): string {
  if (!profile) {
    return content;
  }
  return `## Requester profile\n**${profile.label}** — ${profile.description}\n\n---\n\n${content}`;
}

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  profile: ProfileEntry | null,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);
  const withProfile = prependProfileBlock(resolved, profile);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;

  return writeGeneratedFile(workspaceRoot, fileName, withProfile);
}
```

- [ ] **Step 4: Update the one production call site so the build keeps compiling**

In `src/view/KanbrainViewProvider.ts`, the `executeSkill` method currently calls (around line 492):

```ts
    const relativePath = generateContextFile(this.workspaceRoot, skill.path, {
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });
```

Change it to pass `null` as the profile for now (Task 8 replaces this literal with the real resolved profile):

```ts
    const relativePath = generateContextFile(
      this.workspaceRoot,
      skill.path,
      { workItem, parent: parent ?? null, subtasks, branch },
      null,
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/skills/generateContextFile.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Typecheck and full suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add src/skills/generateContextFile.ts src/skills/generateContextFile.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: prepend Requester profile block to generated skill content"
```

---

### Task 7: Profile dropdown on the Home screen

**Files:**
- Modify: `src/view/renderHome.ts`
- Test: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.profiles`, `KanbrainConfig.selectedProfileId` (from Task 1)
- Produces: DOM element `<select id="kb-profile-select">` with `<option value="">` for "no selection" plus one `<option value="{id}">{label}</option>` per entry in `config.profiles` — consumed by Task 8's webview listener.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderHome.test.ts` (after the existing Team-section tests, before the closing `});` of the `describe('renderHome', ...)` block):

```ts
  it('does not show a Profile section when there are 0 profiles configured', () => {
    const html = renderHome(state());
    expect(html).not.toContain('id="kb-profile-select"');
  });

  it('shows a Profile section with a "None" option plus one option per profile', () => {
    const html = renderHome(
      state({
        config: config({
          profiles: {
            developer: { label: 'Desenvolvedor', description: 'Sou um desenvolvedor.' },
            qa: { label: 'QA', description: 'Sou responsável por qualidade.' },
          },
        }),
      }),
    );

    expect(html).toContain('id="kb-profile-select"');
    expect(html).toContain('<option value="">');
    expect(html).toContain('<option value="developer"');
    expect(html).toContain('>Desenvolvedor<');
    expect(html).toContain('<option value="qa"');
    expect(html).toContain('>QA<');
  });

  it('marks the "None" option as selected when no profile is selected', () => {
    const html = renderHome(
      state({ config: config({ profiles: { developer: { label: 'Desenvolvedor', description: 'x' } } }) }),
    );
    expect(html).toMatch(/<option value="" selected>/);
  });

  it('marks the matching profile option as selected when selectedProfileId is set', () => {
    const html = renderHome(
      state({
        config: config({
          profiles: {
            developer: { label: 'Desenvolvedor', description: 'x' },
            qa: { label: 'QA', description: 'y' },
          },
          selectedProfileId: 'qa',
        }),
      }),
    );
    expect(html).toMatch(/<option value="qa" selected>/);
  });

  it('escapes HTML in a profile label', () => {
    const html = renderHome(
      state({ config: config({ profiles: { developer: { label: 'Dev <script>', description: 'x' } } }) }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('Dev &lt;script&gt;');
  });

  it('places the Profile section after the Team section', () => {
    const html = renderHome(
      state({
        config: config({
          cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } } },
          profiles: { developer: { label: 'Desenvolvedor', description: 'x' } },
        }),
      }),
    );

    const teamIndex = html.indexOf('>Team<');
    const profileIndex = html.indexOf('>Profile<');
    expect(teamIndex).toBeGreaterThanOrEqual(0);
    expect(profileIndex).toBeGreaterThan(teamIndex);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: FAIL — none of the new assertions find any `kb-profile-select`/`>Profile<` content, since `renderHome` doesn't render it yet.

- [ ] **Step 3: Write the implementation**

In `src/view/renderHome.ts`, add a new function after `renderHomeTeamSection`:

```ts
function renderHomeProfileSection(state: RenderState): string {
  const config = state.config!;
  const profileIds = Object.keys(config.profiles ?? {});
  if (profileIds.length === 0) {
    return '';
  }
  const selected = config.selectedProfileId ?? '';

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Profile</div>
      <div class="kb-team-card">
        <select id="kb-profile-select">
          <option value=""${selected === '' ? ' selected' : ''}>— None —</option>
          ${profileIds
            .map(id => `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>${escapeHtml(config.profiles![id].label)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  `;
}
```

Then call it in `renderHome`, right after `renderHomeTeamSection`:

```ts
export function renderHome(state: RenderState): string {
  return `
    <div class="kb-section-card">
      <div class="kb-section-label">
        <span>Flow</span>
        ${renderHomeFlowActions(state)}
      </div>
      ${renderHomeWorkItemSection(state)}
    </div>
    ${renderHomeTeamSection(state)}
    ${renderHomeProfileSection(state)}
    <div class="kb-section-card">
```

(keep the rest of the function body — Commands/Configuration/Repositories sections — unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "feat: add Profile dropdown to the Home screen"
```

---

### Task 8: Wire the dropdown to `config.local.json`, and the real profile into `executeSkill`

No dedicated automated test — this is VS Code webview message-handling glue (same precedent as `setSelectedTeam`/`setShowAssignedTo`, neither of which has a unit test). Verified by the full suite staying green, `tsc` staying clean, and a manual F5 check (change the dropdown, confirm `.kanbrain/config.local.json` updates; run a skill with a profile selected, confirm the generated file under `.kanbrain/generated/` has the `## Requester profile` block).

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `resolveActiveProfile` (from Task 2), `readConfig`/`writeConfig` (existing), `#kb-profile-select` DOM id (from Task 7)

- [ ] **Step 1: Import `resolveActiveProfile`**

In `src/view/KanbrainViewProvider.ts`, add to the existing imports:

```ts
import { resolveSkill } from '../config/resolveSkill';
import { resolveActiveProfile } from '../config/resolveActiveProfile';
```

- [ ] **Step 2: Resolve and pass the real profile in `executeSkill`**

Replace the `generateContextFile` call from Task 6 (currently passing a literal `null`):

```ts
    const relativePath = generateContextFile(
      this.workspaceRoot,
      skill.path,
      { workItem, parent: parent ?? null, subtasks, branch },
      null,
    );
```

with:

```ts
    const profile = resolveActiveProfile(config);
    const relativePath = generateContextFile(
      this.workspaceRoot,
      skill.path,
      { workItem, parent: parent ?? null, subtasks, branch },
      profile,
    );
```

- [ ] **Step 3: Add the message handler**

In the `onDidReceiveMessage` handler, add a new branch right after the existing `set-selected-team` one:

```ts
      } else if (message.type === 'set-selected-team') {
        this.setSelectedTeam(message.team || undefined);
      } else if (message.type === 'set-selected-profile') {
        this.setSelectedProfile(message.profileId || undefined);
      } else if (message.type === 'show-repositories') {
```

- [ ] **Step 4: Add the `setSelectedProfile` method**

Add a new method right after `setSelectedTeam`:

```ts
  setSelectedTeam(team: string | undefined): void {
    this.selectedTeam = team;
    this.persistSelectedTeam(team);
    this.lastState = '';
    void this.refresh();
  }

  private setSelectedProfile(profileId: string | undefined): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.selectedProfileId = profileId;
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 5: Add the webview listener**

In the injected webview `<script>` (the same block that wires up `kb-team-select`), add a listener right after the `teamSelect` block:

```ts
    const teamSelect = document.getElementById('kb-team-select');
    if (teamSelect) {
      teamSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-team', team: teamSelect.value });
      });
    }

    const profileSelect = document.getElementById('kb-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-profile', profileId: profileSelect.value });
      });
    }
```

- [ ] **Step 6: Typecheck and full suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 7: Manual verification (F5)**

1. Press F5 (Run Extension) in this repo, open a workspace with `.kanbrain/config.json` already configured (run `Kanbrain: Sync Board Configuration` first if it predates this feature, to backfill `profiles`).
2. Open the Kanbrain Home screen — confirm a "Profile" section appears below "Team", with "— None —", "Desenvolvedor", "QA".
3. Pick "Desenvolvedor" — confirm `.kanbrain/config.local.json` now has `"selectedProfileId": "developer"`, and `.kanbrain/config.json` does **not**.
4. Run any skill (status or global) against an active work item — open the newest file under `.kanbrain/generated/` and confirm it starts with `## Requester profile\n**Desenvolvedor** — ...`.
5. Switch back to "— None —" and run a skill again — confirm the generated file has no `Requester profile` block.

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire the Profile dropdown to config.local.json and skill execution"
```
