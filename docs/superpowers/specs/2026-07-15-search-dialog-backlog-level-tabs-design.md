# Abas por backlog level no diálogo de busca — Design

## Contexto e motivação

O diálogo "Trocar work item" (`renderSearchResults`) hoje mostra até 50 work items numa única lista, agrupada só por status. Quando o projeto mistura Epics, Features, Stories e Tasks nesse mesmo lote, fica difícil enxergar rapidamente "quantos Epics existem" ou "onde estão as Tasks", especialmente misturado com [[search-result-card-styling]] (ícone/borda por tipo), que ajuda a diferenciar um item por vez mas não agrupa por nível.

Esta mudança adiciona uma aba por backlog level (Epics/Features/Stories/Tasks, conforme o processo real do projeto) acima da lista de resultados, permitindo filtrar a visão sem sair do diálogo. Complementa a estilização por tipo (ícone/borda) já especificada em `docs/superpowers/specs/2026-07-15-search-result-card-styling-design.md`, que diferencia um item por vez mas não agrupa por nível.

## Escopo

**Dentro do escopo:**
- Barra de abas no diálogo de busca: "Todos" (primeira, comportamento de hoje) + uma aba por backlog level configurado, na ordem de `config.backlogLevels`.
- Trocar de aba filtra a lista já buscada (mesmo lote de até 50 itens da busca "Todos") sem nova chamada à API — troca instantânea.
- Cada aba de backlog level mostra, entre parênteses no rótulo, o **total de work items desse nível no projeto** — não a contagem de quantos aparecem na aba após um filtro de busca. Esse número é buscado uma vez quando o diálogo abre (ou é limpo, ao rodar a busca com texto vazio) e fica fixo enquanto o usuário digita uma busca; só é recalculado na próxima abertura.
- A aba "Todos" mostra, entre parênteses, a quantidade de itens realmente listados nela (o tamanho do lote atual, no máximo 50) — como já seria natural, sem mudança de significado.
- A aba selecionada é lembrada (variável no escopo do script da webview) entre reaberturas do diálogo e trocas de busca, dentro da mesma sessão da webview — reseta apenas se a `webview.html` inteira for reconstruída (ex: work item ativo muda enquanto o diálogo está aberto).
- Uma aba de backlog level sem nenhum item no projeto (contagem 0) continua visível, com o número "(0)" e estilo visualmente atenuado, mas clicável (mostra "Nenhum work item encontrado.").

**Fora do escopo:**
- Filtrar a lista listada por backlog level via nova busca na API — a lista de cada aba (exceto "Todos") continua sendo um recorte local do mesmo lote de 50 itens buscado pra "Todos", então pode mostrar menos itens do que o total indicado no cabeçalho da aba quando há texto de busca digitado. Isso é aceito intencionalmente (ver acima).
- Mudar o limite de 50 itens da busca "Todos", ou adicionar paginação.
- Persistir a aba selecionada entre reinícios do VS Code (`workspaceState`) — fica só em memória da webview durante a sessão.
- Debounce no campo de busca — não é necessário porque a contagem por nível não roda mais a cada tecla digitada (só na abertura do diálogo), então o volume de chamadas por tecla não muda em relação ao que existe hoje.

## Design

### Contagem por backlog level (nova query)

WIQL não suporta `COUNT`/`GROUP BY`. A contagem por nível é obtida com uma query WIQL por backlog level, filtrando `[System.WorkItemType] IN (...)` com os tipos daquele nível (invertendo `config.typeToBacklogLevel`, já disponível — não precisa buscar nada novo do Azure DevOps em Setup), sem filtro de título e sem `$top`, usando só o tamanho da lista de IDs retornada (`ids.length`) — sem buscar os work items completos, já que só o número importa aqui.

**`src/azureDevOps/wiql.ts`** ganha:
```ts
export function buildTypeCountQuery(types: string[]): string
```
Monta `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN (<tipos escapados>)`.

**`src/azureDevOps/client.ts`** (`AzureDevOpsClient`) ganha:
```ts
async countWorkItemsByType(organization: string, project: string, types: string[]): Promise<number>
```
Roda a query acima via WIQL (mesmo endpoint de `searchWorkItems`, sem `$top=50`) e retorna `data.workItems.length`. Retorna `0` sem chamar a API se `types` estiver vazio.

### Estado novo no `KanbrainViewProvider`

```ts
private backlogLevelCounts: Record<string, number> = {};
```

Em `searchWorkItems(query)`, quando `query.trim() === ''` (diálogo abrindo ou busca limpa), busca as contagens de todos os backlog levels em paralelo (`Promise.all`, um `countWorkItemsByType` por nível, usando os tipos daquele nível invertendo `config.typeToBacklogLevel`) e guarda em `this.backlogLevelCounts` antes de renderizar. Para uma busca com texto não vazio, reaproveita o valor já guardado (não recalcula).

### `renderSearchResults` ganha um terceiro parâmetro

```ts
export function renderSearchResults(items: WorkItem[], config: KanbrainConfig, backlogLevelCounts: Record<string, number>): string
```

Quando `items.length === 0`, comportamento inalterado (mensagem de vazio, sem abas — igual hoje).

Caso contrário:
- Monta a lista de abas: `{ id: 'all', label: 'Todos', count: items.length }` seguida de uma entrada por `Object.keys(config.backlogLevels)`, com `count: backlogLevelCounts[level] ?? 0`.
- Se `config.backlogLevels` estiver vazio (config antigo, sem esse campo populado), nenhuma aba de nível é adicionada — se sobrar só "Todos", a barra de abas é omitida inteiramente e a lista renderiza como hoje (sem abas), evitando uma barra de uma aba só.
- Cada aba de nível filtra `items` localmente por `config.typeToBacklogLevel[item.type] === level` pra montar sua lista (reaproveitando o agrupamento por status já existente, extraído para uma função interna `renderStatusGroups(items, config)`).
- Markup por aba: `<button class="kb-search-tab" data-action="select-tab" data-tab="<id>"><label> (<count>)</button>`, com a classe extra `kb-search-tab-empty` adicionada quando `count === 0`. Seguido de um painel por aba: `<div class="kb-search-tab-panel" data-tab-panel="<id>">` com o resultado de `renderStatusGroups` pra aquela aba.

### Cliente (webview): troca de aba sem round-trip

No `<script>` de `KanbrainViewProvider.wrapHtml`:
- Variável de módulo `let activeSearchTab = 'all';` (fora do handler de mensagem, sobrevive a re-renders do conteúdo de `#kb-search-results`).
- Função `applySearchTab()`: alterna a classe `kb-search-tab-active` no botão cujo `data-tab` bate com `activeSearchTab`, e a classe `kb-hidden` (já existente) nos painéis cujo `data-tab-panel` não bate.
- Handler de clique ganha um branch `data-action === 'select-tab'`: seta `activeSearchTab = target.dataset.tab` e chama `applySearchTab()`.
- Após `results.innerHTML = event.data.html` no listener de `search-results`, chama `applySearchTab()` de novo, reaplicando a aba lembrada ao HTML recém-recebido.

### CSS

Novo, dentro do método `css()`:
```css
.kb-search-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 6px; }
.kb-search-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
.kb-search-tab:hover { background: var(--vscode-list-hoverBackground); }
.kb-search-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
.kb-search-tab-empty { opacity: 0.5; }
```

## Tratamento de erros

- Falha ao buscar a contagem de um backlog level (ex: token expirado): como faz parte do mesmo `try/catch` da busca principal em `searchWorkItems`, qualquer falha nas N queries de contagem cai no mesmo tratamento de erro já existente — mensagem inline de erro substitui toda a área de resultados, igual a uma falha na busca "Todos" hoje. `this.backlogLevelCounts` mantém o último valor bem-sucedido (não é sobrescrito em caso de falha), mas isso é irrelevante pro usuário já que a tela de erro substitui a renderização inteira nesse ciclo.
- `config.backlogLevels` vazio ou ausente: sem abas de nível, sem chamada de contagem — lista renderiza como antes desta mudança.

## Testes

- `src/azureDevOps/wiql.test.ts`: novo caso pra `buildTypeCountQuery` — monta o `IN (...)` corretamente, escapa aspas simples nos nomes de tipo, e (se aplicável) o caso de lista vazia.
- `src/azureDevOps/client.test.ts`: novo caso pra `countWorkItemsByType` — retorna `ids.length` da resposta mockada da API; retorna `0` sem chamar `fetch` quando `types` está vazio.
- `src/view/renderSearchResults.test.ts`: novos casos cobrindo — barra de abas presente com uma aba por backlog level na ordem de `config.backlogLevels`; contagem de cada aba de nível vem de `backlogLevelCounts`, não de `items.filter(...).length`; aba "Todos" mostra `items.length`; aba com contagem 0 recebe a classe `kb-search-tab-empty`; sem abas quando `config.backlogLevels` está vazio.
