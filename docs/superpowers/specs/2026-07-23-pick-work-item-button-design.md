# Botão de trocar current work item nos children cards e no parent banner — Design

## Contexto e motivação

Na tela Flow, trocar o work item atual hoje só é possível pela busca (⇄ no header do "Current Work Item"), pelas setas do sibling navigator, ou clicando no título de um card (que abre o painel de detalhes, não troca o item atual). O usuário quer um jeito direto de trocar o item atual a partir dos próprios cards já visíveis na tela: um botão no canto superior direito de cada card children, e um botão equivalente no parent banner — clicar nele faz aquele item (child ou parent) virar o novo work item atual, sem precisar abrir detalhes nem usar a busca.

## Escopo

**Dentro do escopo:**
- Novo botão `⇄` com `data-action="pick-work-item"` e `data-id="<id do item>"` — reaproveita o mecanismo `pick-work-item` já existente (usado hoje pelas setas do sibling navigator): o listener delegado em `KanbrainViewProvider.ts` (linha ~530, `target.closest('[data-action="pick-work-item"]')`) já dispara `postMessage({ type: 'pick-work-item', id })` para qualquer elemento com esse `data-action`, então nenhum código novo é necessário do lado do webview/extension para o disparo em si.
- `renderWorkItemCard.ts`: novo parâmetro opcional `showPickButton = false`. Quando `true`, renderiza o botão no canto superior direito do card. Chamada em `render.ts` para os cards de `state.subtasks` (seção "Children") passa `showPickButton: true`. As demais chamadas (`kb-main-card` em `render.ts` e em `renderHome.ts`) continuam `false` — sem o botão no card do item atual, em nenhuma tela.
- `renderParentContext.ts` (`renderParentBanner`): adiciona o mesmo botão dentro da faixa do parent, alinhado à direita.
- CSS (`KanbrainViewProvider.ts`): `.kb-subtask-card` ganha `position: relative` (compartilhado com `.kb-main-card` na regra existente — sem efeito colateral, já que `.kb-main-card` não terá o botão). Novo `.kb-pick-btn` posicionado `absolute; top: 4px; right: 4px;` para os cards. No parent banner, o botão entra como último filho da row flex existente, com `margin-left: auto`.

**Fora do escopo:**
- Nenhuma mudança em `kb-main-card` (card do item atual, em Flow ou Home) — sem o botão lá.
- Nenhuma mudança no mecanismo `pick-work-item` em si (já существe e já faz refetch completo do item escolhido).
- Cards de resultado de busca (`renderSearchResults.ts`) — fora do pedido, não mencionados pelo usuário; já têm seu próprio fluxo de seleção.

## Design

### `renderWorkItemCard.ts`

```ts
function renderPickButton(id: number): string {
  return `<button type="button" class="kb-icon-btn kb-pick-btn" data-action="pick-work-item" data-id="${id}" title="Set as current work item">⇄</button>`;
}

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
): string {
  // ...
  return `
    <div class="${cssClass}"${borderStyle}>
      ${showPickButton ? renderPickButton(workItem.id) : ''}
      <div class="kb-card-header">...</div>
      ...
    </div>
  `;
}
```

`renderPickButton` fica local a `renderWorkItemCard.ts` (não precisa ser compartilhado com `renderParentContext.ts` — são duas linhas de HTML simples, extrair um helper cross-file por isso seria over-engineering).

### `render.ts`

```ts
const subtasksHtml = state.subtasks.length
  ? state.subtasks
      .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true))
      .join('')
  : '<div class="kb-empty">No child items.</div>';
```

(Só o último argumento novo, `true`, nessa chamada. A chamada do `kb-main-card` na mesma função não muda — fica com o padrão `showPickButton = false`.)

### `renderParentContext.ts` (`renderParentBanner`)

```ts
export function renderParentBanner(parent: WorkItem | null, config: KanbrainConfig): string {
  if (!parent) {
    return '';
  }
  const { iconHtml } = renderTypeAccent(parent.type, config);
  return `
    <div class="kb-parent-banner" data-action="open-work-item-detail" data-id="${parent.id}">
      ${iconHtml}<span class="kb-link-text">#${parent.id}: ${escapeHtml(parent.title)}</span>
      <button type="button" class="kb-icon-btn kb-pick-btn" data-action="pick-work-item" data-id="${parent.id}" title="Set as current work item">⇄</button>
    </div>
  `;
}
```

O botão fica dentro da própria `.kb-parent-banner` (que já tem `data-action="open-work-item-detail"` no `div` pai). Como o listener delegado testa `pick-work-item` antes de `open-work-item-detail` (KanbrainViewProvider.ts, linhas ~530-533) e usa `target.closest(...)`, clicar no botão dispara só `pick-work-item` — o clique não "vaza" para o `open-work-item-detail` do banner.

### CSS (`KanbrainViewProvider.ts`)

```css
.kb-main-card, .kb-subtask-card { position: relative; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
.kb-pick-btn { position: absolute; top: 4px; right: 4px; }
.kb-parent-banner .kb-pick-btn { position: static; margin-left: auto; }
```

`.kb-pick-btn` herda tamanho/hover de `.kb-icon-btn` (24×24, transparente, hover com `--vscode-toolbar-hoverBackground`) — só adiciona o posicionamento. Dentro do parent banner, a segunda regra desliga o `position: absolute` (a banner já é uma row flex de uma linha só, então o botão só precisa ser o último item com `margin-left: auto`).

## Tratamento de erros

Nenhum caso novo — `pick-work-item` já trata a troca de item (refetch completo) e já é usado hoje pelas setas do sibling navigator; o botão só adiciona mais um `data-id` disparando o mesmo fluxo.

## Testes

- `renderWorkItemCard.test.ts`: novo teste — `showPickButton: true` inclui `kb-pick-btn`/`data-action="pick-work-item"` com o `id` correto; `showPickButton` omitido/`false` (comportamento padrão, cobre os testes existentes) não inclui `kb-pick-btn`.
- `render.test.ts`: cards em `state.subtasks` (seção Children) incluem `kb-pick-btn`; o card principal (`kb-main-card`) não inclui.
- `renderHome.test.ts`: sem mudança esperada — `kb-main-card` na Home continua sem `showPickButton`.
- `renderParentContext.test.ts`: `renderParentBanner` com parent inclui `kb-pick-btn` com `data-id` do parent.
