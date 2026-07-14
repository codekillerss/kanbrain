# Inline work item search — Design

## Contexto e motivação

Hoje, selecionar um work item ativo depende do comando `Kanbrain: Select Work Item`, que abre o QuickPick nativo do VS Code (sobrepondo a UI, fora do painel). Pior: quando **nenhum** work item está selecionado, o painel nem mostra um jeito de disparar essa busca — só um texto estático dizendo pra rodar o comando pela paleta. Isso quebra o fluxo de "olhar o painel e já poder agir" que é a proposta central do Kanbrain.

Este design adiciona busca/seleção de work item **embutida no próprio painel** (webview), com uma lista inicial agrupada por status (visão "board" empilhada, já que o painel é uma coluna estreita e não comporta colunas lado a lado), filtrável por texto — substituindo o QuickPick como ponto de entrada principal, tanto no estado vazio quanto para trocar o item ativo.

## Escopo

**Dentro do escopo:**
- Campo de busca + lista de resultados renderizados dentro do HTML do painel (extension host continua sendo o único lado que fala com a API do Azure DevOps e que gera HTML — o webview só injeta o HTML recebido e faz postMessage).
- Lista inicial (query vazia) agrupada por status, carregada automaticamente quando a seção de busca aparece — seja porque não há item ativo, seja porque o usuário clicou em "Trocar work item".
- Cap de 50 resultados via `TOP 50` na WIQL, evitando estourar o limite de 200 ids da API de `getWorkItems` e mantender a lista "board" enxuta.
- Botão "🔍 Trocar work item" substituindo o atual "Selecionar work item" quando já há item ativo, alternando a visibilidade da seção de busca só no client-side (sem round-trip).
- Dedup da persistência do work item ativo em `workspaceState` — hoje só acontece dentro de `selectWorkItem.ts`; passa a ser responsabilidade central do `KanbrainViewProvider.setActiveWorkItem`, usada pelos dois fluxos (comando via paleta e seleção inline).
- Tratamento de erro inline quando a busca falha (rede/token), sem promise rejeitada sem tratamento.

**Fora do escopo:**
- Remover o comando `Kanbrain: Select Work Item` (QuickPick) — continua existindo e funcionando como hoje, útil via paleta de comandos.
- Debounce no campo de busca — o QuickPick atual também não tem, mantemos o mesmo comportamento (busca a cada tecla).
- Board horizontal (colunas lado a lado) — o painel é estreito demais; a visão "board" aqui é uma lista vertical com seções por status.
- Paginação além dos 50 resultados iniciais — se precisar de mais, o usuário refina a busca por texto.

## Arquitetura

### Protocolo de mensagens (webview ↔ extension host)

- **Webview → Extension:** `{ type: 'search-work-items', query: string }` — disparado a cada `input` no campo de busca, e uma vez automaticamente (com `query: ''`) sempre que a seção de busca fica visível (estado vazio no load, ou ao abrir via "Trocar work item").
- **Extension → Webview:** `{ type: 'search-results', html: string }` — a extension host já renderiza o HTML dos resultados; o webview só faz `document.getElementById('kb-search-results').innerHTML = message.html`.
- **Webview → Extension:** `{ type: 'pick-work-item', id: number }` — ao clicar num resultado da lista.
- Removido: `{ type: 'select-work-item' }` (disparava `vscode.commands.executeCommand('kanbrain.selectWorkItem')`) — nada mais envia essa mensagem, já que o botão do painel agora abre a busca inline em vez do QuickPick.

### Módulos novos (puros, testáveis sem VS Code)

- **`src/view/escapeHtml.ts`** — extrai a função `esc()` que hoje vive só dentro de `render.ts`, exportada como `escapeHtml(value: string): string`, usada por `render.ts` e pelo novo `renderSearchResults.ts`.
- **`src/view/groupByStatus.ts`** — `groupByStatus(items: WorkItem[]): { status: string; items: WorkItem[] }[]`, agrupa preservando a ordem de chegada (a API já retorna ordenado por `ChangedDate DESC`) e a ordem de primeiro-aparecimento de cada status.
- **`src/view/renderSearchResults.ts`** — `renderSearchResults(items: WorkItem[]): string`, usa `groupByStatus` + `escapeHtml` pra montar as seções empilhadas (`ACTIVE (2)`, `NEW (1)` etc.), cada item como `<button data-action="pick-work-item" data-id="...">`. Lista vazia → `<div class="kb-empty">Nenhum work item encontrado.</div>`.

### `src/azureDevOps/wiql.ts`

`buildSearchQuery` ganha `SELECT TOP 50` na base da query (`BASE_QUERY`), tanto pro caso vazio quanto pro caso filtrado — mantém a API de `getWorkItems` sempre dentro do limite de 200 ids por chamada e a lista "board" enxuta.

### `src/view/render.ts`

- Estado "nenhum work item selecionado": troca o texto estático atual por:
  ```html
  <input id="kb-search-input" placeholder="Buscar por título ou #id...">
  <div id="kb-search-results"></div>
  ```
  (results começa vazio no HTML — populado via mensagem assim que o webview carrega, ver seção de wiring).
- Estado "com work item ativo": o header troca `<button id="kb-select-btn">Selecionar work item</button>` por `<button id="kb-toggle-search-btn">🔍 Trocar work item</button>`, e a mesma seção de busca (`kb-search-input`/`kb-search-results`) fica presente porém com `class="kb-hidden"` (`display: none` via CSS), alternada no clique do botão via JS local.

### Wiring — `KanbrainViewProvider.ts`

`onDidReceiveMessage`:
- Remove o branch `select-work-item`.
- Adiciona `search-work-items`: se não houver `workspaceRoot`/`client`/config válido, ignora (mesmo padrão de guarda de `runSkill`). Caso contrário, `readConfig` → `client.searchWorkItems(org, project, query)` → `client.getWorkItems(...)` → `renderSearchResults(items)` → `webviewView.webview.postMessage({ type: 'search-results', html })`. Em caso de erro (catch), responde com `{ type: 'search-results', html: '<div class="kb-empty">Erro ao buscar work items.</div>' }`.
- Adiciona `pick-work-item`: `this.setActiveWorkItem(Number(message.id))`.

Construtor ganha um parâmetro novo: `persistActiveWorkItem: (id: number) => void`, chamado dentro de `setActiveWorkItem` sempre que `id !== undefined`. Isso move a responsabilidade de persistir em `workspaceState` pra dentro do provider, usada pelos dois fluxos (paleta e inline) em vez de só pelo comando.

### Wiring — `extension.ts`

```ts
const provider = new KanbrainViewProvider(
  workspaceRoot,
  client,
  () => getCurrentBranch(workspaceRoot ?? ''),
  id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
);
```

### Wiring — `src/commands/selectWorkItem.ts`

Remove a chamada direta `context.workspaceState.update('kanbrain.activeWorkItemId', selected.id)` — `onSelect(selected.id)` (que agora é `provider.setActiveWorkItem`) já persiste. `context: vscode.ExtensionContext` era usado só ali; com a chamada removida, o parâmetro `context` fica sem uso no arquivo inteiro. `registerSelectWorkItemCommand` perde esse parâmetro (assinatura passa a ser `(client, workspaceRoot, onSelect)`), e a chamada em `extension.ts` (`registerSelectWorkItemCommand(client, workspaceRoot, context, id => provider.setActiveWorkItem(id))`) vira `registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id))`.

### JS do webview (`KanbrainViewProvider.wrapHtml`)

Adições ao `<script>` já existente:
- `window.addEventListener('message', event => { if (event.data.type === 'search-results') document.getElementById('kb-search-results').innerHTML = event.data.html; })`.
- Listener de `input` em `#kb-search-input` → `vscode.postMessage({ type: 'search-work-items', query: e.target.value })`.
- Delegação de clique existente ganha mais um caso: `data-action === 'pick-work-item'` → `vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id })`.
- Clique em `#kb-toggle-search-btn` → alterna `class="kb-hidden"` na seção de busca; se estava escondida e ficou visível, dispara `vscode.postMessage({ type: 'search-work-items', query: '' })`.
- Ao carregar (fim do script, fora de qualquer listener): se a seção de busca já está visível por padrão (estado sem item ativo), dispara a mesma busca vazia inicial.

## Tratamento de erros

- Falha ao buscar (rede, token expirado) durante `search-work-items`: captura no extension host, responde com HTML de erro inline (`Erro ao buscar work items.`) em vez de deixar a promise rejeitar sem tratamento.
- Config ausente/`client`/`workspaceRoot` ausentes ao receber `search-work-items` ou `pick-work-item`: ignora silenciosamente (mesmo padrão de guarda já usado em `runSkill`) — não deveria acontecer na prática, já que a seção de busca só aparece quando há config e work item potencialmente selecionável.

## Testes

- `src/view/escapeHtml.test.ts` — casos de escaping de `&`, `<`, `>`, `"`.
- `src/view/groupByStatus.test.ts` — agrupa preservando ordem de chegada, lida com lista vazia.
- `src/view/renderSearchResults.test.ts` — seções por status, escaping de título, `data-id`/`data-action` corretos, mensagem de "nenhum encontrado".
- `src/azureDevOps/wiql.test.ts` — atualizado pra checar `SELECT TOP 50` em todos os casos (vazio, por id, por título).
- `src/view/render.ts` importa `escapeHtml` em vez de definir `esc()` localmente; `src/view/render.test.ts` atualizado: o teste "shows a select-work-item prompt" passa a checar a presença de `id="kb-search-input"` em vez do texto `Kanbrain: Select Work Item`; novo teste garante que o botão `kb-toggle-search-btn` aparece (com texto "Trocar work item") quando há item ativo.
- `KanbrainViewProvider.ts`, `extension.ts` e `selectWorkItem.ts` continuam sem teste unitário direto (mesmo padrão vscode-heavy já adotado no projeto) — cobertos pela checklist manual do README, que ganha itens novos pra esse fluxo.

## Impacto em documentação

`README.md`: a checklist de verificação manual ganha itens novos cobrindo a busca inline (lista inicial agrupada por status ao abrir sem item ativo, filtro por texto, clique seleciona e persiste, botão "Trocar work item" alterna a seção, erro de busca mostra mensagem inline).
