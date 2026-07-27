# Configurable repository scan depth — Design

## Context

Follow-up from `kanbrain-feature-request.md`'s "Related: `workspaceFolders[0]` forces a folder
layout on the team" section. The full ask there — discover repositories across every
`vscode.workspace.workspaceFolders`, not just `[0]` — is a separate, larger sub-project, tracked
independently and out of scope here.

This is the report's own "cheaper alternative": a configurable scan depth, so a
`<root>/.kanbrain` + `<root>/repos/*` layout works without needing multi-root workspace support at
all. The reporting team's workaround today — turning each developer's personal working folder into
a git clone of the shared config repo, with an allow-list `.gitignore` (`/*` then `!` exceptions
for every file they want to keep) — exists only because `discoverLocalRepositories` scans
`workspaceRoot` and its direct children and nothing deeper. A `<root>/repos/*` layout lets that same
`.gitignore` shrink to a single `/repos/` line, and turns the config-repo clone back into an
ordinary `git clone` into an empty directory (no more `git init` + `remote add` + `fetch` +
`checkout -b`).

This does **not** solve everything in that section of the report — repositories on a different
drive, or otherwise outside the `workspaceRoot` tree entirely, still need real multi-root support.
That trade-off was discussed and accepted before starting this spec.

## Current behavior (verified against source, not the report's compiled-build excerpts)

`src/git/discoverLocalRepositories.ts`:

```ts
export async function discoverLocalRepositories(workspaceRoot: string): Promise<Map<string, string>> {
  const candidates = [workspaceRoot];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(path.join(workspaceRoot, entry.name));
    }
  }
  const result = new Map<string, string>();
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, '.git'))) continue;
    const remoteUrl = await getRemoteUrl(candidate);
    const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
    if (repoName && !result.has(repoName.toLowerCase())) {
      result.set(repoName.toLowerCase(), candidate);
    }
  }
  return result;
}
```

Scans exactly `workspaceRoot` (depth 0) and its direct children (depth 1). Two call sites, both
already `vscode`-aware: `src/commands/setup.ts:111` and `src/commands/syncBoardConfig.ts:62`. The
function itself imports no `vscode` API, which is why its 5 existing tests
(`discoverLocalRepositories.test.ts`) run under vitest with no mocking — that property must be
preserved.

`package.json` has no `contributes.configuration` section today — this is the extension's first
user-facing setting.

## Goals

- A user can set `kanbrain.repoScanDepth` to `2` (or higher) to have repository auto-discovery look
  one or more directory levels deeper than just the workspace root's direct children.
- Default behavior (no setting touched) is byte-for-byte identical to today — confirmed by leaving
  every existing test in `discoverLocalRepositories.test.ts` unmodified.
- `discoverLocalRepositories.ts` keeps importing zero `vscode` APIs.

## Non-goals

- Multi-root workspace support (`workspaceFolders[1..]`) — separate sub-project.
- Any UI for picking/validating the depth beyond VS Code's own Settings UI.
- Symlink/junction traversal — not requested, not handled specially (Node's `readdirSync` with
  `withFileTypes` reports a symlink's `isDirectory()` as `false` unless followed; leaving this
  alone is the conservative choice since following symlinks risks infinite loops on a cyclic link).

## Design

### `discoverLocalRepositories`'s new signature

```ts
export async function discoverLocalRepositories(workspaceRoot: string, maxDepth: number = 1): Promise<Map<string, string>>
```

`maxDepth` defaults to `1` in the function signature itself — every existing call in
`discoverLocalRepositories.test.ts` (`discoverLocalRepositories(workspaceRoot)`, no second
argument) keeps compiling and keeps passing unchanged, including the test named `'ignores
repositories nested two levels deep'`, which becomes the documented default-depth case without
being touched.

Depth is measured with `workspaceRoot` itself at depth `0` (matches the existing "finds a
repository at the workspace root itself" test) and its direct children at depth `1` (matches
"finds repositories in first-level subdirectories"). `maxDepth = 1` — today's only behavior —
means "check depth 0 and depth 1." `maxDepth = 2` adds depth 2 (grandchildren), which is what a
`<root>/repos/ProjectA` layout needs (`repos` is depth 1, `ProjectA` is depth 2).

The traversal becomes a single recursive pass that both walks and checks for `.git` at once,
rather than today's two-pass "collect candidates, then filter":

```ts
export async function discoverLocalRepositories(workspaceRoot: string, maxDepth: number = 1): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const remoteUrl = await getRemoteUrl(dir);
      const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
      if (repoName && !result.has(repoName.toLowerCase())) {
        result.set(repoName.toLowerCase(), dir);
      }
      return; // a repository was found here - don't descend into it
    }
    if (depth >= maxDepth) {
      return; // reached the configured depth limit without finding a repo
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '.git') {
        await walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  await walk(workspaceRoot, 0);
  return result;
}
```

Two deliberate details:

- **Stops descending once a directory is confirmed to be a repository.** A nested `.git` inside an
  already-found repo (a submodule, or something accidentally vendored) is not separately reported
  as its own top-level entry — matches the spirit of the existing "ignores repositories nested two
  levels deep" test, just scoped to "nested inside a found repo" instead of "nested past the depth
  limit."
- **Skips recursing into a directory literally named `.git`.** Without this, at `maxDepth >= 2` the
  walk would step into a found repo's own `.git` internals (`objects/`, `refs/`, `logs/`, …)
  looking for yet more `.git` folders — wasted filesystem work for something that can never match
  the "not yet found as a repo" branch it would need to reach in the first place, since we already
  return before recursing whenever `.git` is found in the parent. This guard only matters for the
  bookkeeping cost, not correctness, but it's a one-line addition to `discoverLocalRepositories.ts`
  worth including alongside the recursion change.

### `package.json` configuration contribution

```jsonc
"contributes": {
  "configuration": {
    "title": "Kanbrain",
    "properties": {
      "kanbrain.repoScanDepth": {
        "type": "number",
        "default": 1,
        "minimum": 1,
        "description": "How many directory levels below the workspace root to scan when auto-discovering local repository paths. 1 (default) scans the root and its direct children only. Increase to 2 to support a <root>/repos/* layout, where project repositories are nested one level deeper than the workspace root."
      }
    }
  },
  "commands": [ ... existing ... ]
}
```

`minimum: 1` is enforced by VS Code's Settings UI, but a hand-edited `settings.json` can still
contain `0` or a negative number — `getConfiguration().get()` returns whatever's on disk without
re-validating. Both call sites clamp defensively: `Math.max(1, configuredValue)`. This matters
because `maxDepth = 0` would make `walk()` return immediately after checking only `workspaceRoot`
itself (depth `0 >= maxDepth 0` is true before ever listing its children) — a real regression from
today's default (root + direct children), not just a no-op.

### Call site changes

`src/commands/setup.ts:111`:

```ts
const repoScanDepth = Math.max(1, vscode.workspace.getConfiguration('kanbrain').get<number>('repoScanDepth', 1));
const localRepos = mapReposPick.map ? await discoverLocalRepositories(workspaceRoot, repoScanDepth) : new Map<string, string>();
```

`src/commands/syncBoardConfig.ts:62`:

```ts
const repoScanDepth = Math.max(1, vscode.workspace.getConfiguration('kanbrain').get<number>('repoScanDepth', 1));
const localRepos = await discoverLocalRepositories(workspaceRoot, repoScanDepth);
```

## Testing plan

All additions to `src/git/discoverLocalRepositories.test.ts` — no existing test in that file is
modified:

- With `maxDepth = 2`, a repository nested two levels deep (`level1/level2`, the same fixture the
  existing depth-1 test uses to prove it's *not* found by default) is found.
- With `maxDepth = 2`, a `.git` nested inside an already-discovered repository (e.g.
  `outer-repo/.git` and `outer-repo/vendored/.git`) is not double-reported — only `outer-repo`
  appears in the result.
- With `maxDepth = 2`, a plain (non-repo) intermediate directory two levels deep from a real repo —
  i.e. `outer-repo` at depth 1 containing a non-git subfolder at depth 2 — contributes nothing
  extra; existing depth-1 behavior for `outer-repo` itself is unaffected.

`setup.ts` and `syncBoardConfig.ts` remain untested at the unit level (consistent with every other
file in `src/commands/`, same precedent established in
`docs/superpowers/specs/2026-07-27-local-config-split-design.md`) — verify the setting manually in
the Extension Development Host: set `kanbrain.repoScanDepth` to `2`, create a `<root>/repos/ProjectA`
layout, run `Kanbrain: Setup` (or `Sync Board Configuration`) and confirm `ProjectA` is discovered
and mapped.

## Out of scope, deliberately

- Multi-root workspace discovery (`workspaceFolders[1..]`) and repositories outside the
  `workspaceRoot` tree (e.g. a different drive) — the report's fuller proposal, tracked separately
  if the team wants to pursue it later.
- Symlink/junction traversal.
