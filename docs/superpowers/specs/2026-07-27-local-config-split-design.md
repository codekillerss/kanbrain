# Split machine-local state out of `config.json` — Design

## Context

Reported in `kanbrain-feature-request.md` by a team running Kanbrain across ~11 Azure DevOps
repositories. `.kanbrain/config.json` is meant to be committed and shared by the whole team (per
`USAGE.md`), but it currently mixes two kinds of data with opposite lifecycles:

| Kind | Fields | Should be |
|---|---|---|
| Team-shared | `organization`, `project`, `skills`, `globalSkills`, `statusColors`, `typeColors`, `typeIcons`, `cardSettingsByTeam`, `taskBacklogTypesByTeam`, `defaultTeam`, `lastSyncedVersion` | committed |
| Machine-local | `repositories`, `showAssignedTo` | never committed |

`repositories[id].path` is an absolute filesystem path, unique per developer. `showAssignedTo` is
a personal display preference toggled from a checkbox in the panel. Because both live inside
`config.json`, every developer's working copy is permanently dirty and skill changes have to be
staged with `git add -p` to avoid leaking local paths.

This also causes a real bug: `config/syncConfig.ts`'s `mergeRepositories` unconditionally prefers
the existing `path` over a freshly auto-discovered one. When a teammate clones a repo whose
committed `config.json` carries someone else's local path, sync never repairs it. This design
fixes that bug as a side effect — see "Why this fixes the stale-path bug" below — so no separate
change to `mergeRepositories` is needed.

The related "`workspaceFolders[0]` forces a folder layout" ask from the same report is a separate,
independent sub-project and is out of scope here.

## Goals

- `.kanbrain/config.json` never contains `repositories` or `showAssignedTo` after this change, so
  it is safe to commit as-is, with no manual staging.
- Existing workspaces (config.json already containing these fields from before this change)
  keep working with no manual migration step.
- No changes to any of the ~15 call sites of `readConfig`/`readConfigWithDiagnostics`/`writeConfig`
  outside of `src/config/config.ts` itself.

## Non-goals

- Multi-root workspace support (separate sub-project).
- Changing `RepositoryPathEntry` shape or how repositories are discovered/matched.
- A UI affordance for viewing/editing `config.local.json` directly — it's plumbing, not a feature
  surface.

## Architecture

A new file, `.kanbrain/config.local.json`, holds exactly two optional top-level keys:

```json
{
  "repositories": { "c891a4a0-...": { "name": "Demarco_Central", "path": "C:\\dev\\Demarco_Central" } },
  "showAssignedTo": false
}
```

`KanbrainConfig` (the in-memory type in `src/types.ts`) is unchanged — it still has both fields.
Only `src/config/config.ts` changes: it becomes the single place that knows about the two-file
split. Every other file keeps reading/writing a plain `KanbrainConfig` object exactly as today.

The entire `repositories` map moves, not just `.path` — `.name` is re-derived from the Azure
DevOps repo listing on every sync anyway (see `matchRepositoriesToLocalPaths`), so there's no
reason to split fields within a single `RepositoryPathEntry` across two files.

### `getConfigLocalPath`

```ts
export function getConfigLocalPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.local.json');
}
```

### Read path

`readConfig`/`readConfigWithDiagnostics`:

1. Read and parse `config.json` as today, running it through `runMigrations` unchanged.
2. If `config.local.json` exists and parses as valid JSON, overlay it: for each of
   `repositories` and `showAssignedTo`, if the local file has that key as an own property, its
   value replaces whatever came out of step 1 for that key — **even if `config.json` also has a
   value for it** (a stale leftover from before this change, or committed by mistake). The local
   file is always the source of truth once it exists.
3. If `config.local.json` is missing, or is missing a given key, or fails to parse, step 1's
   value for that key is kept as-is (this is what makes old configs with `repositories`/
   `showAssignedTo` still inline in `config.json` keep working unmodified).

A malformed `config.local.json` must never make the whole read fail — a bad local file falls back
to whatever `config.json` had, the same as a missing one. `readConfig`'s existing "malformed JSON
→ null" behavior stays scoped to `config.json` only.

### Write path

`writeConfig(workspaceRoot, config)` keeps its exact signature. Internally:

1. Build the local payload: `{ ...(config.repositories !== undefined ? { repositories: config.repositories } : {}), ...(config.showAssignedTo !== undefined ? { showAssignedTo: config.showAssignedTo } : {}) }`.
2. If that payload has at least one key, write it to `config.local.json` (creating `.kanbrain/`
   if needed, same as today). If it has zero keys (both fields undefined), don't create the file
   at all — avoids littering empty `config.local.json` files into workspaces that never touch
   repositories or the assignee toggle.
3. Write everything else — the full `config` object minus the `repositories` and `showAssignedTo`
   keys — to `config.json`, same as today (pretty-printed, trailing newline).

Because every `writeConfig` call always re-derives both files from the full `KanbrainConfig` it's
given, the two files can never drift out of sync with each other from Kanbrain's own writes.

### Why this fixes the stale-path bug

Once this ships, `repositories` is written to `config.local.json` and stripped from `config.json`
on the very next `writeConfig` call (sync, a repository path edit, anything). Since
`config.local.json` is gitignored, a teammate's clone never receives another developer's path
data at all — the field simply isn't in the file they pull. `mergeRepositories`'s "existing path
always wins" behavior in `src/config/syncConfig.ts` is unchanged and doesn't need to be, because
there is no longer a foreign existing path for it to wrongly prefer.

## Migration / backward compatibility

This is not modeled as an entry in `src/config/migrations.ts`, because that module's contract is a
pure `(raw: unknown) => unknown` shape transform — no `workspaceRoot`, no filesystem access — and
this change needs to write a second file and touch `.gitignore`, not just reshape the parsed
object. Folding it in would either break that purity for every migration or require threading
`workspaceRoot` through a module that has never needed it.

Instead, `applyLocalOverlay` runs a one-time **eager migration** the first time `readConfig`/
`readConfigWithDiagnostics` reads a workspace: if `config.local.json` doesn't exist yet and the
config has `repositories` and/or `showAssignedTo` (from an old `config.json` that still carries
them inline), it writes those fields straight to a new `config.local.json` and calls
`ensureGitignoreEntry` — immediately, on that read, before returning. No user action, command, or
subsequent write is required to trigger it.

The gate is **presence of `config.local.json`, not `lastSyncedVersion`**. `lastSyncedVersion` is
only bumped by `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` (see `setup.ts`/
`syncBoardConfig.ts`) — a plain settings toggle or a repository path edit writes `config.json`
without touching it. A version-gated migration could therefore re-trigger indefinitely (if the
user's first post-upgrade action isn't Setup/Sync) or fail to trigger at all in the opposite case.
Gating on the local file's own existence is self-correcting regardless of which command runs
first, and naturally never re-runs once the file is there.

This eager migration is a separate concern from the read-side overlay in "Read path" above, which
stays in place permanently (not just during a transition window): it's what makes a `config.local.json`
value win over a stale foreign value a teammate's shared `config.json` might carry, which is the
mechanism described in "Why this fixes the stale-path bug".

## Setup and gitignore

`src/commands/setup.ts` already calls `ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/')`
(line 155). It gains a second call: `ensureGitignoreEntry(workspaceRoot, '.kanbrain/config.local.json')`.
This one isn't covered by the eager migration above, because `setup.ts` writes a brand-new config
without ever reading an existing one first — there's nothing to migrate on a fresh project, but the
entry should still be there proactively for when repositories are first discovered.

`src/commands/syncBoardConfig.ts` needs no equivalent call: it calls `readConfigWithDiagnostics` as
its very first step, so the eager migration (and its `ensureGitignoreEntry` call) has already run
by the time any later line in that command executes.

## Docs

`USAGE_GUIDE_CONTENT` in `src/skills/bootstrapContent.ts` gets one new bullet under "Where things
live", after the `config.json` line:

> `.kanbrain/config.local.json` — per-machine repository paths and display preferences (gitignored, never commit this).

## Testing plan

All in `src/config/config.test.ts` (new `describe` blocks alongside the existing ones):

- Writing a config with `repositories`/`showAssignedTo` set creates `config.local.json` with
  exactly those two keys, and `config.json` has neither key.
- Reading that pair of files back reconstructs the identical original `KanbrainConfig` (round
  trip via `toEqual`, matching the existing round-trip test's style).
- Writing a config where `repositories` and `showAssignedTo` are both `undefined` does not create
  `config.local.json` at all.
- Reading a legacy `config.json` that has `repositories`/`showAssignedTo` inline and no
  `config.local.json` present returns those fields from `config.json` unchanged.
- Reading a workspace where `config.local.json` defines `showAssignedTo: false` while a legacy
  `config.json` still has `showAssignedTo: true` inline returns `false` — local always wins.
- Reading a workspace with a malformed `config.local.json` (invalid JSON) falls back to
  `config.json`'s values instead of failing the whole read.
- Reading a legacy `config.json` (inline `repositories`/`showAssignedTo`, no `config.local.json`)
  eagerly creates `config.local.json` with those values and adds the `.gitignore` entry, in that
  same read call.
- Reading that same kind of legacy `config.json` a second time, once `config.local.json` already
  exists, does not re-run the migration (the existing local file's values are used as-is).
- `setup.ts` has no existing unit tests (it registers `vscode.commands` directly and isn't covered
  by the current test setup — consistent with every other file in `src/commands/`), so its new
  `ensureGitignoreEntry` call isn't unit tested either; verify it manually by running
  `Kanbrain: Setup` in the Extension Development Host and checking `.gitignore`.

## Out of scope, deliberately

- The `mergeRepositories`/"existing path wins" behavior in `syncConfig.ts` is untouched — see
  "Why this fixes the stale-path bug" above for why no change is needed there.
- Multi-root workspace discovery (`workspaceFolders[0]`) — tracked as a separate sub-project.
