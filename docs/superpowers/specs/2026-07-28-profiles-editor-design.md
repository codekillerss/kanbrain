# Editor de perfis na tela Configuration — Design

## Contexto e motivação

A spec anterior (`2026-07-27-team-profiles-design.md`) introduziu `config.profiles` e um dropdown na Home pra escolher qual perfil já existente é o seu, mas deixou criar/editar perfis como algo feito à mão no `.kanbrain/config.json` — decisão explícita de escopo na época. Isso é inconsistente com o resto da tela Configuration: `globalSkills` já tem um editor completo (add/edit/remove) ali. O usuário quer o mesmo tratamento pra `profiles`.

## Escopo

**Dentro do escopo:**
- Novo arquivo `src/view/renderProfilesEditor.ts`, espelhando a seção "Global Skills" de `renderConfigEditor.ts`: lista de perfis colapsáveis, cada um com campos `label` (input) e `description` (textarea), botão de remover, e um botão "+ Add profile" sempre visível (mesmo com 0 perfis).
- Seção "Profiles" na tela Configuration (`renderConfig.ts`), **antes** de "Skill Configuration".
- Três métodos novos em `KanbrainViewProvider.ts` (`addProfile`, `saveProfileEntry`, `removeProfile`), espelhando `addGlobalSkill`/`saveGlobalSkillEntry`/`removeGlobalSkill` campo a campo (mesmo padrão de guard clauses, mesmo esquema de id `profile-${Date.now()}`).
- Extensão do `saveSkillRow` do webview (JS inline) pra reconhecer `row.dataset.profileId` como um terceiro tipo de linha, e do listener de blur pra também cobrir `textarea`, não só `input`.
- CSS: `.kb-textarea { min-height: 60px; resize: vertical; }`, reaproveitando `.kb-input` pro resto do estilo.

**Fora do escopo:**
- Tratamento especial ao remover um perfil que é o `selectedProfileId` de alguém — já cai no fallback silencioso que já existe (`resolveActiveProfile` retorna `null`, sem popup, sem bloqueio).
- Validação de conteúdo (label/description vazios são permitidos, igual `path` vazio já é permitido hoje em global skills).
- Qualquer mudança no dropdown de seleção de perfil da Home (spec anterior) — esta spec só adiciona o CRUD, não mexe em como o perfil ativo é escolhido.

## Design

### `src/view/renderProfilesEditor.ts` (novo)

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

A linha nasce colapsada mostrando "New profile" no cabeçalho até o `label` ser preenchido — mesmo comportamento de uma global skill nova (que mostra "New global skill" até ter `label`/`path`).

### `src/view/renderConfig.ts`

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

("Profiles" antes de "Skill Configuration", logo após a seção "Display" já existente.)

### `src/view/KanbrainViewProvider.ts`

Três métodos novos, ao lado de `addGlobalSkill`/`saveGlobalSkillEntry`/`removeGlobalSkill`:

```ts
private addProfile(): void {
  if (!this.workspaceRoot) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  const id = `profile-${Date.now()}`;
  config.profiles = { ...(config.profiles ?? {}), [id]: { label: '', description: '' } };
  writeConfig(this.workspaceRoot, config);
  this.lastState = '';
  void this.refresh();
}

private saveProfileEntry(id: string, label: string, description: string): void {
  if (!this.workspaceRoot) return;
  const config = readConfig(this.workspaceRoot);
  if (!config?.profiles?.[id]) return;
  config.profiles[id] = { label: label.trim(), description: description.trim() };
  writeConfig(this.workspaceRoot, config);
}

private removeProfile(id: string): void {
  if (!this.workspaceRoot) return;
  const config = readConfig(this.workspaceRoot);
  if (!config?.profiles?.[id]) return;
  delete config.profiles[id];
  writeConfig(this.workspaceRoot, config);
  this.lastState = '';
  void this.refresh();
}
```

Três novos branches em `onDidReceiveMessage`, ao lado dos equivalentes de global skill:

```ts
} else if (message.type === 'add-profile') {
  this.addProfile();
} else if (message.type === 'save-profile-entry') {
  this.saveProfileEntry(String(message.id ?? ''), String(message.label ?? ''), String(message.description ?? ''));
} else if (message.type === 'remove-profile') {
  this.removeProfile(String(message.id ?? ''));
}
```

Dois novos ramos no delegate de clique existente (`document.addEventListener('click', ...)`), ao lado de `add-global-skill`/`remove-global-skill`:

```js
} else if (target.dataset && target.dataset.action === 'add-profile') {
  vscode.postMessage({ type: 'add-profile' });
} else if (target.dataset && target.dataset.action === 'remove-profile') {
  vscode.postMessage({ type: 'remove-profile', id: target.dataset.profileId });
}
```

**Cuidado importante:** o `saveSkillRow` atual lê `path`/`textColor`/`buttonColor` incondicionalmente no topo da função, antes de checar `row.dataset.globalSkillId` — funciona hoje porque toda linha existente (status skill ou global skill) tem esses três campos no DOM. Uma linha de perfil **não tem** `[data-field="path"]` nem `[data-field="textColor"]`/`[data-field="buttonColor"]`, então `row.querySelector(...).value` retornaria `null.value` e quebraria. A função precisa mover essas leituras pra dentro de cada branch:

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

document.querySelectorAll('.kb-config-row input, .kb-config-row textarea').forEach((input) => {
  input.addEventListener('blur', () => {
    const row = input.closest('.kb-config-row');
    if (row) saveSkillRow(row);
  });
});
```

`label` continua lido incondicionalmente porque as três variantes de linha (status skill, global skill, perfil) sempre têm `[data-field="label"]`.

### CSS

```css
.kb-textarea { min-height: 60px; resize: vertical; }
```

## Tratamento de erros

- Remover um perfil que é o `selectedProfileId` local de alguém: sem bloqueio, sem aviso — `resolveActiveProfile` já trata id inexistente como "sem perfil selecionado" (comportamento definido na spec anterior).
- `label`/`description` vazios: permitido, cabeçalho da linha colapsada mostra "New profile" como fallback.
- Guardas de `workspaceRoot`/`config` ausentes: mesmo padrão (`return` cedo) de `addGlobalSkill`/`saveGlobalSkillEntry`/`removeGlobalSkill`.

## Testes

- `renderProfilesEditor.test.ts` (novo): mapa vazio → só o botão "+ Add profile" (seção nunca desaparece); um perfil → linha com `label`/`description` corretos, HTML escapado; múltiplos perfis → uma linha por entrada; perfil sem `label` → cabeçalho mostra "New profile".
- Sem teste automatizado para os três métodos novos de `KanbrainViewProvider.ts` nem pro JS inline do webview — mesmo precedente já aceito pro resto do arquivo (glue de vscode/webview, verificado manualmente via F5).
