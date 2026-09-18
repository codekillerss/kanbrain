# Unificar os modais de busca e histórico — Design

## Contexto e motivação

Hoje existem dois modais separados e sobrepostos na tela Flow/Home:

- **Busca** (`#kb-search-section`, `renderSearchDialog` em `src/view/render.ts:71-98`): campo de texto, combobox de saved queries, checkbox "Assigned to me", e resultados agrupados por status dentro de **abas por tipo de work item (WIT)** (`renderSearchResults.ts`).
- **Histórico** (`#kb-history-section`, `renderHistoryDialog` em `src/view/render.ts:59-69`): lista dos últimos work items visitados (`renderWorkItemHistory.ts`).

Dois botões abrem esses modais, ambos só existindo na seção "Current Work Item"/Home (`kb-history-btn`, `kb-toggle-search-btn`) — e o botão "+" da barra de abas (`kb-add-tab-btn`, usado para abrir outro work item **numa aba nova**) só abre o modal de **busca**, nunca o de histórico. Resultado: ao trabalhar com múltiplas abas, não há como abrir um item recente como nova aba sem buscar de novo pelo título/id.

**Bug pré-existente encontrado durante a investigação, corrigido de graça por este redesenho:** o clique num item do histórico sempre usa `data-action="pick-work-item"`, cujo handler (`KanbrainViewProvider.ts:1506-1513`) decide entre `add-tab` e `pick-work-item` (replace) checando `document.getElementById('kb-search-section').dataset.mode` — ou seja, **o modal de histórico já lê o modo do modal de busca**, que pode estar desatualizado (deixado em `'add'` por uma interação anterior com o "+", mesmo com a busca fechada). Ao mover o histórico para dentro do mesmo elemento `#kb-search-section`, esse bug desaparece sem nenhum código extra.

**Segundo bug pré-existente encontrado, que motiva ainda mais a remoção das abas de tipo:** as abas de tipo dentro dos resultados de busca (`renderSearchResults.ts:69-74`, `data-action="select-tab" data-tab="..."`) colidem com o `data-action="select-tab"` já usado pela barra de abas de work items (`render.ts:43`, `data-tab-id="..."`). O handler da barra de abas (`KanbrainViewProvider.ts:1441`, `target.closest('[data-action="select-tab"]')`) vem **antes**, no mesmo `if/else-if`, do handler dedicado às abas de tipo (`KanbrainViewProvider.ts:1557`, `target.dataset.action === 'select-tab'`) — e como `.closest()` também casa com o próprio elemento clicado, o primeiro handler sempre intercepta o clique. O segundo handler (que de fato trocaria o painel visível) é código morto. Na prática, clicar numa aba de tipo dentro da busca hoje **não faz nada visível** — o painel "All" fica sempre ativo.

## Escopo

**Dentro do escopo:**
- Unificar `#kb-search-section` e `#kb-history-section` num único modal, com duas abas no topo do diálogo: **Search** e **History**.
- Remover as abas por tipo de work item dentro dos resultados de busca; substituir por um `<select>` de tipo posicionado ao lado do checkbox "Assigned to me", mantendo a contagem por tipo no texto de cada opção (ex: `Bug (3)`).
- Remover o botão `kb-history-btn` (tanto na Home quanto na Flow) — histórico passa a ser só uma aba do mesmo modal aberto pelos gatilhos já existentes (`kb-toggle-search-btn`, `kb-add-tab-btn`, `kb-footer-select-work-item-btn`).
- Corrigir os dois bugs acima como efeito colateral da unificação (mode do histórico; seleção de tipo via `change` num `<select>`, sem colisão de `data-action`).

**Fora do escopo:**
- Mudar o que cada modo (`replace` vs `add`) faz — comportamento inalterado, só passa a se aplicar corretamente também ao histórico.
- Mudar como a busca é feita no servidor (`searchWorkItems`, `AzureDevOpsClient`) — mesma query, mesmo payload.
- Adicionar contagem de "já aberto em outra aba" ao histórico ou à busca — nenhum dos dois faz isso hoje; não é adicionado agora.

## Design

### 1. Markup — `src/view/render.ts`

`renderHistoryDialog()` é removida. `renderSearchDialog(config)` passa a renderizar as duas abas internas e os dois painéis, reaproveitando o conteúdo de cada modal antigo:

```html
<div id="kb-search-section" class="kb-search-overlay kb-hidden">
  <div class="kb-search-dialog">
    <div class="kb-search-dialog-header">
      <div class="kb-dialog-tabs">
        <button type="button" class="kb-dialog-tab kb-dialog-tab-active" data-action="select-dialog-tab" data-dialog-tab="search">Search</button>
        <button type="button" class="kb-dialog-tab" data-action="select-dialog-tab" data-dialog-tab="history">History</button>
      </div>
      <button id="kb-search-close-btn">✕</button>
    </div>

    <div class="kb-dialog-panel" data-dialog-panel="search">
      <!-- combobox de saved query (inalterado) -->
      <input id="kb-search-input" placeholder="Search by title or #id...">
      <div class="kb-search-filters-row">
        <label class="kb-checkbox-row">
          <input type="checkbox" id="kb-search-assigned-to-me" ...>
          Assigned to me
        </label>
        <select id="kb-search-type-select">
          <option value="all">All types</option>
          <!-- uma option por tipo, com contagem — ver seção 3 -->
        </select>
      </div>
      <div id="kb-search-results"></div>
    </div>

    <div class="kb-dialog-panel kb-hidden" data-dialog-panel="history">
      <div id="kb-history-results"><div class="kb-empty">Loading...</div></div>
    </div>
  </div>
</div>
```

O caso "sem work item ativo" (`render.ts:142-155`, versão minimalista sem `renderSearchDialog`) permanece como hoje — ele já não tem histórico nem abas, então não muda.

O botão `kb-history-btn` some das duas seções de ações (`render.ts:184` e `renderHome.ts:11`), restando só `kb-toggle-search-btn` e `kb-clear-btn`.

### 2. Trocar de aba interna (Search/History) — JS do webview

Novo estado no topo do `<script>`, ao lado de `activeSearchTab`:

```js
let activeDialogTab = 'search';

function applyDialogTab() {
  document.querySelectorAll('.kb-dialog-tab').forEach((btn) => {
    btn.classList.toggle('kb-dialog-tab-active', btn.dataset.dialogTab === activeDialogTab);
  });
  document.querySelectorAll('.kb-dialog-panel').forEach((panel) => {
    panel.classList.toggle('kb-hidden', panel.dataset.dialogPanel !== activeDialogTab);
  });
}
```

Novo branch no `click` delegado (nome de ação novo, `select-dialog-tab`, para não colidir com o `select-tab` já usado pela barra de abas de work items — a mesma classe de bug que motivou parte deste redesenho):

```js
} else if (target.closest && target.closest('[data-action="select-dialog-tab"]')) {
  const tab = target.closest('[data-action="select-dialog-tab"]').dataset.dialogTab;
  activeDialogTab = tab;
  applyDialogTab();
  if (tab === 'history') {
    vscode.postMessage({ type: 'load-work-item-history' });
  }
}
```

Abrir o modal (`kb-toggle-search-btn`/`kb-add-tab-btn`/`kb-footer-select-work-item-btn`) sempre reseta `activeDialogTab = 'search'` e chama `applyDialogTab()`, igual já reseta `activeQueryId`/o campo de busca hoje — abrir o modal sempre começa na aba Search, independente de qual aba estava ativa da última vez.

### 3. Select de tipo — `renderSearchResults.ts` + JS do webview

**Nota pós-implementação:** o design abaixo (um `<select>` nativo) foi o que de fato foi implementado inicialmente, mas foi trocado por um dropdown customizado (mesmo padrão do picker de status/assignee — trigger + menu, `kb-search-type-filter`/`kb-search-type-filter-option`) a pedido do usuário, pra mostrar o ícone configurado de cada tipo — algo que um `<option>` nativo não renderiza (só texto puro). O restante desta seção documenta a intenção original (contagem por tipo, painéis por tipo, preservar seleção entre buscas); a única mudança é a troca do elemento `<select>` por um dropdown com abrir/fechar/posicionamento próprios.

Para minimizar mudança de superfície, `renderSearchResults` continua retornando uma única string (como hoje) e continua sendo inserida inteira em `#kb-search-results` a cada busca — só o que ela gera no lugar do tab bar muda: em vez de `<div class="kb-search-tabs">` com um `<button>` por tipo, ela gera um `<select id="kb-search-type-select">` (com uma `<option>` por tipo, contagem incluída) seguido pelos mesmos painéis de sempre, só renomeados de `kb-search-tab-panel`/`data-tab-panel` para `kb-search-type-panel`/`data-type-panel` (evita qualquer confusão com `data-tab-id` da barra de abas de work items):

```ts
export function renderSearchResults(items, config, typeCounts, avatars = {}): string {
  ...
  if (types.length === 0) {
    return renderStatusGroups(items, config, avatars); // inalterado
  }
  const options = [`<option value="all">All (${items.length})</option>`, ...types.map(type =>
    `<option value="${escapeHtml(type)}">${escapeHtml(type)} (${typeCounts[type] ?? 0})</option>`
  )].join('');
  const panels = tabs.map(tab => `<div class="kb-search-type-panel" data-type-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config, avatars)}</div>`).join('');

  return `<select id="kb-search-type-select">${options}</select>${panels}`;
}
```

O `<select>` fica **dentro** de `#kb-search-results` (recriado a cada busca, junto dos painéis) — isso preserva a mensagem `search-results` e o handler dela exatamente como são hoje (`KanbrainViewProvider.ts:503`, `1824-1829`), sem precisar separar option/painéis em campos diferentes da mensagem.

O único cuidado do lado do cliente é preservar a seleção do usuário entre uma busca e a próxima (já que o `<select>` é recriado): mantém-se uma variável `activeSearchType` (substitui a `activeSearchTab` quebrada) e, depois de inserir o novo HTML, reaplica-se o valor e a visibilidade dos painéis:

```js
function applySearchTypeFilter() {
  const select = document.getElementById('kb-search-type-select');
  if (select) select.value = activeSearchType;
  document.querySelectorAll('.kb-search-type-panel').forEach((panel) => {
    panel.classList.toggle('kb-hidden', panel.dataset.typePanel !== activeSearchType);
  });
}
```

Chamada tanto depois de inserir o HTML de `search-results` (como `applySearchTab()` já era chamada hoje) quanto num listener de `change` **delegado por id, não por `data-action`** (evitando a classe de bug descrita acima — o elemento é recriado a cada busca, então o listener precisa ser delegado, mas checando `target.id` em vez de um `data-action` compartilhado):

```js
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'kb-search-type-select') {
    activeSearchType = e.target.value;
    applySearchTypeFilter();
  }
});
```

`activeSearchTab`/`applySearchTab` (a mecânica antiga, quebrada) são removidos.

### 4. CSS

Reaproveita quase tudo de `.kb-search-tab*` (renomeado pra `.kb-dialog-tab*`, usado pelas duas novas abas Search/History) e adiciona uma regra simples pro `<select>` de tipo (reaproveitando o estilo já existente de `#kb-team-select`/`#kb-profile-select`) e pro `.kb-search-filters-row` (`display: flex; align-items: center; gap: 8px;`, pra por checkbox e select lado a lado).

## Tratamento de erros

Nenhuma mudança — os dois caminhos de erro existentes (`searchWorkItems`'s catch, `loadWorkItemHistory`'s catch) continuam intactos, só a superfície visual muda.

## Testes

- `src/view/render.test.ts` / `src/view/renderHome.test.ts`: `kb-history-section` não existe mais isoladamente; `#kb-search-section` contém as duas abas internas (`data-dialog-tab="search"`/`"history"`) e os dois painéis; `kb-history-btn` não aparece mais em nenhum dos dois.
- `src/view/renderSearchResults.test.ts`: a função continua devolvendo uma única string; os testes que hoje verificam `kb-search-tabs`/`data-tab="..."`/`kb-search-tab-empty`/`data-tab-panel="..."` passam a verificar `#kb-search-type-select`/`<option value="...">`/`data-type-panel="..."`.
- Sem teste automatizado pro JS inline novo (troca de aba interna, filtro por select) — mesmo padrão já estabelecido no resto do arquivo; verificação manual (F5) na tarefa final.
