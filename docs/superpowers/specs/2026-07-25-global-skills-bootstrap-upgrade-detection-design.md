# Detect missing global-skill bootstrap content on upgrade

## Contexto e motivação

`Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` both now backfill `.kanbrain/skills/explain-card.md`, `.kanbrain/USAGE.md`, and the `globalSkills.explain-card` config entry when missing — but only when the user actually runs one of those commands. The silent check that already runs once per VS Code session (`presentBoardConfigCheck`, via `checkBoardConfig`) only diffs Azure DevOps status/type changes (`diffBoardConfig`) — it has no idea the bootstrap content exists, so a team that ran Setup before this feature shipped sees nothing at all after upgrading the extension: no notification, no "Sync Now" prompt. They only get the new content if someone remembers to run Sync manually.

## Escopo

**Dentro do escopo:**
- `diffBoardConfig`/`BoardConfigDiff` gain a `missingBootstrapContent: boolean` signal, folded into the existing `isDiffEmpty`/`summarizeDiff` helpers — reuses the exact same silent-check → warning → "Sync Now" flow already used for board status/type changes.
- A new pure-ish helper, `isBootstrapContentMissing(workspaceRoot, config)`, in `src/skills/bootstrapContent.ts` — true when `.kanbrain/USAGE.md` doesn't exist on disk, or `config.globalSkills` has no `explain-card` entry.
- `commands/checkBoardConfig.ts` and `commands/syncBoardConfig.ts` both compute this signal and pass it into `diffBoardConfig`, so the silent check *and* the "already up to date" vs. "synced: X" message after a manual Sync both reflect it.

**Fora de escopo:**
- Checking whether `.kanbrain/skills/explain-card.md` physically exists on disk as a signal on its own — mirrors how status skills are never file-existence-checked anywhere in the app; only the `globalSkills.explain-card` *config entry* is checked (consistent with everything else `diffBoardConfig` already looks at, which is entirely config/Azure-discovery-based).
- Any change to *when* the backfill actually happens (still only on an explicit Setup/Sync run) — `Kanbrain: Check Board Configuration` stays strictly read-only, exactly as documented today ("it never modifies anything by itself").
- A separate/different notification path — this reuses the existing warning message and "Sync Now" action verbatim, just with one more thing it can be true about.

## Design

### `src/skills/bootstrapContent.ts`

New function, alongside the existing constants:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, SkillEntry } from '../types';
import { pickReadableTextColor } from '../view/badgeColor';

// ...existing exports unchanged...

export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const explainCardEntryMissing = !config.globalSkills?.[EXPLAIN_CARD_SKILL_ID];
  return usageGuideMissing || explainCardEntryMissing;
}
```

### `src/azureDevOps/checkBoardConfig.ts`

```ts
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
  // ...existing body unchanged...
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

### `src/commands/checkBoardConfig.ts`

```ts
boardState = await discoverBoardState(client, result.config.organization, result.config.project);
// ...
const diff = diffBoardConfig(
  result.config,
  boardState.discoveredStatusesByType,
  isBootstrapContentMissing(workspaceRoot, result.config),
);
```

(New import: `isBootstrapContentMissing` from `../skills/bootstrapContent`.)

### `src/commands/syncBoardConfig.ts`

The diff computed *before* the sync writes anything (used only for the "already up to date" vs. "synced: X" message) gets the same third argument:

```ts
const diff = diffBoardConfig(
  result.config,
  boardState.discoveredStatusesByType,
  isBootstrapContentMissing(workspaceRoot, result.config),
);
```

This is evaluated against `result.config` (pre-sync), matching how the existing status/type diff is already computed before the write — the actual backfill (already shipped) stays unconditional either way, this only changes what message the user sees afterward.

## Testes

`src/skills/bootstrapContent.test.ts` (extend, using `fs.mkdtempSync`/`fs.rmSync` around a temp workspace root — same pattern as `writeGeneratedFile.test.ts`):
- Returns `true` when neither `USAGE.md` nor a `globalSkills.explain-card` entry exist.
- Returns `false` once both exist.
- Returns `true` when only one of the two is missing (each case).

`src/azureDevOps/checkBoardConfig.test.ts` (extend):
- `diffBoardConfig(config(), discovered, true)` → `isDiffEmpty` is `false`.
- `diffBoardConfig(config(), discovered, false)` → `isDiffEmpty` is `true` (matches today's passing case, now with the explicit `false` argument).
- `summarizeDiff` includes a mention of the missing bootstrap content when `missingBootstrapContent` is `true`.

`commands/checkBoardConfig.ts`/`commands/syncBoardConfig.ts` have no automated test suite (same as every other command file) — manual verification: with `.kanbrain/USAGE.md` deleted, reload the Extension Development Host window once (simulating "next session after upgrade") and confirm the silent check now shows the "out of date" warning with a "Sync Now" action; clicking it (or running Sync directly) recreates the file and the next check reports "up to date".
