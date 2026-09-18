# Unificar os modais de busca e histórico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar `#kb-search-section` e `#kb-history-section` num único modal com duas abas internas ("Search"/"History"), pra que o histórico fique acessível também ao abrir uma nova aba de trabalho (hoje só é alcançável pela Home/pelo card ativo). Trocar as abas por tipo de work item dentro dos resultados de busca (hoje quebradas — ver spec) por um `<select>` ao lado do checkbox "Assigned to me". Remover o botão `kb-history-btn`, redundante depois da unificação.

**Spec:** `docs/superpowers/specs/2026-09-17-merge-search-history-dialog-design.md`

## Global Constraints

- **Não implementar direto na `main`.** Criar uma worktree/branch antes da Task 1 (skill `superpowers:using-git-worktrees`).
- **Não commitar automaticamente.** Cada tarefa termina em "rode os testes, confirme que passam", não em commit. Só commitar se pedido explicitamente, depois, fora deste plano.
- Não muda nenhum comportamento de busca no servidor (query, filtros, `AzureDevOpsClient`) — só a camada de apresentação (HTML/CSS/JS do webview) e a remoção do bug de troca de aba/tipo.
- Não adiciona nenhuma chamada de leitura nova — histórico e busca já existem como mensagens (`load-work-item-history`, `search-work-items`), só mudam onde/como disparam.

---

## Task 1: Mesclar o markup dos dois modais em `render.ts`

**Files:**
- Modify: `src/view/render.ts` (`renderHistoryDialog` removida, `renderSearchDialog` reescrita, chamadas em `render()` e nas seções de ações da Flow)
- Modify: `src/view/renderHome.ts` (`renderHomeFlowActions`)
- Test: `src/view/render.test.ts`, `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `#kb-search-section` passa a conter duas abas internas (`data-action="select-dialog-tab" data-dialog-tab="search"|"history"`) e dois painéis (`data-dialog-panel="search"|"history"`); `#kb-history-section` deixa de existir; `kb-history-btn` deixa de existir em ambas as telas — Task 3 depende dessa estrutura pra ligar a troca de aba.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/view/render.test.ts`, adaptar/adicionar (adequar aos helpers `workItem`/`config` já existentes no arquivo):

```ts
  it('merges search and history into a single dialog with two internal tabs', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    expect(html).not.toContain('id="kb-history-section"');
    const dialogStart = html.indexOf('id="kb-search-section"');
    const dialogEnd = html.indexOf('id="kb-footer', dialogStart);
    const dialog = html.slice(dialogStart, dialogEnd);

    expect(dialog).toContain('data-action="select-dialog-tab" data-dialog-tab="search"');
    expect(dialog).toContain('data-action="select-dialog-tab" data-dialog-tab="history"');
    expect(dialog).toContain('data-dialog-panel="search"');
    expect(dialog).toContain('data-dialog-panel="history"');
    expect(dialog).toContain('id="kb-history-results"');
  });

  it('no longer renders a dedicated history button on the flow screen', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    expect(html).not.toContain('kb-history-btn');
  });
```

Em `src/view/renderHome.test.ts` (reutilizar os helpers já existentes no arquivo):

```ts
  it('no longer renders a dedicated history button', () => {
    const html = renderHome({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('kb-history-btn');
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: FAIL — `kb-history-section` ainda existe, `kb-history-btn` ainda existe, `select-dialog-tab` não existe.

- [ ] **Step 3: Reescrever `renderSearchDialog` e remover `renderHistoryDialog`**

Em `src/view/render.ts`, substituir a função `renderHistoryDialog` (linhas 59-69) e `renderSearchDialog` (linhas 71-98) por uma única função:

```ts
function renderSearchDialog(config: KanbrainConfig): string {
  return `
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
          <div class="kb-query-combobox">
            <div id="kb-query-trigger" class="kb-query-trigger">
              <span id="kb-query-trigger-label" class="kb-query-trigger-label kb-query-trigger-placeholder">Filter by saved query...</span>
            </div>
            <button id="kb-query-clear-btn" class="kb-query-clear-btn kb-hidden" title="Clear query" aria-label="Clear query">✕</button>
            <span id="kb-query-combobox-icon" class="kb-query-combobox-icon" aria-hidden="true">▼</span>
            <div id="kb-query-options" class="kb-query-dropdown kb-hidden">
              <input id="kb-query-filter-input" placeholder="Filter by saved query..." autocomplete="off">
              <div id="kb-query-options-list"></div>
            </div>
          </div>
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <label class="kb-checkbox-row">
            <input type="checkbox" id="kb-search-assigned-to-me" ${config.searchAssignedToMe ? 'checked' : ''}>
            Assigned to me
          </label>
          <div id="kb-search-results"></div>
        </div>

        <div class="kb-dialog-panel kb-hidden" data-dialog-panel="history">
          <div id="kb-history-results"><div class="kb-empty">Loading...</div></div>
        </div>
      </div>
    </div>
  `;
}
```

(A caixa de busca de saved query moveu pra dentro do painel "search" — antes ficava no header do diálogo de busca; agora o header é compartilhado pelas duas abas, então o combobox de query só faz sentido dentro do painel de busca.)

Atualizar os pontos de `render()` que chamavam as duas funções separadamente (linhas 130, 133, 136, 177-178) pra chamar só `renderSearchDialog(state.config)` (remover toda referência a `renderHistoryDialog()`).

- [ ] **Step 4: Remover `kb-history-btn`**

Em `src/view/render.ts`, na seção de ações da Flow (por volta da linha 183-187):

```ts
        <div class="kb-section-actions">
          <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
          <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
        </div>
```

Em `src/view/renderHome.ts`, `renderHomeFlowActions` (linhas 5-16), mesma remoção do `<button id="kb-history-btn" ...>`.

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run src/view/render.test.ts src/view/renderHome.test.ts`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte completa e o typecheck**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos — nenhum outro teste referencia `kb-history-section`/`renderHistoryDialog` diretamente.

Do not commit — see Global Constraints.

---

## Task 2: Trocar o tab bar de tipo por um `<select>` em `renderSearchResults.ts`

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Test: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: a mesma assinatura de `renderSearchResults(items, config, typeCounts, avatars)`, mesmo retorno (uma string), mas o markup do "tab bar" vira um `<select id="kb-search-type-select">` e os painéis passam a usar `kb-search-type-panel`/`data-type-panel` em vez de `kb-search-tab-panel`/`data-tab-panel`.

- [ ] **Step 1: Atualizar os testes existentes que checavam o tab bar antigo**

Em `src/view/renderSearchResults.test.ts`, substituir os quatro testes que hoje verificam o tab bar (`renders no tab bar...`, `renders a tab per work item type...`, `shows the type tab count...`, `marks a type tab as empty...`, `scopes each type panel...`) por:

```ts
  it('renders no type select when there are no configured work item types', () => {
    const html = renderSearchResults([workItem()], config(), {});

    expect(html).not.toContain('kb-search-type-select');
  });

  it('renders a select option per work item type, in config order, plus an "all" option first', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {}, Task: {} } }), { Epic: 3, Task: 7 });

    const allIndex = html.indexOf('value="all"');
    const epicIndex = html.indexOf('value="Epic"');
    const taskIndex = html.indexOf('value="Task"');

    expect(allIndex).toBeGreaterThanOrEqual(0);
    expect(epicIndex).toBeGreaterThan(allIndex);
    expect(taskIndex).toBeGreaterThan(epicIndex);
    expect(html).toContain('All (2)');
  });

  it('shows the type option count from typeCounts, not from the filtered item list', () => {
    const items = [workItem({ id: 1, type: 'Epic' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {} } }), { Epic: 12 });

    expect(html).toContain('Epic (12)');
  });

  it("scopes each type panel to only that type's items", () => {
    const items = [workItem({ id: 1, type: 'Epic', title: 'An epic' }), workItem({ id: 2, type: 'Task', title: 'A task' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {}, Task: {} } }), { Epic: 1, Task: 1 });

    const epicPanelStart = html.indexOf('data-type-panel="Epic"');
    const taskPanelStart = html.indexOf('data-type-panel="Task"');
    const epicPanel = html.slice(epicPanelStart, taskPanelStart);

    expect(epicPanel).toContain('An epic');
    expect(epicPanel).not.toContain('A task');
  });
```

(A contagem-zero de um tipo, antes marcada com a classe visual `kb-search-tab-empty`, não precisa de um teste equivalente — um `<option>` de select não tem estado visual de "vazio" separado do texto da própria contagem, que já é coberto pelo teste de contagem acima.)

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: FAIL nos quatro testes novos/adaptados — o markup atual ainda gera `kb-search-tabs`/`data-tab`/`data-tab-panel`.

- [ ] **Step 3: Implementar o select**

Em `src/view/renderSearchResults.ts`, substituir o bloco `tabBar`/`panels` (linhas 59-80) por:

```ts
  const options = [
    `<option value="all">All (${items.length})</option>`,
    ...types.map(
      type => `<option value="${escapeHtml(type)}">${escapeHtml(type)} (${typeCounts[type] ?? 0})</option>`,
    ),
  ].join('');

  const panels = tabs
    .map(tab => `<div class="kb-search-type-panel" data-type-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config, avatars)}</div>`)
    .join('');

  return `<select id="kb-search-type-select">${options}</select>${panels}`;
```

(`tabs` continua definido como está hoje — linhas 59-67 — só o que é gerado a partir dele muda.)

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS — nenhum outro arquivo depende de `kb-search-tab`/`data-tab-panel` (só o JS do webview, que a Task 3 atualiza).

Do not commit — see Global Constraints.

---

## Task 3: JS do webview — trocar de aba interna (Search/History) e filtrar por tipo via `<select>`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
  - Estado no topo do `<script>` (por volta da linha 1176)
  - `applySearchTab`/`activeSearchTab` (linhas 1176-1185) — removidos
  - `click` delegado (branches `kb-toggle-search-btn`/`kb-add-tab-btn`, linhas 1407-1440; branch antigo de `select-tab` de tipo, linha 1557; branch de `kb-history-btn`, linhas 1445-1450)
  - `window.addEventListener('message', ...)` (branch `search-results`, linha 1824)
  - Novo listener de `change` delegado

**Interfaces:**
- Consumes: a estrutura de `data-action="select-dialog-tab"`/`data-dialog-panel`/`#kb-search-type-select`/`.kb-search-type-panel` das Tasks 1-2.
- Produces: nada consumido por tarefa futura — última peça funcional da feature.

Sem teste automatizado — mesmo padrão já estabelecido pro resto do arquivo (JS inline em template string). Verificação manual na Task 5.

- [ ] **Step 1: Trocar o estado de aba antigo pelo novo**

Substituir (por volta da linha 1176):

```js
    let activeSearchTab = 'all';

    function applySearchTab() {
      document.querySelectorAll('.kb-search-tab').forEach((btn) => {
        btn.classList.toggle('kb-search-tab-active', btn.dataset.tab === activeSearchTab);
      });
      document.querySelectorAll('.kb-search-tab-panel').forEach((panel) => {
        panel.classList.toggle('kb-hidden', panel.dataset.tabPanel !== activeSearchTab);
      });
    }
```

por:

```js
    let activeDialogTab = 'search';
    let activeSearchType = 'all';

    function applyDialogTab() {
      document.querySelectorAll('.kb-dialog-tab').forEach((btn) => {
        btn.classList.toggle('kb-dialog-tab-active', btn.dataset.dialogTab === activeDialogTab);
      });
      document.querySelectorAll('.kb-dialog-panel').forEach((panel) => {
        panel.classList.toggle('kb-hidden', panel.dataset.dialogPanel !== activeDialogTab);
      });
    }

    function applySearchTypeFilter() {
      const select = document.getElementById('kb-search-type-select');
      if (select) select.value = activeSearchType;
      document.querySelectorAll('.kb-search-type-panel').forEach((panel) => {
        panel.classList.toggle('kb-hidden', panel.dataset.typePanel !== activeSearchType);
      });
    }
```

- [ ] **Step 2: Resetar a aba interna pra "search" sempre que o diálogo abre**

Nos três branches que abrem o diálogo (`kb-toggle-search-btn`/`kb-footer-select-work-item-btn`, `kb-add-tab-btn` — linhas 1409-1440), adicionar `activeDialogTab = 'search'; applyDialogTab();` junto das outras linhas de reset (`activeQueryId = null; setQueryTriggerLabel(...)`, etc.) — em ambos os branches, não só num.

- [ ] **Step 3: Substituir o branch de `kb-history-btn` por um branch de `select-dialog-tab`**

Remover o branch `target.id === 'kb-history-btn'` (linhas 1445-1450) e o branch morto de `target.dataset.action === 'select-tab'` (linha 1557-1559, que checava `activeSearchTab`). Adicionar, no lugar do primeiro (mesma posição relativa, antes do branch de `kb-history-close-btn`):

```js
      } else if (target.closest && target.closest('[data-action="select-dialog-tab"]')) {
        const tab = target.closest('[data-action="select-dialog-tab"]').dataset.dialogTab;
        activeDialogTab = tab;
        applyDialogTab();
        if (tab === 'history') {
          vscode.postMessage({ type: 'load-work-item-history' });
        }
```

`kb-history-close-btn` e o branch de clique-fora do `kb-history-section` (linhas 1451-1454) somem — o histórico não tem mais um overlay/close button próprio, ele fecha junto do `kb-search-close-btn` compartilhado.

- [ ] **Step 4: Trocar o listener de clique da aba de tipo por um listener de `change`**

Adicionar, ao lado dos outros `document.addEventListener(...)` de nível superior (por exemplo logo após o listener de `click` delegado):

```js
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'kb-search-type-select') {
        activeSearchType = e.target.value;
        applySearchTypeFilter();
      }
    });
```

- [ ] **Step 5: Atualizar o handler de `search-results` pra reaplicar o filtro de tipo**

Trocar (linha 1824-1829):

```js
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
          applySearchTab();
        }
```

por:

```js
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
          applySearchTypeFilter();
        }
```

- [ ] **Step 6: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos.

Do not commit — see Global Constraints.

---

## Task 4: CSS — abas internas do diálogo e linha de filtros

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts` (método `css()`, por volta das linhas 1946-1981)

- [ ] **Step 1: Renomear e ajustar as regras existentes**

Trocar `.kb-search-tabs`/`.kb-search-tab*` (linhas 1976-1981) por `.kb-dialog-tabs`/`.kb-dialog-tab*`, mantendo a mesma aparência (mesmas propriedades, só o seletor muda) — essas classes agora estilizam as abas "Search"/"History" do header, não mais as abas de tipo:

```css
      .kb-dialog-tabs { display: flex; gap: 4px; overflow-x: auto; }
      .kb-dialog-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-dialog-tab:hover { background: var(--vscode-list-hoverBackground); }
      .kb-dialog-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
```

(`.kb-search-tab:disabled`/`.kb-search-tab-empty` não têm equivalente novo — nenhuma das duas abas Search/History é desabilitada ou "vazia".)

- [ ] **Step 2: Ajustar o header do diálogo pra caber as abas + botão fechar**

`.kb-search-dialog-header` (linha 1949) já é `display: flex; align-items: center; gap: 6px;` — confirmar que isso continua funcionando com `.kb-dialog-tabs` (que tem `flex-shrink: 0` nos itens, então deve encaixar sem precisar de mudança na regra do header).

- [ ] **Step 3: Nova regra pra linha de filtros (checkbox + select) e pro select de tipo**

Adicionar, perto de `.kb-checkbox-row`:

```css
      .kb-search-filters-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .kb-search-filters-row .kb-checkbox-row { margin-bottom: 0; }
      #kb-search-type-select { flex: 1; box-sizing: border-box; padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
```

Envolver o checkbox `kb-search-assigned-to-me` e o `<select id="kb-search-type-select">` (este último só existe depois da primeira busca, dentro de `#kb-search-results`) numa `<div class="kb-search-filters-row">` — mas como o select é gerado dinamicamente por `renderSearchResults` (Task 2), ajustar a Task 1 pro checkbox já vir embrulhado em `<div class="kb-search-filters-row"><label class="kb-checkbox-row">...</label></div>`, e o CSS acima garante que o select (que aparece depois, dentro de `#kb-search-results`, logo abaixo) tenha a mesma largura/estilo — não precisa estar literalmente na mesma linha flex do checkbox pra o objetivo original ("perto do checkbox") ser atendido visualmente, já que ambos ficam empilhados verticalmente e próximos. Se durante a verificação manual (Task 5) o resultado não ficar bom visualmente, mover o `<select>` pra dentro do mesmo `kb-search-filters-row` exigiria mudar `renderSearchResults` pra não incluir o select no HTML de `#kb-search-results` e sim ter um placeholder fixo no diálogo — decisão a confirmar na revisão visual, não antecipar aqui.

- [ ] **Step 4: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos.

Do not commit — see Global Constraints.

---

## Task 5: Verificação manual end-to-end

**Files:** nenhum — só roda a extensão.

- [ ] **Step 1: Abrir a extensão (F5) contra um workspace Kanbrain real**

- [ ] **Step 2: Abrir o diálogo pelos três gatilhos e confirmar que sempre abre na aba "Search"**

`kb-toggle-search-btn` (Home e Flow), `kb-add-tab-btn` (+ na barra de abas), e o botão do footer (`kb-footer-select-work-item-btn`, se aplicável) — os três devem abrir o mesmo modal, sempre começando na aba "Search".

- [ ] **Step 3: Trocar pra aba "History" e confirmar que carrega a lista**

Clicar "History" dentro do modal (aberto por qualquer um dos três gatilhos acima). Confirma: dispara `load-work-item-history`, mostra a lista de itens recentes, e o item atualmente ativo aparece desabilitado com o badge "Current".

- [ ] **Step 4: Confirmar que o modo (`replace` vs `add`) funciona igual nas duas abas**

Abrir o modal pelo `kb-add-tab-btn` (modo "add"), trocar pra "History", clicar num item do histórico — confirma que abre **numa aba nova** (não substitui a aba atual). Repetir abrindo pelo `kb-toggle-search-btn` (modo "replace") — confirma que **substitui** o item da aba atual. Esse é o bug pré-existente do spec sendo verificado como corrigido.

- [ ] **Step 5: Confirmar o filtro por tipo**

Na aba "Search", digitar uma busca (ou deixá-la vazia) que traga resultados de mais de um tipo de work item. Confirma: o `<select>` de tipo mostra "All (N)" e uma opção por tipo com contagem; trocar a seleção filtra os resultados visíveis pro tipo escolhido; digitar uma nova busca preserva o tipo selecionado (não volta pra "All" sozinho).

- [ ] **Step 6: Confirmar que o botão de histórico sumiu**

Nas duas telas (Home e Flow), confirmar que só resta `kb-toggle-search-btn` e `kb-clear-btn` na seção de ações — sem `kb-history-btn`.

- [ ] **Step 7: Reportar resultados**

Se tudo dos Steps 2-6 passar, a feature está pronta. Se algo falhar, corrigir como um follow-up pequeno da task específica que introduziu aquilo (não misturar correções não relacionadas), depois rodar este checklist de novo desde o topo.

Do not commit — see Global Constraints. Wait for explicit instruction before committing or pushing anything from this plan.
