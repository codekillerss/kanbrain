# Seção "Current Work Item" com ações no header — Design

## Contexto e motivação

Na tela Flow, o card do work item selecionado hoje fica solto num `.kb-card-wrapper`, com os botões de trocar (⇄) e limpar (✕) sobrepostos ao canto do card via `.kb-card-actions` (posicionamento absoluto). As seções "Parent" e "Children" logo abaixo já seguem outro padrão: uma caixa `.kb-section-card` com border única e um header `.kb-section-label`. O usuário quer que a seção do work item atual siga esse mesmo padrão — virando uma caixa com header "Current Work Item" — e que os botões de trocar/limpar migrem do overlay sobre o card para esse header, ao lado do título.

## Escopo

**Dentro do escopo:**
- `render.ts` (tela Flow, `screen === 'flow'`): a seção do work item atual passa a ser `<div class="kb-section-card">` com header `<div class="kb-section-label">` contendo o texto "Current Work Item" e, à direita, os botões `#kb-toggle-search-btn` (⇄) e `#kb-clear-btn` (✕) — mesmos `id`, `class` (`kb-icon-btn`) e `title` de hoje, só reposicionados no markup. O `.kb-card-wrapper` deixa de conter `.kb-card-actions`; passa a conter só o card.
- CSS (`KanbrainViewProvider.ts`): `.kb-section-label` vira `display: flex; align-items: center; justify-content: space-between;` para acomodar título + ações lado a lado. Novo `.kb-section-actions { display: flex; gap: 2px; }` para agrupar os dois botões. Nenhuma outra regra de `.kb-section-card`/`.kb-main-card`/`.kb-card-wrapper` muda — a regra existente `.kb-section-card .kb-main-card { border: none; margin: 0; }` já remove a border própria do card dentro da caixa, e `.kb-section-card .kb-card-wrapper { margin: 10px; }` já dá o espaçamento interno, ambas herdadas sem alteração.

**Fora do escopo:**
- `renderHome.ts` (tela Home): continua usando o padrão atual — `.kb-card-wrapper` + `.kb-card-actions` sobrepostos ao card. Nenhuma mudança lá.
- Comportamento dos botões (handlers por `id` em `KanbrainViewProvider.ts`): inalterado — os handlers procuram por `target.id`, então funcionam independente de onde o botão está no DOM.
- `.kb-parent-section`/label "Parent" e o header "Children (n)": continuam texto puro; o novo `display: flex` em `.kb-section-label` não muda a aparência deles (um único nó de texto num container flex renderiza igual a um bloco normal).

## Design

### `render.ts`

Troca:

```html
<div class="kb-card-wrapper">
  ${renderWorkItemCard(...)}
  <div class="kb-card-actions">
    <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
    <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
  </div>
</div>
```

por:

```html
<div class="kb-section-card">
  <div class="kb-section-label">
    <span>Current Work Item</span>
    <div class="kb-section-actions">
      <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
      <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
    </div>
  </div>
  <div class="kb-card-wrapper">
    ${renderWorkItemCard(...)}
  </div>
</div>
```

### CSS (`KanbrainViewProvider.ts`)

```css
.kb-section-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 0 8px; padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-list-hoverBackground)); border-radius: 3px; }
.kb-section-actions { display: flex; gap: 2px; }
```

(`.kb-card-actions`/posicionamento absoluto permanecem intactos — ainda usados por `renderHome.ts`.)

## Tratamento de erros

Nenhum caso novo — é reposicionamento de markup/CSS existente, sem novos estados ou modos de falha.

## Testes

- `render.test.ts`: testes existentes que checam `kb-toggle-search-btn`/`kb-clear-btn` continuam válidos (mesmos ids). Adicionar checagem de que, na tela Flow, o texto "Current Work Item" aparece dentro de um `kb-section-card`/`kb-section-label`, e que `kb-card-actions` não aparece mais nesse trecho (só a seção do card atual — a busca por `kb-card-actions` inteira do documento não se aplica, já que a seção "Parent"/"Children" nunca teve esse elemento).
- `renderHome.test.ts`: sem mudança — continua validando `kb-card-actions` no contexto da Home.
