# Bootstrap Upgrade Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the silent board-config check that already runs once per VS Code session detect a missing `.kanbrain/USAGE.md` or `globalSkills.explain-card` entry, and offer the existing "Sync Now" action for it — so upgrading the extension alone surfaces the gap instead of requiring someone to remember to run Sync manually.

**Architecture:** One new fs/config-aware helper (`isBootstrapContentMissing`) computes a boolean; `diffBoardConfig` takes it as a third parameter and folds it into the existing `BoardConfigDiff`/`isDiffEmpty`/`summarizeDiff` trio, so the entire existing silent-check → warning → "Sync Now" pipeline picks it up with no new UI code. Both call sites (`commands/checkBoardConfig.ts`, `commands/syncBoardConfig.ts`) compute the boolean via the new helper before calling `diffBoardConfig`.

**Tech Stack:** TypeScript, Node `fs`/`path`, Vitest.

## Global Constraints

- Only the `globalSkills.explain-card` *config entry* is checked, never whether `.kanbrain/skills/explain-card.md` physically exists on disk — matches how status skill files are never existence-checked anywhere in the app. (Spec: "Fora de escopo")
- `Kanbrain: Check Board Configuration` must stay strictly read-only — this change only adds a new *signal* it can report, it must never write anything itself. (Spec: "Fora de escopo")
- No test suite exists for `src/commands/*.ts` — those two call-site changes are verified by `npm run compile`, the existing suite staying green, and manual verification.

---

### Task 1: `isBootstrapContentMissing` helper

**Files:**
- Modify: `src/skills/bootstrapContent.ts`
- Test: `src/skills/bootstrapContent.test.ts`

**Interfaces:**
- Produces: `isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/skills/bootstrapContent.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXPLAIN_CARD_SKILL_ID,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  isBootstrapContentMissing,
} from './bootstrapContent';
import type { KanbrainConfig, SkillEntry } from '../types';

// ...existing imports/describe block for ensureExplainCardGlobalSkill stay unchanged above this...

function config(globalSkills?: Record<string, SkillEntry>): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    globalSkills,
  };
}

describe('isBootstrapContentMissing', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-bootstrap-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('is true when neither USAGE.md exists nor the explain-card entry is configured', () => {
    expect(isBootstrapContentMissing(workspaceRoot, config())).toBe(true);
  });

  it('is true when USAGE.md exists but the explain-card entry is missing', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');

    expect(isBootstrapContentMissing(workspaceRoot, config())).toBe(true);
  });

  it('is true when the explain-card entry exists but USAGE.md is missing', () => {
    const withEntry = config({ [EXPLAIN_CARD_SKILL_ID]: { path: EXPLAIN_CARD_SKILL_RELATIVE_PATH } });

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(true);
  });

  it('is false once both USAGE.md exists and the explain-card entry is configured', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withEntry = config(ensureExplainCardGlobalSkill(undefined));

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- bootstrapContent`
Expected: FAIL — `isBootstrapContentMissing` is not exported yet (import error / undefined).

- [ ] **Step 3: Implement `isBootstrapContentMissing`**

In `src/skills/bootstrapContent.ts`, add two imports at the top and one new function at the bottom:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, SkillEntry } from '../types';
import { pickReadableTextColor } from '../view/badgeColor';
```

(`KanbrainConfig` is a new import alongside the existing `SkillEntry`; `fs`/`path` are new too.)

At the end of the file:

```ts
export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const explainCardEntryMissing = !config.globalSkills?.[EXPLAIN_CARD_SKILL_ID];
  return usageGuideMissing || explainCardEntryMissing;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- bootstrapContent`
Expected: PASS — all tests green, including the 3 pre-existing `ensureExplainCardGlobalSkill` ones.

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/skills/bootstrapContent.ts src/skills/bootstrapContent.test.ts
git commit -m "feat: add isBootstrapContentMissing helper for global skill bootstrap detection"
```

---

### Task 2: `diffBoardConfig` gains the `missingBootstrapContent` signal

**Files:**
- Modify: `src/azureDevOps/checkBoardConfig.ts`
- Test: `src/azureDevOps/checkBoardConfig.test.ts`

**Interfaces:**
- Consumes: nothing new (takes a plain `boolean` argument, doesn't call `isBootstrapContentMissing` itself).
- Produces: `diffBoardConfig(config, discovered, missingBootstrapContent: boolean): BoardConfigDiff` — the third parameter is now required. `BoardConfigDiff.missingBootstrapContent: boolean`. Both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

In `src/azureDevOps/checkBoardConfig.test.ts`, update the existing calls to `diffBoardConfig` to pass a third argument, and add new cases. Replace the full file with:

```ts
import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty, summarizeDiff } from './checkBoardConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: { Task: { 'To Do': null, Done: null } },
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const discovered: Record<string, Record<string, string>> = { Task: { 'To Do': 'Proposed', Done: 'Completed' } };

describe('diffBoardConfig', () => {
  it('returns an empty diff when config matches the discovered types exactly and bootstrap content is present', () => {
    const diff = diffBoardConfig(config(), discovered, false);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed (no longer discovered)', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null, Done: null }, Bug: { New: null } } }), discovered, false);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added (discovered but not yet in config)', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Bug: { New: 'Proposed' } }, false);
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a status added within an existing type', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null } } }), discovered, false);
    expect(diff.statusesAdded).toEqual([{ type: 'Task', status: 'Done' }]);
  });

  it('reports a status removed within an existing type, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ skills: { Task: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/task-cancelled.md' } } } }),
      discovered,
      false,
    );
    expect(diff.statusesRemoved).toEqual([{ type: 'Task', status: 'Cancelled', skillPath: '.kanbrain/skills/task-cancelled.md' }]);
  });

  it('is not empty when missingBootstrapContent is true even if nothing else changed', () => {
    const diff = diffBoardConfig(config(), discovered, true);
    expect(isDiffEmpty(diff)).toBe(false);
    expect(diff.missingBootstrapContent).toBe(true);
  });

  it('mentions the missing bootstrap content in the summary', () => {
    const diff = diffBoardConfig(config(), discovered, true);
    expect(summarizeDiff(diff)).toContain('global skill setup');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- checkBoardConfig`
Expected: FAIL — `diffBoardConfig` currently only accepts 2 arguments, and `missingBootstrapContent` doesn't exist on the returned object.

- [ ] **Step 3: Implement the change**

Replace the full contents of `src/azureDevOps/checkBoardConfig.ts`:

```ts
import type { KanbrainConfig } from '../types';

export interface BoardConfigDiff {
  typesAdded: string[];
  typesRemoved: string[];
  statusesAdded: { type: string; status: string }[];
  statusesRemoved: { type: string; status: string; skillPath: string | null }[];
  missingBootstrapContent: boolean;
}

export function diffBoardConfig(
  config: KanbrainConfig,
  discovered: Record<string, Record<string, string>>,
  missingBootstrapContent: boolean,
): BoardConfigDiff {
  const typesAdded: string[] = [];
  const typesRemoved: string[] = [];
  const statusesAdded: { type: string; status: string }[] = [];
  const statusesRemoved: { type: string; status: string; skillPath: string | null }[] = [];

  for (const type of Object.keys(config.skills)) {
    if (!(type in discovered)) {
      typesRemoved.push(type);
      continue;
    }
    for (const status of Object.keys(config.skills[type])) {
      if (!(status in discovered[type])) {
        statusesRemoved.push({ type, status, skillPath: config.skills[type][status]?.path ?? null });
      }
    }
  }
  for (const [type, statuses] of Object.entries(discovered)) {
    if (!(type in config.skills)) {
      typesAdded.push(type);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.skills[type])) {
        statusesAdded.push({ type, status });
      }
    }
  }

  return { typesAdded, typesRemoved, statusesAdded, statusesRemoved, missingBootstrapContent };
}

export function isDiffEmpty(diff: BoardConfigDiff): boolean {
  return (
    diff.typesAdded.length === 0 &&
    diff.typesRemoved.length === 0 &&
    diff.statusesAdded.length === 0 &&
    diff.statusesRemoved.length === 0 &&
    !diff.missingBootstrapContent
  );
}

export function summarizeDiff(diff: BoardConfigDiff): string {
  const parts: string[] = [];
  if (diff.typesAdded.length) parts.push(`${diff.typesAdded.length} new work item type(s)`);
  if (diff.typesRemoved.length) parts.push(`${diff.typesRemoved.length} work item type(s) no longer found`);
  if (diff.statusesAdded.length) parts.push(`${diff.statusesAdded.length} new status(es)`);
  if (diff.statusesRemoved.length) parts.push(`${diff.statusesRemoved.length} status(es) no longer found (skill mappings preserved)`);
  if (diff.missingBootstrapContent) parts.push('missing global skill setup (explain-card skill / USAGE.md)');
  return parts.join(', ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- checkBoardConfig`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: FAILS — `src/commands/checkBoardConfig.ts:27` and `src/commands/syncBoardConfig.ts:54` still call `diffBoardConfig` with only 2 arguments (TS2554: Expected 3 arguments, but got 2).

This confirms the signature change is enforced. Task 3 fixes both call sites.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/checkBoardConfig.ts src/azureDevOps/checkBoardConfig.test.ts
git commit -m "feat: fold missing global-skill bootstrap content into the board config diff"
```

---

### Task 3: Wire both command call sites

**Files:**
- Modify: `src/commands/checkBoardConfig.ts`
- Modify: `src/commands/syncBoardConfig.ts`

**Interfaces:**
- Consumes: `isBootstrapContentMissing` (Task 1), `diffBoardConfig`'s new 3-argument signature (Task 2).

- [ ] **Step 1: `src/commands/checkBoardConfig.ts` — add the import**

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { diffBoardConfig, isDiffEmpty, summarizeDiff, type BoardConfigDiff } from '../azureDevOps/checkBoardConfig';
import { readConfigWithDiagnostics } from '../config/config';
import { isBootstrapContentMissing } from '../skills/bootstrapContent';
import type { KanbrainConfig } from '../types';
```

- [ ] **Step 2: `src/commands/checkBoardConfig.ts` — pass the third argument**

Change:

```ts
  const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);
```

to:

```ts
  const diff = diffBoardConfig(
    result.config,
    boardState.discoveredStatusesByType,
    isBootstrapContentMissing(workspaceRoot, result.config),
  );
```

- [ ] **Step 3: `src/commands/syncBoardConfig.ts` — add the import**

Add `isBootstrapContentMissing` to the existing `bootstrapContent` import:

```ts
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  isBootstrapContentMissing,
} from '../skills/bootstrapContent';
```

- [ ] **Step 4: `src/commands/syncBoardConfig.ts` — pass the third argument**

Change:

```ts
    const freshStatusColors = discoverStatusColors(types);
    const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);
```

to:

```ts
    const freshStatusColors = discoverStatusColors(types);
    const diff = diffBoardConfig(
      result.config,
      boardState.discoveredStatusesByType,
      isBootstrapContentMissing(workspaceRoot, result.config),
    );
```

(Evaluated against `result.config` — the pre-sync config — matching how the rest of `diff` is already computed before `updated`/`writeConfig` run below it. The actual backfill two blocks above this stays unconditional either way; this only changes the "up to date" vs. "synced: X" message.)

- [ ] **Step 5: Compile**

Run: `npm run compile`
Expected: PASS — both call sites now match the 3-argument signature.

- [ ] **Step 6: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — no test targets either command file directly, so this confirms no regression elsewhere.

- [ ] **Step 7: Commit**

```bash
git add src/commands/checkBoardConfig.ts src/commands/syncBoardConfig.ts
git commit -m "feat: surface missing global-skill bootstrap content in the Sync Now prompt"
```

- [ ] **Step 8: Manual verification (F5)**

Press F5. In a workspace already configured (has `.kanbrain/config.json`), delete `.kanbrain/USAGE.md`. Reload the Extension Development Host window (simulating "next session after upgrade") and confirm the silent startup check now shows "Kanbrain board configuration is out of date: missing global skill setup (explain-card skill / USAGE.md)." with a "Sync Now" action. Click it (or run `Kanbrain: Sync Board Configuration` directly) and confirm `.kanbrain/USAGE.md` is recreated and a subsequent `Kanbrain: Check Board Configuration` reports "up to date". Repeat by instead removing the `globalSkills.explain-card` entry from `.kanbrain/config.json` (leaving the file alone) — confirm the same warning appears.

---

## Self-Review Notes

- **Spec coverage:** `isBootstrapContentMissing` checks USAGE.md file + config entry, not the skill file itself (Task 1) ✓; folded into `isDiffEmpty`/`summarizeDiff`, reusing the existing warning/"Sync Now" flow with no new UI code (Task 2, Task 3) ✓; `Kanbrain: Check Board Configuration` still never writes anything — only `isBootstrapContentMissing` (read-only fs/config check) is called from it (Task 3 Step 1-2) ✓; manual verification covering both the file-missing and config-entry-missing cases (Task 3 Step 8) ✓.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `diffBoardConfig(config: KanbrainConfig, discovered: Record<string, Record<string, string>>, missingBootstrapContent: boolean): BoardConfigDiff` signature is identical between its Task 2 definition and both call sites fixed in Task 3; `isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean` signature matches between Task 1's definition and Task 3's two call sites.
