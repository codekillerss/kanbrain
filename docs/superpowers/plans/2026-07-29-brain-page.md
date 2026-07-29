# Brain Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone "Repositories" screen with a new "Brain" screen that groups Repositories, Skills, and Profiles into three collapsible segments, each with its own scoped "Configure with AI" button.

**Architecture:** `renderRepositories.ts`, `renderConfigEditor.ts`, and `renderProfilesEditor.ts` already produce body-only markup for their respective sections (or, in the repositories case, will after Task 1). A new `renderBrain.ts` wraps each in an identical collapsible-segment header (chevron toggle + "Configure with AI" button) and concatenates them. Each AI button posts a `run-segment-ai` message; `KanbrainViewProvider` maps the segment to one of three new VS Code commands, each of which discovers real Azure DevOps data, writes a scoped markdown file via the existing `writeGeneratedFile`/`sendReadCommand` pipeline (same mechanism as today's generic `kanbrain.configureWithAi`), and hands it to the agent in the Kanbrain terminal.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest.

## Global Constraints

- No new persisted config schema (no "Definition of Done" field, no collapsed-state persistence for the Brain segments) — confirmed out of scope in the spec.
- The 3 new command files (`src/commands/configure*WithAi.ts`) get no unit tests — same precedent as the existing `configureWithAi.ts`, which has none (it's `vscode`/`fs` glue, verified manually).
- Repos AI instructions must tell the agent to only *suggest* cloning missing repositories, never run `git clone` itself.
- Skills AI instructions must tell the agent to run `Kanbrain: Sync Board Configuration` itself as a first step (the extension does not run it automatically).
- Every task must leave `npm run compile` and `npx vitest run` green — this repo's screen-name union (`'home' | 'flow' | 'config' | 'brain'`) is duplicated across `render.ts` and `KanbrainViewProvider.ts`, so the rename task (Task 4) touches both files together, never partially.

---

### Task 1: Extract `renderRepositoriesBody` from `renderRepositories.ts`

**Files:**
- Modify: `src/view/renderRepositories.ts`
- Modify: `src/view/renderRepositories.test.ts`

**Interfaces:**
- Produces: `renderRepositoriesBody(config: KanbrainConfig): string` — renders just the repository rows (or the empty-state message), with no outer `.kb-config-parent-section`/`.kb-config-parent-header` wrapper. `renderBrain.ts` (Task 3) supplies that wrapper instead.

- [ ] **Step 1: Rewrite the failing test file first**

Replace the full contents of `src/view/renderRepositories.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { renderRepositoriesBody } from './renderRepositories';
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

describe('renderRepositoriesBody', () => {
  it('shows a message when no repositories are mapped yet', () => {
    const html = renderRepositoriesBody(config());
    expect(html).toContain('No repositories mapped yet.');
  });

  it('shows one row per repository with the escaped name and path value', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'Fix <me>', path: 'C:\\repos\\kanbrain' } } }));
    expect(html).toContain('Fix &lt;me&gt;');
    expect(html).toContain('value="C:\\repos\\kanbrain"');
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('shows an empty path value for an unmapped repository', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('value=""');
  });

  it('includes a browse-folder button per row', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('data-action="pick-repository-folder"');
  });

  it('includes a clone button for a repository with no local path', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } }));
    expect(html).toContain('data-action="clone-repository"');
  });

  it('does not include a clone button for a repository that already has a local path', () => {
    const html = renderRepositoriesBody(config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } } }));
    expect(html).not.toContain('data-action="clone-repository"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderRepositories.test.ts`
Expected: FAIL — `renderRepositoriesBody` is not exported yet.

- [ ] **Step 3: Rewrite `renderRepositories.ts`**

Replace the full contents of `src/view/renderRepositories.ts` with:

```ts
import type { KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderRepositoriesBody(config: KanbrainConfig): string {
  const entries = Object.entries(config.repositories ?? {});

  return entries.length
    ? entries
        .map(
          ([id, entry]) => `
      <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
        <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
        <div class="kb-config-field-path">
          <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
          <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
          ${!entry.path ? '<button type="button" class="kb-secondary-btn" data-action="clone-repository" title="Clone this repository">Clone</button>' : ''}
        </div>
      </div>
    `,
        )
        .join('')
    : '<div class="kb-empty">No repositories mapped yet. Run Kanbrain: Setup or Kanbrain: Sync Board Configuration to discover them.</div>';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderRepositories.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/view/renderRepositories.ts src/view/renderRepositories.test.ts
git commit -m "refactor: extract renderRepositoriesBody without its own section wrapper"
```

---

### Task 2: Extract `renderDiscoveredBoardInfo.ts` from `buildSetupAssistantFile.ts`

**Files:**
- Create: `src/skills/renderDiscoveredBoardInfo.ts`
- Modify: `src/skills/buildSetupAssistantFile.ts`
- Test: `src/skills/buildSetupAssistantFile.test.ts` (existing — must still pass unchanged, no new test file needed since behavior doesn't change)

**Interfaces:**
- Produces: `renderDiscoveredTypes(types: DiscoveredWorkItemType[]): string`, `renderDiscoveredBoards(boards: DiscoveredBoard[]): string` — reused by `buildSkillsAssistantFile.ts` (Task 9).

- [ ] **Step 1: Create the new shared module**

Create `src/skills/renderDiscoveredBoardInfo.ts`:

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

export function renderDiscoveredTypes(types: DiscoveredWorkItemType[]): string {
  return types
    .map(type => {
      const stateLines = type.states.map(state => `  - ${state.name} (${state.category})`).join('\n');
      return `### ${type.name}\n\n${stateLines}`;
    })
    .join('\n\n');
}

export function renderDiscoveredBoards(boards: DiscoveredBoard[]): string {
  if (boards.length === 0) {
    return '_No boards were found for this team._';
  }
  return boards
    .map(board => {
      const columnsSection = board.columns
        .map(column => {
          const mappingLines = Object.entries(column.stateMappings)
            .map(([type, state]) => `  - ${type}: ${state}`)
            .join('\n');
          return `- **${column.name}** (${column.columnType})\n${mappingLines}`;
        })
        .join('\n');
      return `### ${board.name}\n\n${columnsSection}`;
    })
    .join('\n\n');
}
```

- [ ] **Step 2: Update `buildSetupAssistantFile.ts` to use the shared module**

Replace the full contents of `src/skills/buildSetupAssistantFile.ts` with:

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';
import { renderDiscoveredTypes, renderDiscoveredBoards } from './renderDiscoveredBoardInfo';

export function buildSetupAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Setup Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item in a VS Code side panel, with per-status "skill" buttons. Each button generates a context file — this file was generated the exact same way — and sends a "read this file" command to an agent running in an integrated terminal. That agent is you. \`.kanbrain/config.json\`'s \`skills\` map links each **status** (\`System.State\`), per work item type, to a skill file. The result we're aiming for is one skill for each real step of the team's flow — not necessarily one per raw status name.

## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) per work item type — \`skills\` maps exactly **one skill per status, per work item type**. There is no board-column mode to choose between; board columns aren't a real Kanbrain configuration option, they're listed below purely for your reference. Many teams still think and work in terms of **board columns** rather than raw statuses (common, and often the more natural mental model) — a column can group several statuses together, or have a name that doesn't match any status. When that's the case here, the way to honor it is to point every status that belongs to the same column at the *same* skill file — not to look for a column-level setting that doesn't exist.

## Global skills

Kanbrain also supports skills that aren't tied to any status — \`.kanbrain/config.json\`'s \`globalSkills\` map. They show up as a small "▾" menu next to the status skill button on the active work item's card, and run against whatever work item is active regardless of its status. \`Kanbrain: Setup\`/\`Kanbrain: Sync Board Configuration\` already seed one, \`explain-card\`, that explains the active work item in plain language. See \`.kanbrain/USAGE.md\` for the full guide — including why you (the agent) already have real access to this project's Azure DevOps board data, and can suggest board actions to the user when it makes sense.

## This project's real configuration

### Work item types and statuses

${renderDiscoveredTypes(types)}

### Boards and columns

${renderDiscoveredBoards(boards)}

## What to do

1. Read and understand the data above — the real statuses per work item type, and the real board columns each status maps into.
2. Explain to the user, in your own words, that Kanbrain maps one skill per status (never per board column) — and that if they think in board columns, multiple statuses sharing a column should simply share the same skill file.
3. Propose a first draft of the real flow step for every status yourself, before asking the user anything: for each status, check which board column it's listed under in the "Boards and columns" section above, and use that column's name directly when it already reads as a clear step name (e.g. a status listed under a "Code Review" column becomes "Code Review"; one under "QA" becomes "QA"). Group statuses that share a column under one skill file.
4. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries — don't make them name every status from scratch. Only fall back to asking open-ended for a status when no board column mapping exists for it, the column name is generic or unhelpful (e.g. "Column 1"), or different boards disagree on its column.
5. Once confirmed, update every entry's \`label\` in \`.kanbrain/config.json\`'s \`skills\` map to the agreed real step name — not the auto-generated \`"Execute {status} skill"\` placeholder Setup fills in by default.
6. For every skill file that stays in use, write real, useful instructions for that flow step into it — not a placeholder. Skill files can use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders, resolved with the real work item's data every time a skill button runs.
7. Once the final mapping is settled, delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` entry pointing at it — don't leave unused skill files behind.
8. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks for that, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
```

- [ ] **Step 3: Run the existing test to verify nothing broke**

Run: `npx vitest run src/skills/buildSetupAssistantFile.test.ts`
Expected: PASS (same tests as before — this is a pure refactor, no behavior change)

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/skills/renderDiscoveredBoardInfo.ts src/skills/buildSetupAssistantFile.ts
git commit -m "refactor: extract renderDiscoveredTypes/renderDiscoveredBoards for reuse"
```

---

### Task 3: Create `renderBrain.ts`

**Files:**
- Create: `src/view/renderBrain.ts`
- Create: `src/view/renderBrain.test.ts`

**Interfaces:**
- Consumes: `renderRepositoriesBody(config: KanbrainConfig): string` (Task 1), `renderConfigEditor(config: KanbrainConfig): string` (existing), `renderProfilesEditor(profiles: Record<string, ProfileEntry>): string` (existing), `RenderState` (existing, from `./render`).
- Produces: `renderBrain(state: RenderState): string` — consumed by `render.ts` in Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/view/renderBrain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderBrain } from './renderBrain';
import type { RenderState } from './render';
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

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'brain',
    ...overrides,
  };
}

describe('renderBrain', () => {
  it('shows Repositories, Skills, and Profiles section titles in that order', () => {
    const html = renderBrain(state());
    const repositoriesIndex = html.indexOf('Repositories');
    const skillsIndex = html.indexOf('Skills');
    const profilesIndex = html.indexOf('>Profiles<');

    expect(repositoriesIndex).toBeGreaterThanOrEqual(0);
    expect(skillsIndex).toBeGreaterThan(repositoriesIndex);
    expect(profilesIndex).toBeGreaterThan(skillsIndex);
  });

  it('gives each segment a "Configure with AI" button tagged with the right data-segment', () => {
    const html = renderBrain(state());
    expect(html).toContain('data-action="run-segment-ai" data-segment="repositories"');
    expect(html).toContain('data-action="run-segment-ai" data-segment="skills"');
    expect(html).toContain('data-action="run-segment-ai" data-segment="profiles"');
  });

  it('gives each segment a collapse toggle with a chevron', () => {
    const html = renderBrain(state());
    expect(html.split('data-action="toggle-group"').length - 1).toBe(3);
    expect(html.split('kb-chevron').length - 1).toBe(3);
  });

  it('wraps each segment body in kb-collapsible-body', () => {
    const html = renderBrain(state());
    expect(html.split('kb-collapsible-body').length - 1).toBe(3);
  });

  it('renders repository rows in the Repositories segment', () => {
    const html = renderBrain(state({ config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } } }) }));
    expect(html).toContain('data-repository-id="repo-1"');
  });

  it('renders skill type groups in the Skills segment', () => {
    const html = renderBrain(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Task"');
  });

  it('renders profile rows in the Profiles segment', () => {
    const html = renderBrain(state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } } }) }));
    expect(html).toContain('data-profile-id="developer"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderBrain.test.ts`
Expected: FAIL — `./renderBrain` module does not exist.

- [ ] **Step 3: Create `renderBrain.ts`**

Create `src/view/renderBrain.ts`:

```ts
import type { RenderState } from './render';
import { renderRepositoriesBody } from './renderRepositories';
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';

function renderSegment(title: string, segment: string, body: string): string {
  return `
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">
        <button type="button" class="kb-parent-header-toggle" data-action="toggle-group">
          <span><span class="kb-chevron">▾</span>${title}</span>
        </button>
        <button type="button" class="kb-secondary-btn" data-action="run-segment-ai" data-segment="${segment}">✨ Configure with AI</button>
      </div>
      <div class="kb-collapsible-body">
        ${body}
      </div>
    </div>
  `;
}

export function renderBrain(state: RenderState): string {
  const config = state.config!;
  return [
    renderSegment('Repositories', 'repositories', renderRepositoriesBody(config)),
    renderSegment('Skills', 'skills', renderConfigEditor(config)),
    renderSegment('Profiles', 'profiles', renderProfilesEditor(config.profiles ?? {})),
  ].join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderBrain.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/view/renderBrain.ts src/view/renderBrain.test.ts
git commit -m "feat: add renderBrain with collapsible Repositories/Skills/Profiles segments"
```

---

### Task 4: Wire the "brain" screen into navigation

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Modify: `src/view/renderFooter.ts`
- Modify: `src/view/renderFooter.test.ts`
- Modify: `src/view/renderHome.test.ts`
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/commands/resolveRepositoryTag.ts`

**Interfaces:**
- Consumes: `renderBrain(state: RenderState): string` (Task 3).
- Produces: `RenderState.screen` union now includes `'brain'` instead of `'repositories'`; `KanbrainViewProvider.showBrainScreen(): void` (renamed from `showRepositoriesScreen`) — consumed by `resolveRepositoryTag.ts` and, from Task 6 onward, nothing else needs to know about the old name.

This task **must be done as one unit** — `render.ts`'s `RenderState.screen` union and `KanbrainViewProvider.ts`'s `currentScreen` field type both list the same screen names; changing one without the other breaks `npm run compile` (the property assignment `screen: this.currentScreen` at the two `render(...)` call sites in `KanbrainViewProvider.ts` would fail to typecheck).

- [ ] **Step 1: Update `render.ts`**

In `src/view/render.ts`, replace the import:

```ts
import { renderRepositories } from './renderRepositories';
```

with:

```ts
import { renderBrain } from './renderBrain';
```

Replace the `RenderState.screen` type:

```ts
  screen: 'home' | 'flow' | 'config' | 'repositories';
```

with:

```ts
  screen: 'home' | 'flow' | 'config' | 'brain';
```

Replace the `'repositories'` branch:

```ts
  if (state.screen === 'repositories') {
    return `${renderRepositories(state)}${renderSearchDialog()}${renderFooter(state)}`;
  }
```

with:

```ts
  if (state.screen === 'brain') {
    return `${renderBrain(state)}${renderSearchDialog()}${renderFooter(state)}`;
  }
```

- [ ] **Step 2: Update `render.test.ts`**

Change the screen array in the "appends the footer on every configured screen" test:

```ts
  it('appends the footer on every configured screen', () => {
    for (const screen of ['home', 'flow', 'config', 'brain'] as const) {
      const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen });
      expect(html).toContain('kb-footer');
    }
  });
```

Add a new test right after the "delegates to the config screen when screen is 'config'" test:

```ts
  it('delegates to the brain screen when screen is "brain"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'brain' });
    expect(html).toContain('data-action="run-segment-ai"');
  });
```

- [ ] **Step 3: Run `render.test.ts` to verify it passes**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (all tests, including the two just changed/added)

- [ ] **Step 4: Update `renderFooter.ts`**

In `src/view/renderFooter.ts`, replace:

```ts
      <button id="kb-show-repositories-btn" class="${footerBtnClass(state.screen === 'repositories')}" title="Repositories">📁</button>
```

with:

```ts
      <button id="kb-show-brain-btn" class="${footerBtnClass(state.screen === 'brain')}" title="Brain">🧠</button>
```

- [ ] **Step 5: Update `renderFooter.test.ts`**

Replace the test at line 64:

```ts
  it('shows a Brain button and a Configuration button', () => {
    const html = renderFooter(state());
    expect(html).toContain('id="kb-show-brain-btn"');
    expect(html).toContain('id="kb-show-config-btn"');
  });
```

Replace the ordering test:

```ts
  it('orders icons as: home, work item, brain, check, sync, then configuration at the end', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const homeIndex = html.indexOf('id="kb-home-btn"');
    const workItemIndex = html.indexOf('id="kb-footer-work-item-btn"');
    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');
    const syncIndex = html.indexOf('id="kb-run-sync-board-config-btn"');
    const configIndex = html.indexOf('id="kb-show-config-btn"');

    expect(homeIndex).toBeGreaterThanOrEqual(0);
    expect(workItemIndex).toBeGreaterThan(homeIndex);
    expect(brainIndex).toBeGreaterThan(workItemIndex);
    expect(checkIndex).toBeGreaterThan(brainIndex);
    expect(syncIndex).toBeGreaterThan(checkIndex);
    expect(configIndex).toBeGreaterThan(syncIndex);
  });
```

Replace the divider test:

```ts
  it('puts a divider between the navigation icons (work item, brain) and the command icons (check, sync)', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const dividerIndex = html.indexOf('kb-footer-divider');
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');

    expect(dividerIndex).toBeGreaterThan(brainIndex);
    expect(checkIndex).toBeGreaterThan(dividerIndex);
  });
```

Replace the active-icon test:

```ts
  it('marks the brain icon as active on the Brain screen', () => {
    const html = renderFooter(state({ screen: 'brain' }));
    const btnStart = html.indexOf('id="kb-show-brain-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });
```

- [ ] **Step 6: Update `renderHome.test.ts`**

Replace the one matching line:

```ts
    expect(html).not.toContain('id="kb-show-brain-btn"');
```

(was `expect(html).not.toContain('id="kb-show-repositories-btn"');`)

- [ ] **Step 7: Run the footer/home tests to verify they pass**

Run: `npx vitest run src/view/renderFooter.test.ts src/view/renderHome.test.ts`
Expected: PASS

- [ ] **Step 8: Update `KanbrainViewProvider.ts` — screen type, message handler, method rename**

Replace the field declaration:

```ts
  private currentScreen: 'home' | 'flow' | 'config' | 'repositories' = 'home';
```

with:

```ts
  private currentScreen: 'home' | 'flow' | 'config' | 'brain' = 'home';
```

Replace the message handler branch:

```ts
      } else if (message.type === 'show-repositories') {
        this.showRepositoriesScreen();
```

with:

```ts
      } else if (message.type === 'show-brain') {
        this.showBrainScreen();
```

Replace the method:

```ts
  showRepositoriesScreen(): void {
    this.currentScreen = 'repositories';
    this.lastState = '';
    void this.refresh();
  }
```

with:

```ts
  showBrainScreen(): void {
    this.currentScreen = 'brain';
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 9: Update `KanbrainViewProvider.ts` — webview click handler**

Replace:

```js
      } else if (target.id === 'kb-show-repositories-btn') {
        vscode.postMessage({ type: 'show-repositories' });
```

with:

```js
      } else if (target.id === 'kb-show-brain-btn') {
        vscode.postMessage({ type: 'show-brain' });
```

- [ ] **Step 10: Update `KanbrainViewProvider.ts` — toggle-group closest-fallback**

The Brain page's segment header now contains two sibling buttons (the collapse toggle and "Configure with AI"), so the toggle's `nextElementSibling` is the AI button, not the collapsible body — the actual body is the *header container's* next sibling. Replace:

```js
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
        const toggle = target.closest('[data-action="toggle-group"]');
        const items = toggle.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
        if (toggle.dataset.section) {
          vscode.postMessage({ type: 'toggle-section', section: toggle.dataset.section });
        }
```

with:

```js
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
        const toggle = target.closest('[data-action="toggle-group"]');
        const container = toggle.closest('.kb-config-parent-header') || toggle;
        const items = container.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
        if (toggle.dataset.section) {
          vscode.postMessage({ type: 'toggle-section', section: toggle.dataset.section });
        }
```

This is backward-compatible: for the Flow screen's Parent/Children toggles and the Skill/Global-Skill config groups, `toggle.closest('.kb-config-parent-header')` returns `null` (none of those buttons live inside a `.kb-config-parent-header`), so `container` falls back to `toggle` itself — identical behavior to before.

- [ ] **Step 11: Update `KanbrainViewProvider.ts` — CSS**

Replace the `.kb-config-parent-header` rule:

```css
      .kb-config-parent-header { font-size: 13px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 8px; }
```

with:

```css
      .kb-config-parent-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 8px; }
      .kb-parent-header-toggle { appearance: none; -webkit-appearance: none; border: none; background: transparent; padding: 0; cursor: pointer; display: flex; align-items: center; font: inherit; color: inherit; }
      .kb-config-parent-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
```

(The existing "Project"/"Display" section headers in `renderConfig.ts` use `.kb-config-parent-header` with a single plain-text child — adding `display: flex; justify-content: space-between` to a container with one child doesn't change how it looks, so this is safe there.)

- [ ] **Step 12: Update `resolveRepositoryTag.ts`**

Replace:

```ts
      provider.showRepositoriesScreen();
```

with:

```ts
      provider.showBrainScreen();
```

- [ ] **Step 13: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 14: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 15: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/renderFooter.ts src/view/renderFooter.test.ts src/view/renderHome.test.ts src/view/KanbrainViewProvider.ts src/commands/resolveRepositoryTag.ts
git commit -m "feat: replace the Repositories screen with the Brain screen"
```

---

### Task 5: Trim `renderConfig.ts` down to Project + Display

**Files:**
- Modify: `src/view/renderConfig.ts`
- Modify: `src/view/renderConfig.test.ts`

**Interfaces:**
- No new interfaces — this only removes the now-duplicated Profiles/Skill Configuration sections (they live in `renderBrain.ts` since Task 3/4).

- [ ] **Step 1: Update `renderConfig.test.ts`**

Replace the full contents of `src/view/renderConfig.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { renderConfig } from './renderConfig';
import type { RenderState } from './render';
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

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'config',
    ...overrides,
  };
}

describe('renderConfig', () => {
  it('does not show its own Home button (that lives in the footer now)', () => {
    const html = renderConfig(state());
    expect(html).not.toContain('id="kb-home-btn"');
  });

  it('shows Setup and Configure with AI buttons in a Project section', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-run-setup-btn"');
    expect(html).toContain('id="kb-run-configure-ai-btn"');
    expect(html).toContain('>Project<');
  });

  it('shows a "Show assignee in search results" checkbox, checked by default', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-show-assignee-toggle"');
    expect(html).toContain('Show assignee in search results');
    expect(html).toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('unchecks the checkbox when showAssignedTo is false', () => {
    const html = renderConfig(state({ config: config({ showAssignedTo: false }) }));
    expect(html).not.toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('wraps the Display label and assignee checkbox in a bordered section card', () => {
    const html = renderConfig(state());

    const cardIndex = html.indexOf('kb-section-card');
    const labelIndex = html.indexOf('>Display<');
    const checkboxIndex = html.indexOf('id="kb-show-assignee-toggle"');

    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThan(cardIndex);
    expect(checkboxIndex).toBeGreaterThan(labelIndex);
  });

  it('does not show a team selector — it lives on the Home screen instead', () => {
    const html = renderConfig(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );
    expect(html).not.toContain('id="kb-team-select"');
  });

  it('does not show Skill Configuration or Profiles — they live on the Brain screen now', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } }, profiles: { developer: { label: 'Developer', description: 'x' } } }) }));
    expect(html).not.toContain('Skill Configuration');
    expect(html).not.toContain('data-level="Task"');
    expect(html).not.toContain('data-profile-id="developer"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — the last test fails because `renderConfig` still renders Skill Configuration/Profiles.

- [ ] **Step 3: Rewrite `renderConfig.ts`**

Replace the full contents of `src/view/renderConfig.ts` with:

```ts
import type { RenderState } from './render';

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Project</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-configure-ai-btn" class="kb-secondary-btn">✨ Configure with AI</button>
      </div>
    </div>
    <div class="kb-section-card">
      <div class="kb-section-label">Display</div>
      <label class="kb-checkbox-row">
        <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
        Show assignee in search results
      </label>
    </div>
  `;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full test suite and compiler**

Run: `npx vitest run && npm run compile`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "refactor: remove Skill Configuration and Profiles from the Configuration screen"
```

---

### Task 6: Wire the `run-segment-ai` message in `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `data-action="run-segment-ai"` / `data-segment="repositories" | "skills" | "profiles"` buttons rendered by `renderBrain.ts` (Task 3).
- Produces: `private runSegmentAi(segment: string): Promise<void>` — calls `vscode.commands.executeCommand('kanbrain.configureRepositoriesWithAi' | 'kanbrain.configureSkillsWithAi' | 'kanbrain.configureProfilesWithAi')`. These three commands don't exist until Tasks 8, 10, and 12 register them — until then, clicking an AI button in a running Extension Development Host shows VS Code's "command not found" error. This is expected and resolves once those tasks land; there's no unit test for this method (same precedent as the rest of this file's `vscode` glue), so nothing here fails automated verification in the meantime.

- [ ] **Step 1: Add the message handler branch**

In `src/view/KanbrainViewProvider.ts`, in the `onDidReceiveMessage` handler, replace:

```ts
      } else if (message.type === 'toggle-section') {
        this.toggleSection(String(message.section ?? ''));
      }
```

with:

```ts
      } else if (message.type === 'toggle-section') {
        this.toggleSection(String(message.section ?? ''));
      } else if (message.type === 'run-segment-ai') {
        await this.runSegmentAi(String(message.segment ?? ''));
      }
```

- [ ] **Step 2: Add the `runSegmentAi` method**

Add this method right after `private toggleSection(section: string): void { ... }`:

```ts
  private async runSegmentAi(segment: string): Promise<void> {
    const commandBySegment: Record<string, string> = {
      repositories: 'kanbrain.configureRepositoriesWithAi',
      skills: 'kanbrain.configureSkillsWithAi',
      profiles: 'kanbrain.configureProfilesWithAi',
    };
    const command = commandBySegment[segment];
    if (!command) {
      return;
    }
    await vscode.commands.executeCommand(command);
    this.notifyCommandFinished();
  }
```

- [ ] **Step 3: Add the webview click handler**

In the inline `<script>`'s click delegate, replace:

```js
      } else if (target.dataset && target.dataset.action === 'add-profile') {
        vscode.postMessage({ type: 'add-profile' });
```

with:

```js
      } else if (target.dataset && target.dataset.action === 'run-segment-ai') {
        setLoading(target);
        vscode.postMessage({ type: 'run-segment-ai', segment: target.dataset.segment });
      } else if (target.dataset && target.dataset.action === 'add-profile') {
        vscode.postMessage({ type: 'add-profile' });
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (no new tests in this task — pure `vscode` glue, per the Global Constraints)

- [ ] **Step 6: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire the Brain page's per-segment Configure with AI buttons to a command dispatcher"
```

---

### Task 7: `buildRepositoriesAssistantFile.ts`

**Files:**
- Create: `src/skills/buildRepositoriesAssistantFile.ts`
- Create: `src/skills/buildRepositoriesAssistantFile.test.ts`

**Interfaces:**
- Consumes: `RepositoryPathEntry` (`../types`, existing: `{ name: string; path: string }`).
- Produces: `buildRepositoriesAssistantContent(organization: string, project: string, repositories: Record<string, RepositoryPathEntry>): string` — consumed by `configureRepositoriesWithAi.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/skills/buildRepositoriesAssistantFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRepositoriesAssistantContent } from './buildRepositoriesAssistantFile';

describe('buildRepositoriesAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('lists a repository with a local path under "found locally"', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {
      'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' },
    });
    const foundIndex = content.indexOf('Repositories found locally');
    const notFoundIndex = content.indexOf('Repositories NOT found locally');
    const entryIndex = content.indexOf('kanbrain');

    expect(entryIndex).toBeGreaterThan(foundIndex);
    expect(entryIndex).toBeLessThan(notFoundIndex);
    expect(content).toContain('C:\\repos\\kanbrain');
  });

  it('lists a repository with no local path under "NOT found locally"', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {
      'repo-1': { name: 'other-repo', path: '' },
    });
    const notFoundIndex = content.indexOf('Repositories NOT found locally');
    const entryIndex = content.indexOf('other-repo');

    expect(entryIndex).toBeGreaterThan(notFoundIndex);
  });

  it('instructs the agent not to run git clone itself', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('Do not run `git clone` yourself.');
  });

  it('scopes the agent to repositories only', () => {
    const content = buildRepositoriesAssistantContent('my-org', 'MyProject', {});
    expect(content).toContain('repositories only');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/skills/buildRepositoriesAssistantFile.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `buildRepositoriesAssistantFile.ts`**

Create `src/skills/buildRepositoriesAssistantFile.ts`:

```ts
import type { RepositoryPathEntry } from '../types';

export function buildRepositoriesAssistantContent(
  organization: string,
  project: string,
  repositories: Record<string, RepositoryPathEntry>,
): string {
  const entries = Object.entries(repositories);
  const matched = entries.filter(([, entry]) => entry.path);
  const missing = entries.filter(([, entry]) => !entry.path);

  const matchedLines = matched.length
    ? matched.map(([id, entry]) => `- **${entry.name}** (id: \`${id}\`) → \`${entry.path}\``).join('\n')
    : '_None found locally._';
  const missingLines = missing.length
    ? missing.map(([id, entry]) => `- **${entry.name}** (id: \`${id}\`)`).join('\n')
    : '_None — every repository is already mapped to a local folder._';

  return `# Kanbrain Repositories Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## Scope

This file is scoped to **repositories only** — don't touch \`.kanbrain/config.json\`'s \`skills\`, \`globalSkills\`, or \`profiles\` while following it.

## Repositories found locally

${matchedLines}

## Repositories NOT found locally

${missingLines}

## What to do

1. For every repository listed under "Repositories found locally", make sure \`.kanbrain/config.json\`'s \`repositories\` entry for that id has \`path\` set to the local folder shown above (it likely already is — this file was generated from the same detection Kanbrain's Sync command uses).
2. For every repository listed under "Repositories NOT found locally", tell the user it isn't cloned anywhere Kanbrain could find and suggest they clone it — either with the "Clone" button on the Repositories segment of the Brain page, or manually. Do not run \`git clone\` yourself.
3. Don't rename, add, or remove repository entries — the list comes from the real Azure DevOps project, refreshed by Kanbrain: Sync Board Configuration.
`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/skills/buildRepositoriesAssistantFile.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/buildRepositoriesAssistantFile.ts src/skills/buildRepositoriesAssistantFile.test.ts
git commit -m "feat: add buildRepositoriesAssistantContent"
```

---

### Task 8: `configureRepositoriesWithAi` command

**Files:**
- Create: `src/commands/configureRepositoriesWithAi.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildRepositoriesAssistantContent` (Task 7), `discoverLocalRepositories(workspaceRoot: string, maxDepth?: number): Promise<Map<string, string>>` (existing, `../git/discoverLocalRepositories`), `matchRepositoriesToLocalPaths(azureRepos: {id,name}[], localRepos: Map<string,string>): Record<string, RepositoryPathEntry>` (existing, `../config/matchRepositoriesToLocalPaths`), `client.listRepositories(organization, project): Promise<{id,name}[]>` (existing), `readConfig`/`DEFAULT_REPO_SCAN_DEPTH` (existing, `../config/config`), `writeGeneratedFile` (existing), `sendReadCommand` (existing).
- Produces: registers VS Code command `kanbrain.configureRepositoriesWithAi`, consumed by `runSegmentAi` (Task 6, already wired) and by `package.json`'s command palette entry.

No dedicated test file for this task — see Global Constraints (same precedent as `configureWithAi.ts`).

- [ ] **Step 1: Create `configureRepositoriesWithAi.ts`**

Create `src/commands/configureRepositoriesWithAi.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverLocalRepositories } from '../git/discoverLocalRepositories';
import { matchRepositoriesToLocalPaths } from '../config/matchRepositoriesToLocalPaths';
import { buildRepositoriesAssistantContent } from '../skills/buildRepositoriesAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig, DEFAULT_REPO_SCAN_DEPTH } from '../config/config';

export async function configureRepositoriesWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const azureRepos = await client.listRepositories(config.organization, config.project);
    const repoScanDepth = Math.max(1, config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH);
    const localRepos = await discoverLocalRepositories(workspaceRoot, repoScanDepth);
    const repositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
    content = buildRepositoriesAssistantContent(config.organization, config.project, repositories);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's repositories: ${message}`);
    return;
  }

  const fileName = `repositories-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureRepositoriesWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureRepositoriesWithAi', () => configureRepositoriesWithAi(client, workspaceRoot));
}
```

- [ ] **Step 2: Register the command in `extension.ts`**

Add the import, next to the other command imports:

```ts
import { registerConfigureRepositoriesWithAiCommand } from './commands/configureRepositoriesWithAi';
```

Add the registration, in the `context.subscriptions.push(...)` block, right after `registerConfigureWithAiCommand(client, workspaceRoot),`:

```ts
    registerConfigureRepositoriesWithAiCommand(client, workspaceRoot),
```

- [ ] **Step 3: Add the command palette entry in `package.json`**

In the `contributes.commands` array, right after the `kanbrain.configureWithAi` entry, add:

```json
      { "command": "kanbrain.configureRepositoriesWithAi", "title": "Kanbrain: Configure Repositories with AI" },
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/configureRepositoriesWithAi.ts src/extension.ts package.json
git commit -m "feat: add the Configure Repositories with AI command"
```

---

### Task 9: `buildSkillsAssistantFile.ts`

**Files:**
- Create: `src/skills/buildSkillsAssistantFile.ts`
- Create: `src/skills/buildSkillsAssistantFile.test.ts`

**Interfaces:**
- Consumes: `renderDiscoveredTypes`, `renderDiscoveredBoards` (Task 2), `DiscoveredWorkItemType` (`../azureDevOps/discoverWorkItemTypes`, existing), `DiscoveredBoard` (`../azureDevOps/discoverBoardColumns`, existing).
- Produces: `buildSkillsAssistantContent(organization: string, project: string, types: DiscoveredWorkItemType[], boards: DiscoveredBoard[]): string` — consumed by `configureSkillsWithAi.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `src/skills/buildSkillsAssistantFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSkillsAssistantContent } from './buildSkillsAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function types(): DiscoveredWorkItemType[] {
  return [{ name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] }];
}

describe('buildSkillsAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('includes each work item type and status with its category', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('### User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      { name: 'MyProject Team Board', columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }] },
    ];
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), boards);
    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
  });

  it('instructs the agent to run Sync Board Configuration first, before the rest of the steps', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('Kanbrain: Sync Board Configuration');
    expect(content.indexOf('Step 0')).toBeLessThan(content.indexOf('What to do'));
  });

  it('mentions Definition of Done', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('Definition of Done');
  });

  it('scopes the agent to skills only', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('skills only');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/skills/buildSkillsAssistantFile.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `buildSkillsAssistantFile.ts`**

Create `src/skills/buildSkillsAssistantFile.ts`:

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';
import { renderDiscoveredTypes, renderDiscoveredBoards } from './renderDiscoveredBoardInfo';

export function buildSkillsAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Skills Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## Scope

This file is scoped to **skills only** — don't touch \`.kanbrain/config.json\`'s \`repositories\` or \`profiles\` while following it.

## Step 0 — sync first

Run the **Kanbrain: Sync Board Configuration** command yourself before doing anything else, so the statuses/types below are guaranteed fresh. Skip this only if you already ran it moments before this file was generated.

## This project's real configuration

### Work item types and statuses

${renderDiscoveredTypes(types)}

### Boards and columns

${renderDiscoveredBoards(boards)}

## What to do

1. Kanbrain maps one skill per status, per work item type (\`.kanbrain/config.json\`'s \`skills\`) — never per board column. If multiple statuses share a board column, point them at the same skill file.
2. Propose a first draft of the real flow step for every status yourself: for each status, check which board column it's listed under above, and use that column's name when it reads as a clear step name. Group statuses that share a column under one skill file.
3. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries.
4. Once confirmed, update every entry's \`label\` in \`.kanbrain/config.json\`'s \`skills\` map to the agreed real step name.
5. Before writing each skill file's real instructions, think through a concrete **Definition of Done** for a card sitting in that status — what "finished with this step" actually looks like for that kind of work item. You don't need to write the DoD down anywhere structured; use it purely to decide what the skill file should ask the agent working that card to actually verify or do. Skill files can use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders.
6. Delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` entry pointing at it.
7. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/skills/buildSkillsAssistantFile.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/buildSkillsAssistantFile.ts src/skills/buildSkillsAssistantFile.test.ts
git commit -m "feat: add buildSkillsAssistantContent"
```

---

### Task 10: `configureSkillsWithAi` command

**Files:**
- Create: `src/commands/configureSkillsWithAi.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildSkillsAssistantContent` (Task 9), `discoverWorkItemTypes` (existing, `../azureDevOps/discoverWorkItemTypes`), `discoverBoardColumns` (existing, `../azureDevOps/discoverBoardColumns`), `client.getDefaultTeamName(organization, project): Promise<string>` (existing).
- Produces: registers VS Code command `kanbrain.configureSkillsWithAi`.

No dedicated test file for this task — see Global Constraints.

- [ ] **Step 1: Create `configureSkillsWithAi.ts`**

Create `src/commands/configureSkillsWithAi.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { discoverBoardColumns } from '../azureDevOps/discoverBoardColumns';
import { buildSkillsAssistantContent } from '../skills/buildSkillsAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureSkillsWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const types = await discoverWorkItemTypes(client, config.organization, config.project);
    const boards = await discoverBoardColumns(client, config.organization, config.project, team);
    content = buildSkillsAssistantContent(config.organization, config.project, types, boards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's board configuration: ${message}`);
    return;
  }

  const fileName = `skills-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureSkillsWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureSkillsWithAi', () => configureSkillsWithAi(client, workspaceRoot));
}
```

- [ ] **Step 2: Register the command in `extension.ts`**

Add the import:

```ts
import { registerConfigureSkillsWithAiCommand } from './commands/configureSkillsWithAi';
```

Add the registration, right after `registerConfigureRepositoriesWithAiCommand(client, workspaceRoot),`:

```ts
    registerConfigureSkillsWithAiCommand(client, workspaceRoot),
```

- [ ] **Step 3: Add the command palette entry in `package.json`**

Right after the `kanbrain.configureRepositoriesWithAi` entry:

```json
      { "command": "kanbrain.configureSkillsWithAi", "title": "Kanbrain: Configure Skills with AI" },
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/configureSkillsWithAi.ts src/extension.ts package.json
git commit -m "feat: add the Configure Skills with AI command"
```

---

### Task 11: `buildProfilesAssistantFile.ts`

**Files:**
- Create: `src/skills/buildProfilesAssistantFile.ts`
- Create: `src/skills/buildProfilesAssistantFile.test.ts`

**Interfaces:**
- Consumes: `renderDiscoveredTypes` (Task 2), `DiscoveredWorkItemType` (existing), `ProfileEntry` (`../types`, existing: `{ label: string; description: string }`).
- Produces: `buildProfilesAssistantContent(organization: string, project: string, team: string, types: DiscoveredWorkItemType[], profiles: Record<string, ProfileEntry>): string` — consumed by `configureProfilesWithAi.ts` (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/skills/buildProfilesAssistantFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildProfilesAssistantContent } from './buildProfilesAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';

function types(): DiscoveredWorkItemType[] {
  return [{ name: 'Bug', color: 'b2b2b2', iconSvg: '', states: [] }];
}

describe('buildProfilesAssistantContent', () => {
  it('includes the organization, project, and team', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
    expect(content).toContain('MyProject Team');
  });

  it('lists already configured profiles with id, label, and description', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {
      developer: { label: 'Developer', description: 'I am a developer.' },
    });
    expect(content).toContain('Developer');
    expect(content).toContain('developer');
    expect(content).toContain('I am a developer.');
  });

  it('shows a fallback message when there are no profiles configured yet', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('No profiles configured yet.');
  });

  it('includes the real work item types', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('### Bug');
  });

  it('instructs the agent to confirm with the user before writing anything', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('ask them to confirm before writing anything');
  });

  it('scopes the agent to profiles only', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('profiles only');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/skills/buildProfilesAssistantFile.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `buildProfilesAssistantFile.ts`**

Create `src/skills/buildProfilesAssistantFile.ts`:

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { ProfileEntry } from '../types';
import { renderDiscoveredTypes } from './renderDiscoveredBoardInfo';

function renderExistingProfiles(profiles: Record<string, ProfileEntry>): string {
  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    return '_No profiles configured yet._';
  }
  return entries.map(([id, entry]) => `- **${entry.label}** (id: \`${id}\`): ${entry.description}`).join('\n');
}

export function buildProfilesAssistantContent(
  organization: string,
  project: string,
  team: string,
  types: DiscoveredWorkItemType[],
  profiles: Record<string, ProfileEntry>,
): string {
  return `# Kanbrain Profiles Assistant

Organization: \`${organization}\`
Project: \`${project}\`
Team: \`${team}\`

## Scope

This file is scoped to **profiles only** — don't touch \`.kanbrain/config.json\`'s \`skills\`, \`globalSkills\`, or \`repositories\` while following it.

## What a profile is

\`.kanbrain/config.json\`'s \`profiles\` map holds labeled personas (\`label\` + \`description\`). Whichever one is selected on the Home screen gets its \`description\` prepended to every skill-generated context file — it's how Kanbrain tells you (the agent) who's asking, e.g. "I am a QA, prioritize test scenarios."

## Already configured

${renderExistingProfiles(profiles)}

## This project's real work item types

${renderDiscoveredTypes(types)}

## What to do

1. Look at the real work item types above and the \`${team}\` team's board. Decide whether the existing profiles are enough or whether this team has a distinct role not covered by them (e.g. a dedicated work item type suggests a role that doesn't fit any current profile).
2. Propose any new profile or adjusted description to the user in one message, explain your reasoning, and ask them to confirm before writing anything.
3. Once confirmed, add or update entries in \`.kanbrain/config.json\`'s \`profiles\` map (\`label\` + \`description\` only) for whatever was agreed. Don't remove existing profiles unless the user explicitly asks.
`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/skills/buildProfilesAssistantFile.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/buildProfilesAssistantFile.ts src/skills/buildProfilesAssistantFile.test.ts
git commit -m "feat: add buildProfilesAssistantContent"
```

---

### Task 12: `configureProfilesWithAi` command

**Files:**
- Create: `src/commands/configureProfilesWithAi.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildProfilesAssistantContent` (Task 11), `discoverWorkItemTypes` (existing), `client.getDefaultTeamName` (existing).
- Produces: registers VS Code command `kanbrain.configureProfilesWithAi`.

No dedicated test file for this task — see Global Constraints.

- [ ] **Step 1: Create `configureProfilesWithAi.ts`**

Create `src/commands/configureProfilesWithAi.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { buildProfilesAssistantContent } from '../skills/buildProfilesAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureProfilesWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const types = await discoverWorkItemTypes(client, config.organization, config.project);
    content = buildProfilesAssistantContent(config.organization, config.project, team, types, config.profiles ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's work item types: ${message}`);
    return;
  }

  const fileName = `profiles-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureProfilesWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureProfilesWithAi', () => configureProfilesWithAi(client, workspaceRoot));
}
```

- [ ] **Step 2: Register the command in `extension.ts`**

Add the import:

```ts
import { registerConfigureProfilesWithAiCommand } from './commands/configureProfilesWithAi';
```

Add the registration, right after `registerConfigureSkillsWithAiCommand(client, workspaceRoot),`:

```ts
    registerConfigureProfilesWithAiCommand(client, workspaceRoot),
```

- [ ] **Step 3: Add the command palette entry in `package.json`**

Right after the `kanbrain.configureSkillsWithAi` entry:

```json
      { "command": "kanbrain.configureProfilesWithAi", "title": "Kanbrain: Configure Profiles with AI" },
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npm run compile`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/configureProfilesWithAi.ts src/extension.ts package.json
git commit -m "feat: add the Configure Profiles with AI command"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npx vitest run && npm run compile`
Expected: all tests pass, no compile errors

- [ ] **Step 2: Manual smoke test in the Extension Development Host**

Press F5 to launch the Extension Development Host against a workspace with `.kanbrain/config.json` already configured, then verify:
- The footer's 📁 icon is now 🧠 ("Brain"), and clicking it opens a screen with three sections: Repositories, Skills, Profiles.
- Each section's chevron collapses/expands only that section's body (not the "Configure with AI" button next to it).
- Each section's "✨ Configure with AI" button is clickable and doesn't throw a "command not found" error (all three commands were registered in Tasks 8/10/12).
- Clicking each "✨ Configure with AI" button writes a new file under `.kanbrain/generated/` (`repositories-assistant-*.md`, `skills-assistant-*.md`, or `profiles-assistant-*.md`) and opens/reuses the "Kanbrain" integrated terminal with a "Read the file ... and follow the instructions in it." command.
- The Configuration screen (⚙️ icon) now only shows "Project" and "Display" — no Profiles or Skill Configuration.
- Editing a skill/profile/repository row on the Brain screen still saves correctly (blur-to-save behavior unchanged).

This step has no automated pass/fail — note anything unexpected and file it as a follow-up rather than blocking the plan on it.
