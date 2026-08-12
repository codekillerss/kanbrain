# Queries salvas do Azure DevOps no dialog de busca — Design

## Contexto e motivação

O Azure DevOps permite salvar "queries" (WIQL) em pastas (`My Queries`, `Shared Queries`, com subpastas) que resultam sempre em work items — nunca em outra coisa. O usuário quer poder escolher uma dessas queries salvas dentro do dialog de busca de work items do Kanbrain (`renderSearchDialog()`) para filtrar/ordenar os cards exibidos, e essa seleção deve poder ser combinada com o filtro de texto já existente no dialog (`#kb-search-input`).

A escolha da query acontece por um combobox customizado (texto + lista suspensa filtrável), pelo mesmo motivo que motivou os componentes de dropdown já existentes no projeto (`.kb-global-skill-menu`): um `<select>` nativo não permite filtrar/esconder `<option>`s por texto digitado.

## Escopo

**Dentro do escopo:**
- Novo endpoint no `AzureDevOpsClient` para listar queries salvas (`listQueries`) e executar uma por id (`runSavedQuery`).
- Nova função pura `filterWorkItemsByText` (mesma semântica de `buildSearchQuery`, aplicada em memória) e `countItemsByType`, ambas em `src/azureDevOps/wiql.ts`.
- `KanbrainViewProvider.searchWorkItems` passa a aceitar um `queryId` opcional e combinar query salva + texto.
- Novo par de mensagens `load-saved-queries` / `saved-queries`, espelhando o padrão já existente de `load-work-item-history` / `work-item-history`.
- Novo combobox de queries no `renderSearchDialog()` (`render.ts`), acima do `#kb-search-input`.
- Novo arquivo `src/view/renderSavedQueryOptions.ts` (+ teste) para renderizar as opções do dropdown.
- CSS e JS inline em `KanbrainViewProvider.ts` para abrir/filtrar/selecionar/limpar o combobox.

**Fora do escopo:**
- O bloco de busca "cru" em `render.ts:88-92` (variante sem moldura/botão fechar, usada quando a tela Flow está sem work item ativo) não recebe o combobox — é um caminho já inconsistente com o dialog real hoje (não tem `kb-search-overlay`/`kb-hidden`) e não faz parte do "dialog de busca de cards" a que o usuário se refere.
- Paginação da lista de queries — sem paginação, como pedido; listamos o que a API do Azure devolver com `$depth=2` (limite da própria API, ela não expande mais que 2 níveis de pasta por chamada).
- Persistir a query selecionada entre aberturas do dialog — cada abertura resulta em uma busca "limpa" (mesmo comportamento que o texto já tem hoje: reabrir sempre dispara `search-work-items` com `query: ''`).
- Alterar `buildSearchQuery`/o fluxo de busca por texto sem query ativa — permanece 100% inalterado.

## Design

### 1. Camada de dados

`src/types.ts` — novo tipo:

```ts
export interface SavedQuery {
  id: string;
  path: string; // caminho completo, ex: "Shared Queries/Time X/Bugs Abertos"
  queryType: 'flat' | 'tree' | 'oneHop';
}
```

`src/azureDevOps/client.ts` — dois novos métodos na classe `AzureDevOpsClient`:

```ts
async listQueries(organization: string, project: string): Promise<SavedQuery[]> {
  interface RawQueryNode {
    id: string;
    name: string;
    isFolder?: boolean;
    queryType?: string;
    children?: RawQueryNode[];
  }
  const data = await this.request<{ value: RawQueryNode[] }>(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/queries?$depth=2&api-version=7.1`,
  );
  const result: SavedQuery[] = [];
  const walk = (nodes: RawQueryNode[], parentPath: string) => {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.isFolder) {
        walk(node.children ?? [], path);
      } else {
        const queryType = node.queryType === 'tree' || node.queryType === 'oneHop' ? node.queryType : 'flat';
        result.push({ id: node.id, path, queryType });
      }
    }
  };
  walk(data.value, '');
  return result;
}

async runSavedQuery(organization: string, project: string, queryId: string): Promise<number[]> {
  const data = await this.request<{ workItems: { id: number }[] }>(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql/${queryId}?api-version=7.1&$top=50`,
    { method: 'POST' },
  );
  return (data.workItems ?? []).map(w => w.id);
}
```

`runSavedQuery` só é chamado para queries `flat` (o combobox nunca permite selecionar `tree`/`oneHop` — ver seção 3), então `data.workItems` é sempre a forma de resposta esperada; não precisamos tratar `workItemRelations`.

`src/azureDevOps/wiql.ts` — duas novas funções puras, ao lado de `buildSearchQuery`/`buildTypeCountQuery`:

```ts
export function filterWorkItemsByText(items: WorkItem[], searchText: string): WorkItem[] {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return items;
  }
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return items.filter(item => item.id === id);
  }
  const needle = trimmed.toLowerCase();
  return items.filter(item => item.title.toLowerCase().includes(needle));
}

export function countItemsByType(items: WorkItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}
```

(`filterWorkItemsByText` precisa de `import type { WorkItem } from '../types';` no topo de `wiql.ts`, que hoje não importa nada.)

### 2. Backend — `KanbrainViewProvider.ts`

**Mensagem de entrada** (`resolveWebviewView`, dentro do `onDidReceiveMessage`, linha ~75-76 hoje):

```ts
} else if (message.type === 'search-work-items') {
  await this.searchWorkItems(String(message.query ?? ''), message.queryId ? String(message.queryId) : undefined);
}
```

Novo branch, ao lado do `load-work-item-history` (linha ~81-82):

```ts
} else if (message.type === 'load-saved-queries') {
  await this.loadSavedQueries();
}
```

**`searchWorkItems`** (linha ~337-361 hoje) ganha o parâmetro `queryId` e um caminho alternativo:

```ts
private async searchWorkItems(query: string, queryId?: string): Promise<void> {
  if (!this.view || !this.workspaceRoot || !this.client) {
    return;
  }
  const config = readConfig(this.workspaceRoot);
  if (!config) {
    return;
  }

  let html: string;
  try {
    let items: WorkItem[];
    let typeCounts: Record<string, number>;
    if (queryId) {
      const ids = await this.client.runSavedQuery(config.organization, config.project, queryId);
      const queryItems = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      typeCounts = countItemsByType(queryItems);
      items = filterWorkItemsByText(queryItems, query);
    } else {
      if (query.trim() === '') {
        this.typeCounts = await this.fetchTypeCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      typeCounts = this.typeCounts;
    }
    const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(items) : {};
    html = renderSearchResults(items, config, typeCounts, avatars);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
  }

  this.view.webview.postMessage({ type: 'search-results', html });
}
```

Importante: quando `queryId` está presente, `typeCounts` é uma variável **local** (nunca escreve em `this.typeCounts`) — o cache de contagens totais do projeto (usado pelo caminho sem query) fica intocado, então limpar a query volta exatamente ao comportamento de hoje.

**`loadSavedQueries`**, novo método privado, no mesmo molde de `loadWorkItemHistory` (linha ~200-219 hoje):

```ts
private async loadSavedQueries(): Promise<void> {
  if (!this.view || !this.workspaceRoot || !this.client) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  try {
    const queries = await this.client.listQueries(config.organization, config.project);
    this.view.webview.postMessage({ type: 'saved-queries', html: renderSavedQueryOptions(queries) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.view.webview.postMessage({
      type: 'saved-queries',
      html: `<div class="kb-empty">Error loading queries: ${escapeHtml(message)}</div>`,
    });
  }
}
```

Imports novos no topo do arquivo: `filterWorkItemsByText`, `countItemsByType` (de `./azureDevOps/wiql` — ajustar caminho relativo real do arquivo), `renderSavedQueryOptions` (de `./renderSavedQueryOptions`).

### 3. Renderização das opções — `src/view/renderSavedQueryOptions.ts`

```ts
import type { SavedQuery } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderSavedQueryOptions(queries: SavedQuery[]): string {
  if (queries.length === 0) {
    return '<div class="kb-empty">No saved queries found.</div>';
  }
  return queries
    .map(q => {
      const disabled = q.queryType !== 'flat';
      const badge = disabled ? `<span class="kb-query-type-badge">${escapeHtml(q.queryType)}</span>` : '';
      return `<button type="button" class="kb-query-option" data-action="select-query" data-id="${escapeHtml(q.id)}" data-path="${escapeHtml(q.path)}"${disabled ? ' disabled' : ''}>${escapeHtml(q.path)}${badge}</button>`;
    })
    .join('');
}
```

`data-path` guarda o caminho **com o casing original** (não veio em lowercase) — o próprio JS do webview faz `.toLowerCase()` ao comparar no filtro (seção 5), então não precisamos de dois atributos.

### 4. Markup do combobox — `render.ts`, dentro de `renderSearchDialog()`

```ts
function renderSearchDialog(): string {
  return `
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div class="kb-query-combobox">
          <input id="kb-query-filter-input" placeholder="Filter by saved query..." autocomplete="off">
          <button id="kb-query-clear-btn" class="kb-icon-btn kb-hidden" title="Clear query" aria-label="Clear query">✕</button>
          <div id="kb-query-options" class="kb-query-dropdown kb-hidden"></div>
        </div>
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    </div>
  `;
}
```

Como pedido, o combobox de query fica **acima** do `#kb-search-input`. Isso tira o input de título do `.kb-search-dialog-header` (hoje um `flex` que tem só o input + o botão fechar lado a lado) — o botão fechar (`kb-search-close-btn`) passa a ficar sozinho no header, alinhado à direita (`.kb-search-dialog-header { justify-content: flex-end; }`, ajuste de uma linha na regra já existente em `KanbrainViewProvider.ts` linha ~1265: `.kb-search-dialog-header { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }`), e o input de título vira uma linha própria abaixo do combobox, mantendo a leitura de cima para baixo: fechar dialog → escolher query → refinar por texto → ver resultados.

### 5. JS do webview — `KanbrainViewProvider.ts`

**Estado**: uma variável de módulo perto de `searchInput` (linha ~1145 hoje):

```js
const searchInput = document.getElementById('kb-search-input');
const queryFilterInput = document.getElementById('kb-query-filter-input');
const queryClearBtn = document.getElementById('kb-query-clear-btn');
const queryOptions = document.getElementById('kb-query-options');
let activeQueryId = null;

function closeQueryDropdown() {
  if (queryOptions) queryOptions.classList.add('kb-hidden');
}

function triggerSearch() {
  vscode.postMessage({ type: 'search-work-items', query: searchInput ? searchInput.value : '', queryId: activeQueryId || undefined });
}

if (searchInput) {
  searchInput.addEventListener('input', triggerSearch);
}

if (queryFilterInput) {
  queryFilterInput.addEventListener('focus', () => queryOptions && queryOptions.classList.remove('kb-hidden'));
  queryFilterInput.addEventListener('input', () => {
    const needle = queryFilterInput.value.trim().toLowerCase();
    if (queryOptions) {
      queryOptions.classList.remove('kb-hidden');
      queryOptions.querySelectorAll('.kb-query-option').forEach((opt) => {
        opt.hidden = needle !== '' && !opt.dataset.path.toLowerCase().includes(needle);
      });
    }
  });
  queryFilterInput.addEventListener('blur', () => {
    // Deixar o texto digitado sem selecionar nada faria o campo mostrar algo
    // diferente da query realmente ativa (ou de nenhuma). Ao perder o foco sem
    // uma seleção nova, o texto volta a refletir a query ativa (ou fica vazio).
    setTimeout(() => {
      const activeOption = activeQueryId
        ? queryOptions && queryOptions.querySelector('[data-id="' + activeQueryId + '"]')
        : null;
      queryFilterInput.value = activeOption ? activeOption.dataset.path : '';
    }, 150);
  });
}

if (queryClearBtn) {
  queryClearBtn.addEventListener('click', () => {
    activeQueryId = null;
    if (queryFilterInput) queryFilterInput.value = '';
    queryClearBtn.classList.add('kb-hidden');
    triggerSearch();
  });
}
```

`triggerSearch` substitui o corpo atual do listener de `input` do `#kb-search-input` (hoje ele faz `vscode.postMessage({ type: 'search-work-items', query: e.target.value })` diretamente) — a troca é: sempre ler `searchInput.value` e incluir `queryId: activeQueryId || undefined`.

**Abertura do dialog** — dentro do `if (wasHidden)` já existente (linha ~982-985 hoje, que hoje só faz o `postMessage` de busca vazia + o `.focus()` implementado antes):

```js
if (wasHidden) {
  activeQueryId = null;
  if (queryFilterInput) queryFilterInput.value = '';
  if (queryClearBtn) queryClearBtn.classList.add('kb-hidden');
  closeQueryDropdown();
  vscode.postMessage({ type: 'search-work-items', query: '' });
  vscode.postMessage({ type: 'load-saved-queries' });
  document.getElementById('kb-search-input')?.focus();
}
```

**Seleção de uma opção** — novo branch no `click` delegado (perto de `open-work-item-detail`, linha ~1054 hoje):

```js
} else if (target.closest && target.closest('[data-action="select-query"]')) {
  const option = target.closest('[data-action="select-query"]');
  activeQueryId = option.dataset.id;
  if (queryFilterInput) queryFilterInput.value = option.dataset.path;
  closeQueryDropdown();
  if (queryClearBtn) queryClearBtn.classList.remove('kb-hidden');
  triggerSearch();
}
```

(Opções `disabled` nunca chegam aqui — botão desabilitado não dispara `click`, mesmo mecanismo já usado no histórico de work items.)

**Fechar ao clicar fora** — novo bloco independente logo depois do já existente para `.kb-global-skill-menu` (linha ~1126-1131 hoje), sem tocar nesse:

```js
if (!target.closest || !target.closest('.kb-query-combobox')) {
  closeQueryDropdown();
}
```

**Nova mensagem recebida** (`window.addEventListener('message', ...)`, ao lado de `work-item-history`, linha ~1159 hoje):

```js
} else if (event.data.type === 'saved-queries') {
  if (queryOptions) queryOptions.innerHTML = event.data.html;
}
```

### 6. CSS — `KanbrainViewProvider.ts`, `css()`

Perto de `#kb-search-input`/`.kb-search-dialog*` (linha ~1246-1277 hoje):

```css
.kb-query-combobox { position: relative; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
#kb-query-filter-input { box-sizing: border-box; width: 100%; flex: 1; padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
#kb-query-filter-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.kb-query-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; margin-top: 2px; display: flex; flex-direction: column; gap: 2px; padding: 4px; max-height: 200px; overflow-y: auto; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
.kb-query-option { width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kb-query-option:hover { background: var(--vscode-list-hoverBackground); }
.kb-query-option:disabled { opacity: 0.5; cursor: default; }
.kb-query-option:disabled:hover { background: none; }
.kb-query-type-badge { margin-left: 4px; font-size: 10px; opacity: 0.7; }
```

`opt.hidden` (atributo nativo, setado via JS) já equivale a `display: none` sem precisar de regra própria.

## Tratamento de erros

- `listQueries`/`runSavedQuery` propagam erros de rede/HTTP normalmente (mesmo padrão de `searchWorkItems`/`getWorkItems`, que não engolem erro); quem trata é o chamador:
  - `loadSavedQueries` captura e mostra `<div class="kb-empty">Error loading queries: ...</div>` no lugar do dropdown.
  - `searchWorkItems` (já existente) captura e mostra `Erro ao buscar work items: ...` no lugar dos resultados — cobre tanto o caminho de query quanto o de texto puro.
- Se `runSavedQuery` devolver 0 ids, `getWorkItems` não é chamado (`ids.length` guard já existente) e `filterWorkItemsByText([], query)` devolve `[]` — cai no `renderSearchResults([], ...)` existente, que já mostra "No work items found."
- Se o usuário digitar um número no filtro de texto enquanto uma query está ativa e nenhum item da query tiver aquele id, `filterWorkItemsByText` devolve `[]` — mesmo comportamento "sem resultado" de hoje.
- Selecionar uma query `disabled` é impossível pela UI (atributo `disabled` nativo do `<button>`), então o backend nunca recebe um `queryId` de uma query tree/oneHop.

## Testes

- `src/azureDevOps/wiql.test.ts`: casos novos para `filterWorkItemsByText` (texto vazio devolve tudo; texto numérico filtra por id exato; texto não-numérico filtra por substring case-insensitive no título; nenhum item bate) e para `countItemsByType` (agrupa corretamente por `type`; lista vazia devolve `{}`).
- `src/view/renderSavedQueryOptions.test.ts` (novo arquivo): lista vazia mostra "No saved queries found."; query `flat` não tem `disabled`; query `tree`/`oneHop` tem `disabled` e mostra o badge com o tipo; título/caminho é escapado (`escapeHtml`).
- `src/view/render.test.ts`: `renderSearchDialog` (via `render()`) passa a conter `kb-query-combobox`, `kb-query-filter-input`, `kb-query-clear-btn` e `kb-query-options` em todas as telas onde já aparece `kb-search-input` hoje.
- `src/azureDevOps/client.test.ts`: `listQueries` achata corretamente uma árvore de pastas aninhadas (mock de resposta com `children` de 2 níveis), monta o `path` concatenado, marca `queryType` default `'flat'` quando o campo vier ausente/diferente de `tree`/`oneHop`; `runSavedQuery` faz `POST` na URL certa e extrai `workItems[].id`.
- Não há teste automatizado para o script inline do webview (JS em template string) — os pontos novos (`triggerSearch`, filtro do dropdown, seleção, clique-fora, mensagens) são verificados por releitura cuidadosa do diff, como já é o padrão hoje para o restante do script inline.
