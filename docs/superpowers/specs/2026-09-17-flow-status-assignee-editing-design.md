# Editar status e assignee na tela Flow — Design

## Contexto e motivação

O Kanbrain é hoje **somente leitura** em relação ao Azure DevOps — o design original (`2026-07-14-kanbrain-design.md`) exclui explicitamente "edição de work items pelo VS Code (mudar status, título, descrição)" do escopo. O usuário quer poder mudar o **status** e o **assignee** direto pelos cards da tela Flow (card principal, pai e subtasks), sem precisar abrir o Azure Boards no navegador.

Isso é a primeira vez que o Kanbrain escreve no Azure DevOps. O `AzureDevOpsClient` só faz GET e alguns POST de leitura (WIQL, queries salvas) — nunca um PATCH que altera um work item.

## Escopo

**Dentro do escopo:**
- Editar `System.State` (status) e `System.AssignedTo` (assignee) de qualquer work item mostrado na tela Flow: card principal, card do pai (quando exibido) e cards de subtask.
- Opções de status vêm do que já está descoberto localmente (`config.workflowSteps[type]`), sem nenhuma chamada de leitura nova.
- Busca de pessoas pro assignee é uma busca na organização inteira (não só o time configurado), via a API de Identities do Azure DevOps, com debounce.
- Opção de "Unassigned" no picker de assignee.
- PATCH direto no Azure DevOps ao selecionar uma opção (sem botão "Salvar" — mesmo padrão de skills rodando no clique e campos da tela de config salvando no blur).
- Invalidação do cache local (`cardCache`) e refresh após uma escrita bem-sucedida, pra sempre refletir o que o Azure DevOps realmente gravou.

**Fora do escopo:**
- Editar qualquer outro campo (título, descrição, tipo, etc.) — só status e assignee.
- Editar cards fora da tela Flow (Home, resultados de busca, histórico, painel de detalhe do work item) — essas telas continuam 100% somente leitura.
- Validar de antemão se uma transição de status é permitida pelas regras de processo do projeto (campos obrigatórios na transição, etc.) — se o Azure DevOps recusar o PATCH, mostramos o erro e não aplicamos a mudança, sem tentar prever a regra.
- Atribuir a alguém fora da organização atual (a busca é escopada pela mesma `organization` já configurada).
- Bundle/otimização do script inline do webview — fora do escopo desta feature, é um problema pré-existente do projeto todo.

**Risco conhecido, a verificar durante a implementação:** a API `_apis/identities` não tem uma doc tão detalhada quanto o resto da API do Azure DevOps. O formato exato de `properties.Account.$value` (usado como valor de `AssignedTo`) precisa ser confirmado com uma chamada real antes de fechar a UI de busca — se o formato vier diferente do esperado, a extração em `mapIdentitySearchResult` (seção 1) é o único lugar que precisa mudar.

## Design

### 1. Camada de dados — `src/azureDevOps/client.ts`

**Fix de pré-requisito**: hoje `fetchWithAuth` sempre força `'Content-Type': 'application/json'`, sobrescrevendo qualquer header vindo de `init.headers` (a ordem do spread está errada pra permitir override):

```ts
// antes
headers: {
  ...(init?.headers ?? {}),
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
},
// depois
headers: {
  'Content-Type': 'application/json',
  ...(init?.headers ?? {}),
  Authorization: `Bearer ${token}`,
},
```

Isso é necessário porque o PATCH de work item do Azure DevOps exige `Content-Type: application/json-patch+json` (formato JSON Patch, não JSON comum).

**Novo tipo** (em `client.ts`, ao lado de `WorkItemTypeState`):

```ts
export interface JsonPatchOperation {
  op: 'add' | 'remove';
  path: string;
  value?: string;
}

export interface IdentitySearchResult {
  id: string;
  displayName: string;
  uniqueName: string;
}
```

**Novo método de escrita**:

```ts
async updateWorkItem(organization: string, project: string, id: number, ops: JsonPatchOperation[]): Promise<void> {
  await this.request(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(ops) },
  );
}
```

Quem monta os `ops` é o chamador (`KanbrainViewProvider`, seção 3):
- Status: `[{ op: 'add', path: '/fields/System.State', value: newStatus }]`
- Atribuir: `[{ op: 'add', path: '/fields/System.AssignedTo', value: identity.uniqueName }]`
- Desatribuir: `[{ op: 'remove', path: '/fields/System.AssignedTo' }]`

**Novo método de busca de identidade**:

```ts
interface RawIdentity {
  id: string;
  providerDisplayName?: string;
  customDisplayName?: string;
  isActive?: boolean;
  isContainer?: boolean;
  properties?: { Account?: { $value?: string } };
  descriptor?: string;
}

async searchIdentities(organization: string, query: string): Promise<IdentitySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const data = await this.request<{ value: RawIdentity[] }>(
    `https://vssps.dev.azure.com/${organization}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(trimmed)}&api-version=7.1`,
  );
  return (data.value ?? [])
    .filter(i => i.isActive !== false && !i.isContainer)
    .map(i => ({
      id: i.id,
      displayName: i.providerDisplayName ?? i.customDisplayName ?? 'Unknown',
      uniqueName: i.properties?.Account?.$value ?? i.descriptor ?? '',
    }))
    .filter(i => i.uniqueName);
}
```

`searchIdentities` mora em `client.ts` mas usa o host `vssps.dev.azure.com` (não `dev.azure.com`), igual a `listOrganizations`/`getCurrentUserId`, que já usam esse host pra endpoints "de perfil/identidade" em vez de "de projeto".

### 2. UI dos cards — `src/view/renderWorkItemCard.ts`

Novo parâmetro `editable = false` no fim da assinatura (mantendo o estilo posicional já usado pelos outros flags dessa função):

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedTeam: string | undefined = undefined,
  showPickButton = false,
  editable = false,
): string
```

**Status** — troca a linha `kb-status-row` atual (texto puro) por um picker quando `editable`:

```ts
function renderStatusPicker(workItem: WorkItem, config: KanbrainConfig): string {
  const statuses = Object.keys(config.workflowSteps[workItem.type] ?? {});
  const options = statuses
    .map(s => `
      <button type="button" class="kb-status-picker-option${s === workItem.status ? ' kb-status-picker-option-active' : ''}" data-action="select-status" data-id="${workItem.id}" data-status="${escapeHtml(s)}">
        ${renderStatusDot(s, config.statusColors ?? {})}${escapeHtml(s)}
      </button>`)
    .join('');
  return `
    <div class="kb-status-picker">
      <button type="button" class="kb-status-row kb-status-picker-trigger" data-action="toggle-status-picker">
        ${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}
      </button>
      <div class="kb-status-picker-menu kb-hidden">${options}</div>
    </div>
  `;
}
```

Se `config.workflowSteps[workItem.type]` não existir (tipo nunca sincronizado), `statuses` fica vazio — o picker abre com um menu vazio em vez de quebrar; não é o caso comum (o tipo já veio de um work item real, então quase sempre foi descoberto), mas evita undefined.

**Assignee** — troca `renderAssigneeRow(...)` por um combobox com busca quando `editable`:

```ts
function renderAssigneePicker(workItem: WorkItem, avatars: Record<string, string>): string {
  const current = workItem.assignedTo
    ? `${renderAvatarOrInitial(workItem.assignedTo.displayName, workItem.assignedTo.imageUrl, avatars)}${escapeHtml(workItem.assignedTo.displayName)}`
    : `<span class="kb-avatar-initial">?</span>Unassigned`;
  return `
    <div class="kb-assignee-picker" data-id="${workItem.id}">
      <button type="button" class="kb-assignee-row kb-assignee-picker-trigger" data-action="toggle-assignee-picker">${current}</button>
      <div class="kb-assignee-picker-menu kb-hidden">
        <input type="text" class="kb-input kb-assignee-search-input" data-id="${workItem.id}" placeholder="Search people...">
        <button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItem.id}" data-unique-name="" data-display-name="">Unassigned</button>
        <div class="kb-assignee-picker-results"></div>
      </div>
    </div>
  `;
}
```

`renderWorkItemCard` passa a escolher entre a versão fixa (comportamento atual, sem mudança) e a editável:

```ts
const statusHtml = editable ? renderStatusPicker(workItem, config) : `<div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>`;
const assigneeHtml = !showAssignedTo ? '' : editable ? renderAssigneePicker(workItem, avatars) : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');
```

### 3. Call sites — `render.ts` / `renderHome.ts`

Só a tela Flow (`render.ts`) passa `editable = true`, nos três usos existentes de `renderWorkItemCard` (pai, principal, subtasks). `renderHome.ts` não muda — continua sem o argumento (default `false`), então o card na Home continua somente leitura.

### 4. Mensagens e escrita — `KanbrainViewProvider.ts`

Três mensagens novas no `onDidReceiveMessage` (mesmo padrão `if/else if` já usado):

```ts
} else if (message.type === 'select-status') {
  await this.updateWorkItemStatus(Number(message.id), String(message.status ?? ''));
} else if (message.type === 'search-identities') {
  await this.searchIdentities(Number(message.workItemId), String(message.query ?? ''));
} else if (message.type === 'select-assignee') {
  await this.updateWorkItemAssignee(Number(message.id), message.uniqueName ? String(message.uniqueName) : null);
}
```

Métodos novos:

```ts
private async updateWorkItemStatus(id: number, status: string): Promise<void> {
  if (!this.workspaceRoot || !this.client || !status) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  try {
    await this.client.updateWorkItem(config.organization, config.project, id, [
      { op: 'add', path: '/fields/System.State', value: status },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not update status for #${id}: ${message}`);
  }
  this.invalidateActiveCardCache();
}

private async updateWorkItemAssignee(id: number, uniqueName: string | null): Promise<void> {
  if (!this.workspaceRoot || !this.client) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  try {
    const ops: JsonPatchOperation[] = uniqueName
      ? [{ op: 'add', path: '/fields/System.AssignedTo', value: uniqueName }]
      : [{ op: 'remove', path: '/fields/System.AssignedTo' }];
    await this.client.updateWorkItem(config.organization, config.project, id, ops);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not update assignee for #${id}: ${message}`);
  }
  this.invalidateActiveCardCache();
}

private async searchIdentities(workItemId: number, query: string): Promise<void> {
  if (!this.view || !this.workspaceRoot || !this.client) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  try {
    const results = await this.client.searchIdentities(config.organization, query);
    this.view.webview.postMessage({ type: 'identity-results', workItemId, html: renderIdentityOptions(results) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.view.webview.postMessage({
      type: 'identity-results',
      workItemId,
      html: `<div class="kb-empty">Error: ${escapeHtml(message)}</div>`,
    });
  }
}

private invalidateActiveCardCache(): void {
  if (this.activeWorkItemId !== undefined) {
    this.cardCache.delete(this.activeWorkItemId);
  }
  this.lastState = '';
  void this.refresh();
}
```

**Importante sobre o cache**: `cardCache` (adicionado na feature de abas) guarda `{workItem, parent, subtasks}` numa única entrada por `activeWorkItemId` — pai e subtasks **não** têm entrada própria, vêm juntos na mesma busca do item principal. Por isso `invalidateActiveCardCache` sempre invalida a entrada do item **ativo da aba**, não a do id que foi editado — editar uma subtask ou o pai também precisa invalidar essa mesma entrada, porque é dali que os três vêm.

`searchIdentities` é chamado com bastante frequência (uma vez por busca, já debounced no cliente — seção 5), então **não** passa pelo `cardCache`; é sempre uma chamada nova.

### 5. JS do webview — `KanbrainViewProvider.ts`

**Toggle dos pickers** — dois novos branches no `click` delegado, ao lado de `toggle-skill-picker`:

```js
} else if (target.closest && target.closest('[data-action="toggle-status-picker"]')) {
  const picker = target.closest('.kb-status-picker');
  closeAllPickers();
  picker.querySelector('.kb-status-picker-menu').classList.toggle('kb-hidden');
} else if (target.closest && target.closest('[data-action="toggle-assignee-picker"]')) {
  const picker = target.closest('.kb-assignee-picker');
  closeAllPickers();
  picker.querySelector('.kb-assignee-picker-menu').classList.toggle('kb-hidden');
  const input = picker.querySelector('.kb-assignee-search-input');
  if (input) input.focus();
} else if (target.closest && target.closest('[data-action="select-status"]')) {
  const btn = target.closest('[data-action="select-status"]');
  closeAllPickers();
  vscode.postMessage({ type: 'select-status', id: btn.dataset.id, status: btn.dataset.status });
} else if (target.closest && target.closest('[data-action="select-assignee"]')) {
  const btn = target.closest('[data-action="select-assignee"]');
  closeAllPickers();
  vscode.postMessage({ type: 'select-assignee', id: btn.dataset.id, uniqueName: btn.dataset.uniqueName });
}
```

`closeAllPickers()` é uma função nova que esconde `.kb-status-picker-menu` e `.kb-assignee-picker-menu` abertos (mesmo papel de `closeAllSkillPickers`, já existente — os três podem compartilhar a mesma implementação genérica por seletor).

**Fechar ao clicar fora** — estende o bloco que já existe pra `.kb-skill-picker`/`.kb-query-combobox`, incluindo `.kb-status-picker`/`.kb-assignee-picker` na lista de seletores que "seguram aberto".

**Busca de assignee com debounce**:

```js
let identitySearchTimer = null;
document.querySelectorAll('.kb-assignee-search-input').forEach((input) => {
  input.addEventListener('input', () => {
    const workItemId = input.dataset.id;
    const query = input.value;
    clearTimeout(identitySearchTimer);
    identitySearchTimer = setTimeout(() => {
      vscode.postMessage({ type: 'search-identities', workItemId, query });
    }, 300);
  });
});
```

300ms de debounce é uma escolha nova (o resto do app não debounça busca — `#kb-search-input` dispara a cada tecla), porque aqui a busca sai pra uma API da organização (não a WIQL interna) e digitar rápido sem debounce geraria uma sequência de chamadas desperdiçadas.

**Recebendo os resultados** — novo branch no listener de `message`, ao lado de `saved-queries`:

```js
} else if (event.data.type === 'identity-results') {
  const picker = document.querySelector('.kb-assignee-picker[data-id="' + event.data.workItemId + '"] .kb-assignee-picker-results');
  if (picker) picker.innerHTML = event.data.html;
}
```

(Isso exige que `renderAssigneePicker` também coloque `data-id="${workItem.id}"` no `.kb-assignee-picker` — ajuste na seção 2.)

### 6. Renderização dos resultados de busca — `src/view/renderIdentityOptions.ts` (novo arquivo)

Mesmo molde de `renderSavedQueryOptions.ts`:

```ts
import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';

export function renderIdentityOptions(results: IdentitySearchResult[], workItemId: number): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(
      r => `<button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}</button>`,
    )
    .join('');
}
```

(`workItemId` precisa ser passado explicitamente pra cá porque `IdentitySearchResult` não carrega o id do work item — só o da identidade.)

### 7. CSS

Reaproveita quase tudo que já existe pro `kb-skill-picker`/`kb-query-dropdown` (mesmo z-index, mesmo `position: relative`/`absolute`, mesmo `max-height`/`overflow-y`). Novidades específicas:

```css
.kb-status-picker, .kb-assignee-picker { position: relative; }
.kb-status-picker-trigger, .kb-assignee-picker-trigger { cursor: pointer; background: none; border: none; padding: 0; font: inherit; color: inherit; text-align: left; }
.kb-status-picker-menu, .kb-assignee-picker-menu { position: absolute; z-index: 50; margin-top: 2px; min-width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
.kb-status-picker-option, .kb-assignee-picker-option { display: flex; align-items: center; gap: 4px; width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
.kb-status-picker-option:hover, .kb-assignee-picker-option:hover { background: var(--vscode-list-hoverBackground); }
.kb-status-picker-option-active { font-weight: 600; }
```

## Tratamento de erros

- PATCH recusado (403 sem permissão, 400 regra de processo/campo obrigatório, 401 sessão expirada): `updateWorkItemStatus`/`updateWorkItemAssignee` capturam o erro, mostram `vscode.window.showErrorMessage` com o texto vindo da própria `AzureDevOpsHttpError`, e **não** aplicam nenhuma mudança otimista — o `refresh()` que roda em seguida busca o estado real (que não mudou) e a UI simplesmente volta a mostrar o valor de antes, sem passo extra de "desfazer".
- 401/403 não é tratado aqui como "sessão desconectada" (diferente do `refresh()`/`pollWorkItem`, que já faz isso) — é só um erro pontual dessa ação; o usuário pode não ter permissão de escrita mesmo estando bem autenticado para leitura. Não mexe em `this.connectionStatus`.
- `searchIdentities` com erro de rede: mostra a mensagem de erro no lugar da lista de resultados (mesmo padrão de `loadSavedQueries`), sem afetar o resto do card.
- Buscar com o campo vazio: `client.searchIdentities` devolve `[]` sem chamar a API (guard `trimmed` vazio) — evita uma chamada desnecessária logo ao abrir o dropdown.

## Testes

- `src/azureDevOps/client.test.ts`: `updateWorkItem` manda `PATCH` com `Content-Type: application/json-patch+json` e o body serializado; `searchIdentities` filtra identidades inativas/container, extrai `displayName`/`uniqueName` do formato mockado, devolve `[]` para query vazia sem chamar `fetch`.
- `src/view/renderWorkItemCard.test.ts`: com `editable=false` (default), nada muda (todos os testes existentes continuam passando sem alteração); com `editable=true`, mostra `kb-status-picker` com uma opção por status de `config.workflowSteps[type]`, marca a opção atual como ativa, e mostra `kb-assignee-picker` com a opção "Unassigned".
- `src/view/renderIdentityOptions.test.ts` (novo): lista vazia mostra "No matches."; escapa `displayName`; cada botão carrega `data-unique-name` e `data-id` corretos.
- Sem teste automatizado pro script inline novo (toggle, debounce, mensagens) — mesmo padrão já estabelecido pro resto do arquivo; validação manual no VS Code (F5) antes de considerar pronto, testando especificamente: mudar status de cada um dos três tipos de card, atribuir e desatribuir, e o caso de erro (tentar uma transição que o processo do projeto recusa, se houver um caso à mão).
