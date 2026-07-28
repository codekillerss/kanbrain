# Profiles Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full create/edit/remove editor for `config.profiles` on the Configuration screen, mirroring the existing "Global Skills" editor, so profiles no longer require hand-editing `.kanbrain/config.json`.

**Architecture:** A new pure render function (`renderProfilesEditor`) produces one collapsible row per profile (label input + description textarea + remove button) plus an always-visible "+ Add profile" button, placed in its own "Profiles" parent section on the Configuration screen, before "Skill Configuration". `KanbrainViewProvider.ts` gets three new methods (`addProfile`/`saveProfileEntry`/`removeProfile`) mirroring the existing global-skill methods field-for-field, wired through three new webview message types and two new click-delegate branches. The existing `saveSkillRow` webview function gets a third branch for profile rows — and, in the same change, a bug fix: it currently reads `path`/`textColor`/`buttonColor` unconditionally before branching, which would crash (`null.value`) on a profile row that has neither field in its DOM.

**Tech Stack:** TypeScript, VS Code Extension API, vitest.

Full design: `docs/superpowers/specs/2026-07-28-profiles-editor-design.md`.

## Global Constraints

- Profile rows use the same visual/DOM conventions as global skill rows (`.kb-config-level`, `.kb-config-row`, `.kb-config-level-header` with `data-action="toggle-group"`), distinguished by `data-profile-id` instead of `data-global-skill-id`.
- The "Profiles" section is always visible on the Configuration screen, even with zero profiles (matches "Global Skills", not the "No work item types configured yet." empty state of status skills).
- A new profile is created with `id = \`profile-${Date.now()}\`` and empty `label`/`description` — same scheme as `addGlobalSkill`'s `global-skill-${Date.now()}`.
- No validation: empty `label`/`description` are allowed (matches empty `path` being allowed on skill entries today). An empty-label row's collapsed header falls back to the literal text "New profile".
- Removing a profile that is someone's locally-selected `selectedProfileId` needs no special handling — `resolveActiveProfile` (existing, from the prior profiles feature) already returns `null` for an id that no longer resolves.
- Follow TDD for the one pure/testable unit (`renderProfilesEditor`) and for the `renderConfig.ts` wiring test. The `KanbrainViewProvider.ts` changes are VS Code webview glue with no existing unit-test coverage anywhere else in this file — no new test is added for them, consistent with that precedent; correctness there is verified by the full suite, `tsc`, and a manual F5 pass.

---

### Task 1: `renderProfilesEditor` (pure render function)

**Files:**
- Create: `src/view/renderProfilesEditor.ts`
- Test: `src/view/renderProfilesEditor.test.ts`

**Interfaces:**
- Consumes: `ProfileEntry` (existing, from `src/types.ts`), `escapeHtml` (existing, from `./escapeHtml`)
- Produces: `renderProfilesEditor(profiles: Record<string, ProfileEntry>): string`

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderProfilesEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderProfilesEditor } from './renderProfilesEditor';
import type { ProfileEntry } from '../types';

describe('renderProfilesEditor', () => {
  it('shows the Profiles header and Add button even when there are no profiles', () => {
    const html = renderProfilesEditor({});

    expect(html).toContain('Profiles');
    expect(html).toContain('data-action="add-profile"');
    expect(html).toContain('+ Add profile');
  });

  it('renders one row per profile with data-profile-id and the label/description values', () => {
    const profiles: Record<string, ProfileEntry> = {
      developer: { label: 'Developer', description: 'I am a developer.' },
      qa: { label: 'QA', description: 'I am responsible for quality.' },
    };
    const html = renderProfilesEditor(profiles);

    expect(html).toContain('data-profile-id="developer"');
    expect(html).toContain('data-field="label" placeholder="Label" value="Developer"');
    expect(html).toContain('I am a developer.');
    expect(html).toContain('data-profile-id="qa"');
    expect(html).toContain('data-field="label" placeholder="Label" value="QA"');
    expect(html).toContain('I am responsible for quality.');
  });

  it('shows "New profile" as the collapsed header when label is empty', () => {
    const html = renderProfilesEditor({ 'profile-1': { label: '', description: '' } });
    expect(html).toContain('New profile');
  });

  it('shows a remove button per row with the matching data-profile-id', () => {
    const html = renderProfilesEditor({ developer: { label: 'Developer', description: 'x' } });

    expect(html).toContain('data-action="remove-profile"');
    expect(html).toMatch(/data-action="remove-profile" data-profile-id="developer"/);
  });

  it('escapes HTML in id, label, and description', () => {
    const html = renderProfilesEditor({ '<id>': { label: '<Dev>', description: '<script>alert(1)</script>' } });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<id>');
    expect(html).toContain('&lt;id&gt;');
    expect(html).toContain('&lt;Dev&gt;');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderProfilesEditor.test.ts`
Expected: FAIL with a module-not-found error for `./renderProfilesEditor`.

- [ ] **Step 3: Write the implementation**

Create `src/view/renderProfilesEditor.ts`:

```ts
import type { ProfileEntry } from '../types';
import { escapeHtml } from './escapeHtml';

function renderProfileRow(id: string, entry: ProfileEntry): string {
  const label = entry.label ?? '';
  const description = entry.description ?? '';
  const previewLabel = label || 'New profile';

  return `
    <div class="kb-config-level">
      <button type="button" class="kb-config-level-header" data-action="toggle-group">
        <span class="kb-chevron">▾</span>${escapeHtml(previewLabel)}
      </button>
      <div class="kb-config-level-body kb-hidden">
        <div class="kb-config-row" data-profile-id="${escapeHtml(id)}">
          <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
          <textarea class="kb-input kb-textarea" data-field="description" placeholder="Description">${escapeHtml(description)}</textarea>
          <button type="button" class="kb-icon-btn" data-action="remove-profile" data-profile-id="${escapeHtml(id)}" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `;
}

export function renderProfilesEditor(profiles: Record<string, ProfileEntry>): string {
  const rows = Object.entries(profiles)
    .map(([id, entry]) => renderProfileRow(id, entry))
    .join('');
  return `
    <div class="kb-config-level">
      <div class="kb-config-static-header">Profiles</div>
      <div class="kb-config-level-body">
        ${rows}
        <button type="button" class="kb-secondary-btn" data-action="add-profile">+ Add profile</button>
      </div>
    </div>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderProfilesEditor.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderProfilesEditor.ts src/view/renderProfilesEditor.test.ts
git commit -m "feat: add renderProfilesEditor"
```

---

### Task 2: Wire the Profiles section into the Configuration screen

**Files:**
- Modify: `src/view/renderConfig.ts`
- Test: `src/view/renderConfig.test.ts`

**Interfaces:**
- Consumes: `renderProfilesEditor` (from Task 1)

- [ ] **Step 1: Write the failing test**

Add to `src/view/renderConfig.test.ts`, inside the `describe('renderConfig', ...)` block (after the existing "wraps Skill Configuration in a parent section container" test):

```ts
  it('wraps Profiles in its own parent section, before Skill Configuration', () => {
    const html = renderConfig(
      state({ config: config({ profiles: { developer: { label: 'Developer', description: 'x' } }, skills: { Task: { 'To Do': null } } }) }),
    );

    const profilesHeaderIndex = html.indexOf('>Profiles<');
    const profilesRowIndex = html.indexOf('data-profile-id="developer"');
    const skillHeaderIndex = html.indexOf('Skill Configuration');

    expect(profilesHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(profilesRowIndex).toBeGreaterThan(profilesHeaderIndex);
    expect(skillHeaderIndex).toBeGreaterThan(profilesRowIndex);
  });

  it('shows the Profiles section even when there are no profiles configured', () => {
    const html = renderConfig(state());
    expect(html).toContain('>Profiles<');
    expect(html).toContain('data-action="add-profile"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — neither `>Profiles<` nor `data-profile-id="developer"` nor `data-action="add-profile"` appear anywhere in the current output.

- [ ] **Step 3: Write the implementation**

In `src/view/renderConfig.ts`, add the import:

```ts
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';
```

Add a new `kb-config-parent-section` for Profiles, right before the existing "Skill Configuration" one:

```ts
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Profiles</div>
      ${renderProfilesEditor(config.profiles ?? {})}
    </div>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "feat: add Profiles section to the Configuration screen"
```

---

### Task 3: Wire add/save/remove into `KanbrainViewProvider.ts`, fix the `saveSkillRow` field-read bug

No dedicated automated test — this is VS Code webview message-handling glue (same precedent as `addGlobalSkill`/`saveGlobalSkillEntry`/`removeGlobalSkill`, none of which have unit tests). Verified by the full suite staying green, `tsc` staying clean, and a manual F5 check.

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `readConfig`/`writeConfig` (existing), `data-profile-id`/`data-action="add-profile"`/`data-action="remove-profile"` DOM attributes (from Task 1)

- [ ] **Step 1: Add the three backend methods**

In `src/view/KanbrainViewProvider.ts`, add three new methods right after `removeGlobalSkill` (and before `pickGlobalSkillFile`):

```ts
  private addProfile(): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const id = `profile-${Date.now()}`;
    config.profiles = { ...(config.profiles ?? {}), [id]: { label: '', description: '' } };
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private saveProfileEntry(id: string, label: string, description: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.profiles?.[id]) {
      return;
    }
    config.profiles[id] = { label: label.trim(), description: description.trim() };
    writeConfig(this.workspaceRoot, config);
  }

  private removeProfile(id: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.profiles?.[id]) {
      return;
    }
    delete config.profiles[id];
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 2: Add the three message-handler branches**

In `onDidReceiveMessage`, add branches right after the existing `remove-global-skill`/`pick-global-skill-file` ones:

```ts
      } else if (message.type === 'remove-global-skill') {
        this.removeGlobalSkill(String(message.id ?? ''));
      } else if (message.type === 'pick-global-skill-file') {
        await this.pickGlobalSkillFile(String(message.id ?? ''));
      } else if (message.type === 'add-profile') {
        this.addProfile();
      } else if (message.type === 'save-profile-entry') {
        this.saveProfileEntry(String(message.id ?? ''), String(message.label ?? ''), String(message.description ?? ''));
      } else if (message.type === 'remove-profile') {
        this.removeProfile(String(message.id ?? ''));
      } else if (message.type === 'set-show-assigned-to') {
```

(This slots between the existing `pick-global-skill-file` branch and the existing `set-show-assigned-to` branch — keep every other branch in the chain unchanged.)

- [ ] **Step 3: Fix `saveSkillRow` and add the profile branch**

Find the existing `saveSkillRow` function inside the injected `<script>` block:

```js
    function saveSkillRow(row) {
      const path = row.querySelector('[data-field="path"]').value;
      const label = row.querySelector('[data-field="label"]').value;
      const textColor = row.querySelector('[data-field="textColor"]').value;
      const buttonColor = row.querySelector('[data-field="buttonColor"]').value;
      if (row.dataset.globalSkillId) {
        vscode.postMessage({ type: 'save-global-skill-entry', id: row.dataset.globalSkillId, path, label, textColor, buttonColor });
      } else {
        vscode.postMessage({
          type: 'save-skill-entry',
          level: row.dataset.level,
          status: row.dataset.status,
          path,
          label,
          textColor,
          buttonColor,
        });
      }
    }
```

Replace it with (moves `path`/`textColor`/`buttonColor` reads inside the branches that actually have those fields, and adds the profile branch):

```js
    function saveSkillRow(row) {
      const label = row.querySelector('[data-field="label"]').value;
      if (row.dataset.globalSkillId) {
        vscode.postMessage({
          type: 'save-global-skill-entry',
          id: row.dataset.globalSkillId,
          path: row.querySelector('[data-field="path"]').value,
          label,
          textColor: row.querySelector('[data-field="textColor"]').value,
          buttonColor: row.querySelector('[data-field="buttonColor"]').value,
        });
      } else if (row.dataset.profileId) {
        vscode.postMessage({
          type: 'save-profile-entry',
          id: row.dataset.profileId,
          label,
          description: row.querySelector('[data-field="description"]').value,
        });
      } else {
        vscode.postMessage({
          type: 'save-skill-entry',
          level: row.dataset.level,
          status: row.dataset.status,
          path: row.querySelector('[data-field="path"]').value,
          label,
          textColor: row.querySelector('[data-field="textColor"]').value,
          buttonColor: row.querySelector('[data-field="buttonColor"]').value,
        });
      }
    }
```

- [ ] **Step 4: Broaden the blur listener to cover `textarea`**

Find:

```js
    document.querySelectorAll('.kb-config-row input').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });
```

Replace the selector:

```js
    document.querySelectorAll('.kb-config-row input, .kb-config-row textarea').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });
```

- [ ] **Step 5: Add the two click-delegate branches**

Find the existing click delegate branches for global skills:

```js
      } else if (target.dataset && target.dataset.action === 'add-global-skill') {
        vscode.postMessage({ type: 'add-global-skill' });
      } else if (target.dataset && target.dataset.action === 'remove-global-skill') {
        vscode.postMessage({ type: 'remove-global-skill', id: target.dataset.globalSkillId });
      } else if (target.dataset && target.dataset.action === 'toggle-global-skill-menu') {
```

Insert the two new branches right after `remove-global-skill` and before `toggle-global-skill-menu`:

```js
      } else if (target.dataset && target.dataset.action === 'add-global-skill') {
        vscode.postMessage({ type: 'add-global-skill' });
      } else if (target.dataset && target.dataset.action === 'remove-global-skill') {
        vscode.postMessage({ type: 'remove-global-skill', id: target.dataset.globalSkillId });
      } else if (target.dataset && target.dataset.action === 'add-profile') {
        vscode.postMessage({ type: 'add-profile' });
      } else if (target.dataset && target.dataset.action === 'remove-profile') {
        vscode.postMessage({ type: 'remove-profile', id: target.dataset.profileId });
      } else if (target.dataset && target.dataset.action === 'toggle-global-skill-menu') {
```

- [ ] **Step 6: Add the `.kb-textarea` CSS rule**

In the `css()` method, right after the existing `.kb-input { ... }` rule:

```ts
      .kb-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-textarea { min-height: 60px; resize: vertical; }
```

- [ ] **Step 7: Typecheck and full suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 8: Manual verification (F5)**

1. Press F5 (Run Extension), open a workspace with `.kanbrain/config.json` already configured with `profiles` (e.g. the one from the prior team-profiles feature, with `developer`/`qa`/`designer`/`po`).
2. Open the Kanbrain Configuration screen — confirm a "Profiles" section appears, before "Skill Configuration", with one collapsed row per profile.
3. Expand a row, edit the description in the textarea, click elsewhere to blur — confirm `.kanbrain/config.json`'s `profiles.<id>.description` updated (not `config.local.json` — profiles are shared, not per-machine).
4. Click "+ Add profile" — confirm a new collapsed row appears labeled "New profile"; fill in a label and description, blur, confirm it persists after a screen refresh.
5. Click the remove (✕) button on a profile — confirm it disappears from the list and from `.kanbrain/config.json`.
6. Go back to the Home screen's Profile dropdown — confirm newly added/renamed profiles show up there too.
7. Edit a status-skill row and a global-skill row on the same screen (unrelated to this change) — confirm they still save correctly, to catch any regression from the `saveSkillRow` restructuring in Step 3.

- [ ] **Step 9: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire profiles add/edit/remove into the Configuration screen"
```
