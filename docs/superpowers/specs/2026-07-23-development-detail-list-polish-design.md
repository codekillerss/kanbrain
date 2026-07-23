# Development list in the detail panel — visual polish — Design

## Contexto e motivação

A spec anterior (`2026-07-23-development-badge-and-detail-move-design.md`) moveu a lista completa de branches/PRs (com título/status) para a coluna lateral do painel de detalhes (`renderWorkItemDetail.ts`, coluna `kb-detail-side`), reaproveitando `renderDevelopmentSection` sem alterar sua aparência. Depois de testar (F5), o usuário pediu quatro ajustes visuais/UX nessa seção especificamente no detail panel:

1. A seção Development deveria ter a mesma borda que os outros grupos da coluna lateral (State, Work Item Type, Assigned To, etc. — na verdade esses campos vêm agrupados em `DetailGroup`s renderizados por `renderDetailGroup`, com a classe `.kb-detail-group`/`.kb-detail-group-label`), mas hoje usa um wrapper diferente (`.kb-field-row`, sem borda).
2. Quando houver muitos links, mostrar só 3 inicialmente, com um botão "See more" que revela mais 5 por clique — repetível (se sobrarem mais de 8 no total, precisa poder clicar de novo).
3. Nomes de branch / títulos de PR longos devem ser truncados com reticências (ellipsis) em vez de quebrar linha ou estourar a caixa.
4. Diferenciação visual melhor entre item de branch e item de PR — ícone próprio por tipo.

O painel de detalhes (`WorkItemDetailPanelManager`) cria o webview com `enableScripts: false` (CSP restritiva, decisão deliberada de segurança). O botão "See more" precisa funcionar sem JavaScript — usamos o truque clássico de checkbox+label escondidos via CSS (`:checked ~`/`:checked +`), sem alterar essa postura de segurança.

O ícone de branch já existente (`BRANCH_FORK_ICON`) é um path real da Fluent UI System Icons (copiado, com procedência documentada na spec original). Para o ícone de PR, não há garantia de reproduzir de memória o path exato do Fluent sem risco de sair incorreto — em vez disso, usamos um glifo próprio, simples (dois círculos conectados por uma linha com uma seta), construído com primitivas SVG básicas (`circle`/`path`) em vez de um path complexo único, para eliminar o risco de uma forma malformada.

## Escopo

**Dentro do escopo:**
- `renderDevelopmentSection` (único consumidor: `renderWorkItemDetail.ts` / painel de detalhes) — todas as 4 mudanças abaixo.
- Novo ícone de PR (glifo custom), reutilizando o ícone de branch existente para itens do tipo `branch`.
- CSS novo/ajustado só em `WorkItemDetailPanelManager.ts` (único lugar que estiliza a seção Development completa desde a spec anterior).

**Fora do escopo:**
- `renderDevelopmentBadge` (card) — inalterado, continua só ícone+contagem.
- Habilitar `enableScripts` no painel de detalhes.
- Paginação/ellipsis/ícone por tipo em qualquer outro lugar do app — só nesta seção.
- Buscar o path exato do ícone Fluent para PR (decisão do usuário: usar glifo custom).

## Design

### 1. Estrutura do item: ícone por tipo + truncamento

`renderDevelopmentItem` passa a envolver o texto num `<span class="kb-dev-item-text">`, colocar o ícone certo antes dele (branch: ícone de fork existente; PR: novo ícone custom), e adicionar `title="..."` com o texto completo (mesmo texto escapado, reaproveitado — `escapeHtml` já escapa aspas, seguro para atributo):

```ts
function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    const name = escapeHtml(link.branchName);
    return `<div class="kb-dev-item" title="${name}">${BRANCH_FORK_ICON}<span class="kb-dev-item-text">${name}</span></div>`;
  }
  const details = prDetails[`${link.repositoryId}:${link.pullRequestId}`];
  const label = details
    ? `#${link.pullRequestId} ${escapeHtml(details.title)} (${escapeHtml(capitalize(details.status))})`
    : `#${link.pullRequestId}`;
  return `<div class="kb-dev-item" title="${label}">${renderPullRequestIcon()}<span class="kb-dev-item-text">${label}</span></div>`;
}
```

Novo ícone de PR (glifo custom, primitivas simples, `currentColor`):

```ts
function renderPullRequestIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/>
    <circle cx="18" cy="6" r="2.5" stroke="currentColor" stroke-width="2"/>
    <path d="M6 15.5V9a3 3 0 0 1 3-3h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 3l4 3-4 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
```

CSS (em `WorkItemDetailPanelManager.ts`):

```css
.kb-dev-item { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 4px; opacity: 0.85; }
.kb-dev-item svg { flex-shrink: 0; }
.kb-dev-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

### 2. Container: mesma borda dos outros grupos

`renderDevelopmentSection` troca o wrapper `.kb-field-row` por `.kb-detail-group`/`.kb-detail-group-label` (classes já existentes, usadas por `renderDetailGroup` — nenhuma CSS nova necessária para a borda em si):

```ts
export function renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string {
  if (development.length === 0) {
    return '';
  }
  const visible = development.slice(0, INITIAL_VISIBLE);
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label kb-dev-label">${BRANCH_FORK_ICON}<span>Development</span></div>
      ${visible.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, INITIAL_VISIBLE)}
    </div>
  `;
}
```

### 3. Paginação: 3 visíveis + lotes de 5 via checkbox aninhado

```ts
const INITIAL_VISIBLE = 3;
const BATCH_SIZE = 5;

function renderMoreBatches(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>, startIndex: number): string {
  if (startIndex >= development.length) {
    return '';
  }
  const batch = development.slice(startIndex, startIndex + BATCH_SIZE);
  const checkboxId = `kb-dev-more-${startIndex}`;
  return `
    <input type="checkbox" id="${checkboxId}" class="kb-dev-more-toggle" />
    <div class="kb-dev-extra">
      ${batch.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, startIndex + BATCH_SIZE)}
    </div>
    <label for="${checkboxId}" class="kb-dev-more-btn">See more</label>
  `;
}
```

Cada nível fica aninhado dentro do `.kb-dev-extra` do nível anterior — os seletores CSS (`:checked +`/`:checked ~`) são relativos ao pai imediato, então as mesmas 4 regras funcionam em qualquer profundidade, sem precisar de classes únicas por lote (só o `id` do checkbox precisa ser único, garantido pelo `startIndex`). Com N itens, aparecem `ceil((N-3)/5)` botões "See more" aninhados, cada clique revelando o próximo lote e escondendo seu próprio botão (o botão do próximo nível, se houver, já está dentro do lote revelado).

CSS:

```css
.kb-dev-more-toggle { display: none; }
.kb-dev-extra { display: none; }
.kb-dev-more-toggle:checked + .kb-dev-extra { display: block; }
.kb-dev-more-toggle:checked ~ .kb-dev-more-btn { display: none; }
.kb-dev-more-btn { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--vscode-textLink-foreground); cursor: pointer; }
.kb-dev-more-btn:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
```

Sem JavaScript — `enableScripts` do painel continua `false`.

## Tratamento de erros

- Nenhum caminho de erro novo. `development.length === 0` continua retornando `''` (sem grupo, sem botão).
- `renderMoreBatches` com `development.length <= INITIAL_VISIBLE` retorna `''` (sem paginação) — comportamento correto para 0–3 itens, o caso mais comum.

## Testes

`renderDevelopment.test.ts`:
- Wrapper: seção com 1 link usa `kb-detail-group` e `kb-detail-group-label` (não mais `kb-field-row`).
- Ícone por tipo: item de branch contém o path do ícone de fork (`M11 5.5`); item de PR contém `<circle` (assinatura do novo ícone, ausente no ícone de branch) — confirma que são visualmente diferentes.
- Ellipsis: item envolve o texto em `<span class="kb-dev-item-text">`.
- Tooltip: item tem `title="..."` com o texto completo (escapado).
- Paginação: com 10 links, aparecem exatamente 2 `kb-dev-more-toggle` (`ceil((10-3)/5) = 2`), 2 ocorrências de `See more`, e o total de `kb-dev-item` no HTML é 10 (todos presentes no DOM, só ocultos por CSS enquanto não marcados).
- Paginação: com 3 links ou menos, não aparece nenhum `kb-dev-more-toggle`/`See more`.
- Testes existentes (branch escapado, PR resolvido/não resolvido, múltiplos links) continuam passando sem alteração — o texto ainda aparece no HTML, só dentro de uma estrutura adicional (span/ícone/atributo).

Sem mudança necessária em `renderWorkItemDetail.test.ts` (já cobre que a seção aparece/não aparece; a aparência interna é responsabilidade dos testes de `renderDevelopment.test.ts`).
