# Polish de UX na sidebar: foco na busca, item atual no histórico, título clicável na Home — Design

## Contexto e motivação

Três ajustes pequenos e independentes de UX pedidos pelo usuário, todos na sidebar da extensão:

1. Ao abrir o dialog de busca de work items, o input de texto não recebe foco automaticamente — o usuário precisa clicar nele antes de digitar.
2. No dialog de "Work Item History", a lista pode conter o próprio work item atualmente ativo (`current work item`). Hoje ele aparece como qualquer outro item, clicável para "set as current" — uma ação sem efeito real, já que já é o current. O botão "View details" deve continuar funcionando normalmente.
3. Na Home, o card do current work item é renderizado sem título clicável (`clickableTitle = false`), diferente da tela Flow, onde o mesmo card (`kb-main-card`) tem o título clicável para abrir o detail panel, com hover visual. Na Home esse comportamento está faltando.

Os três itens são pequenos, tocam arquivos diferentes e não têm dependência entre si — agrupados numa spec só por serem do mesmo tema (polish da sidebar), mas cada um pode ser implementado e testado isoladamente.

## Escopo

**Dentro do escopo:**
- `KanbrainViewProvider.ts`: dar foco no `#kb-search-input` ao abrir a seção de busca (script inline do webview).
- `renderWorkItemHistory.ts`: novo parâmetro opcional `currentWorkItemId`; quando um item da lista tem `item.id === currentWorkItemId`, desabilita o botão principal (`pick-work-item`) e exibe um badge "Current" ao lado do título. O botão "View details" não é afetado.
- `KanbrainViewProvider.ts` (`loadWorkItemHistory`): passar `this.activeWorkItemId` para `renderWorkItemHistory`.
- `renderHome.ts`: mudar o argumento `clickableTitle` de `false` para `true` na chamada de `renderWorkItemCard` dentro de `renderHomeWorkItemSection`.
- CSS (`KanbrainViewProvider.ts`): regra de estado desabilitado para `.kb-result-item-main` e estilo do novo badge "Current".

**Fora do escopo:**
- Qualquer mudança na lógica de quem é o "current work item" (`activeWorkItemId`) — só consumimos o valor já existente.
- Mudança de estrutura/CSS do `renderSearchResults.ts` (dialog de busca por texto) — o botão "pick-work-item" lá não precisa desse tratamento, pois a lista de busca já pode conter o item atual sem problema (não é o foco do pedido).
- `.kb-title-clickable` / CSS de hover do título — já existe e é reaproveitado sem alteração.

## Design

### 1. Foco no input de busca

Em `KanbrainViewProvider.ts`, no listener de clique delegado, no branch que já existe para `kb-toggle-search-btn` / `kb-footer-select-work-item-btn`:

```js
if (target.id === 'kb-toggle-search-btn' || target.id === 'kb-footer-select-work-item-btn') {
  const section = document.getElementById('kb-search-section');
  if (section) {
    const wasHidden = section.classList.contains('kb-hidden');
    section.classList.toggle('kb-hidden');
    if (wasHidden) {
      vscode.postMessage({ type: 'search-work-items', query: '' });
      document.getElementById('kb-search-input')?.focus();
    }
  }
}
```

O foco só é disparado quando a seção estava escondida (abrindo o dialog), não ao fechar.

### 2. Work Item History — item atual desabilitado

`renderWorkItemHistory.ts`:

```ts
export function renderWorkItemHistory(
  items: WorkItem[],
  config: KanbrainConfig,
  avatars: Record<string, string> = {},
  currentWorkItemId?: number,
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work item history yet.</div>';
  }
  return items.map(item => {
    const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
    const assignee = config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
    const isCurrent = item.id === currentWorkItemId;
    const currentBadge = isCurrent ? '<span class="kb-current-badge">Current</span>' : '';
    return `<div class="kb-result-item kb-history-item"${borderStyle}>
      <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}"${isCurrent ? ' disabled' : ''}>
        ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>${currentBadge}
      </button>
      <div class="kb-history-item-status">${renderStatusDot(item.status, config.statusColors ?? {})}${escapeHtml(item.status)}</div>
      <div class="kb-result-item-footer kb-history-item-footer">
        ${assignee}
        <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
      </div>
    </div>`;
  }).join('');
}
```

`KanbrainViewProvider.ts` (`loadWorkItemHistory`), linha que hoje é:

```ts
this.view.webview.postMessage({ type: 'work-item-history', html: renderWorkItemHistory(items, config, avatars) });
```

passa a ser:

```ts
this.view.webview.postMessage({ type: 'work-item-history', html: renderWorkItemHistory(items, config, avatars, this.activeWorkItemId) });
```

CSS novo:

```css
.kb-result-item-main:disabled { opacity: 0.5; cursor: default; }
.kb-result-item-main:disabled:hover { background: none; }
.kb-current-badge { flex-shrink: 0; margin-left: 6px; padding: 1px 5px; border-radius: 8px; font-size: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
```

O botão "View details" (`kb-view-details-link`) é um elemento irmão independente do botão principal — não recebe `disabled` e continua funcionando normalmente para o item atual.

### 3. Home — título do current work item clicável

Em `renderHome.ts`, `renderHomeWorkItemSection`:

```ts
${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, true, null, false, state.selectedTeam)}
```

(sexto argumento, `clickableTitle`, muda de `false` para `true`). O restante da assinatura não muda. Isso já aplica `class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="..."` no título, reaproveitando o handler de clique delegado (`open-work-item-detail`, já tratado em `KanbrainViewProvider.ts`) e o CSS de hover já existente:

```css
.kb-title-clickable { cursor: pointer; }
.kb-title-clickable:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
```

Nenhum CSS novo necessário para o hover.

## Tratamento de erros

Nenhum caso novo de erro. `currentWorkItemId` é opcional (`undefined` quando não há current work item, ex.: histórico acessado antes de setar um item ativo) — nesse caso `isCurrent` é sempre `false` para todo item, comportamento idêntico ao atual.

## Testes

- `KanbrainViewProvider.ts` não tem testes unitários para o script inline do webview (é HTML/JS gerado como string) — verificação manual do foco no VS Code.
- `renderWorkItemHistory.test.ts`: novo teste garantindo que, ao passar `currentWorkItemId` igual ao `id` de um item, o botão correspondente ganha `disabled` e o badge "Current" aparece, enquanto o botão "View details" do mesmo item continua sem `disabled`; e que os demais itens (id diferente) não são afetados. Teste adicional garantindo que omitir `currentWorkItemId` mantém o comportamento atual (nenhum item desabilitado).
- `renderHome.test.ts`: teste existente que hoje afirma `expect(html).not.toContain('kb-title-clickable')` precisa ser invertido para `toContain`, já que o título passa a ser clicável.
