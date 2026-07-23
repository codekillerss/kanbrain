# Faixa do parent + navegador de irmãos na tela Flow — Design

## Contexto e motivação

Na sessão anterior implementamos `taskBacklogTypesByTeam` para sempre exibir o parent nos cards de work items do backlog level de Tasks (`docs/superpowers/specs/2026-07-23-always-show-parent-for-task-backlog-design.md`), já que no Sprint Taskboard real do Azure esses itens aparecem organizados em lanes por parent. Depois de conversar mais sobre o problema, surgiu uma solução mais direta e mais geral: em vez de forçar a exibição do parent só para um backlog level específico (via detecção de tipo), a tela Flow passa a exibir **sempre** uma faixa com a informação do parent do card selecionado (quando ele tiver um), **e** um navegador horizontal (bolinhas + setas) para percorrer os irmãos daquele card — outros work items filhos do mesmo parent.

Essa nova faixa+navegador tornam o `taskBacklogTypesByTeam` desnecessário: como a faixa aparece sempre que há parent, independente do tipo/backlog level, o caso de uso que motivou aquela feature (garantir visibilidade do parent pros itens do Task board) já fica coberto de forma mais ampla. A feature anterior é revertida por completo.

O comportamento de exibição do "Parent: #id" **dentro** do card (`renderParentRow`/`resolveShowParent`, mirrorando o toggle "Parent" do board settings) **não muda** — continua existindo em todo lugar que já existe hoje (Flow, Home, subtask cards), com a configuração por board de cada time. A nova faixa é um elemento adicional, só na tela Flow, que aparece incondicionalmente quando há parent — mesmo que isso signifique, em alguns casos, ver a mesma informação duas vezes (faixa em cima + "Parent: #id" inline dentro do card, se o board settings tiver isso ligado). Aceito deliberadamente — sem mudança em `renderWorkItemCard`.

## Escopo

**Dentro do escopo:**
- Reverter completamente `taskBacklogTypesByTeam`: `AzureDevOpsClient.getTaskBacklogWorkItemTypes`, `discoverTaskBacklogTypes.ts`, o campo em `BoardState`/`KanbrainConfig`, a fiação em `setup.ts`/`syncConfig.ts`/`syncBoardConfig.ts`, e o override em `resolveShowParent` — com todos os testes correspondentes.
- Novo arquivo `renderParentContext.ts` com duas funções: `renderParentBanner` (faixa com info do parent, clicável) e `renderSiblingNavigator` (bolinhas + setas pra navegar entre irmãos).
- Sem chamada de API nova: o navegador usa `parent.childIds` (já disponível hoje, já que `parent` já é buscado em `KanbrainViewProvider.refresh()` quando `workItem.parentId` existe).
- Navegação pelas setas reaproveita o mecanismo `pick-work-item` já existente (mesmo usado pela busca) — troca de fato o work item ativo do Flow, com refetch completo do irmão selecionado.
- Só aparece na tela Flow (`render.ts`), acima do card principal. Sem mudança em `renderHome.ts` nem nos subtask cards.

**Fora do escopo:**
- Qualquer diferenciação visual das bolinhas por tipo/status do irmão (cor, tooltip) — avaliado e descartado nesta sessão: sem uso real definido, e exigiria uma chamada de API nova (`getChildren(parent)`) a cada poll de 5s só pra dados que não apareceriam em lugar nenhum. Fica pra uma spec futura, se e quando houver um uso concreto.
- Bolinhas clicáveis — só indicam posição/quantidade; navegação é só pelas setas.
- Qualquer mudança em `renderWorkItemCard`/`resolveShowParent`/card settings — comportamento inalterado.

## Design

### 1. Revert de `taskBacklogTypesByTeam`

Remove por completo (arquivos e trechos introduzidos na spec anterior):
- `AzureDevOpsClient.getTaskBacklogWorkItemTypes` (`client.ts`) e seus testes em `client.test.ts`.
- `src/azureDevOps/discoverTaskBacklogTypes.ts` e `discoverTaskBacklogTypes.test.ts` (arquivos inteiros).
- `BoardState.taskBacklogTypesByTeam` e sua atribuição em `discoverBoardState.ts`, e o teste correspondente em `discoverBoardState.test.ts`.
- `KanbrainConfig.taskBacklogTypesByTeam` em `types.ts`.
- O parâmetro `taskBacklogTypesByTeam`/`freshTaskBacklogTypesByTeam` em `setup.ts`, `syncConfig.ts` e `syncBoardConfig.ts`, e os testes correspondentes em `syncConfig.test.ts`.
- O override em `resolveShowParent` (`resolveCardFieldVisibility.ts`) — volta a ser só `resolveCardField(config, workItemType, selectedTeam, 'parent')`, sem a checagem de task backlog. `resolveTeamName` pode continuar existindo como helper interno (é uma extração razoável independente da feature revertida) ou voltar a ficar inline — mantém como helper, já que não faz mal e evita duplicar a cadeia de fallback entre `resolveShowParent`/`resolveCardField`. Os 4 testes de task-backlog em `resolveCardFieldVisibility.test.ts` são removidos.

### 2. `renderParentBanner` (novo arquivo `src/view/renderParentContext.ts`)

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

export function renderParentBanner(parent: WorkItem | null, config: KanbrainConfig): string {
  if (!parent) {
    return '';
  }
  const { iconHtml } = renderTypeAccent(parent.type, config);
  return `
    <div class="kb-parent-banner" data-action="open-work-item-detail" data-id="${parent.id}">
      ${iconHtml}<span class="kb-link-text">#${parent.id}: ${escapeHtml(parent.title)}</span>
    </div>
  `;
}
```

Mesmo `data-action="open-work-item-detail"` já usado por `renderParentRow` hoje — clicar na faixa abre o painel de detalhes do parent, sem código novo no lado do webview (o handler de clique delegado já existe em `KanbrainViewProvider.ts`).

### 3. `renderSiblingNavigator` (mesmo arquivo)

```ts
const MAX_VISIBLE_DOTS = 5;

function renderArrow(direction: 'prev' | 'next', siblingId: number | null): string {
  const symbol = direction === 'prev' ? '‹' : '›';
  const className = `kb-sibling-arrow kb-sibling-arrow-${direction}`;
  if (siblingId === null) {
    return `<button type="button" class="${className}" disabled>${symbol}</button>`;
  }
  return `<button type="button" class="${className}" data-action="pick-work-item" data-id="${siblingId}">${symbol}</button>`;
}

export function renderSiblingNavigator(workItem: WorkItem, parent: WorkItem | null): string {
  if (!parent) {
    return '';
  }
  const siblings = parent.childIds;
  const currentIndex = siblings.indexOf(workItem.id);
  if (currentIndex === -1) {
    return '';
  }

  const prevId = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextId = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const windowSize = Math.min(MAX_VISIBLE_DOTS, siblings.length);
  const start = Math.min(
    Math.max(0, currentIndex - Math.floor(windowSize / 2)),
    Math.max(0, siblings.length - windowSize),
  );
  const windowIds = siblings.slice(start, start + windowSize);

  const dotsHtml = windowIds
    .map(id => `<span class="kb-sibling-dot${id === workItem.id ? ' kb-sibling-dot-active' : ''}"></span>`)
    .join('');

  return `
    <div class="kb-sibling-nav">
      ${renderArrow('prev', prevId)}
      <div class="kb-sibling-dots">${dotsHtml}</div>
      ${renderArrow('next', nextId)}
    </div>
  `;
}
```

- `!parent`: sem faixa, sem navegador (caso normal de item sem parent).
- `currentIndex === -1` (defensivo — `workItem.id` não está em `parent.childIds`, o que não deveria acontecer já que `workItem.parentId === parent.id`, mas é tratado sem quebrar): sem navegador.
- 1 único filho (o próprio card selecionado): `windowSize = 1`, 1 bolinha ativa, ambas as setas desabilitadas — aparece mesmo assim, conforme decidido.
- Mais de 5 irmãos: janela deslizante de 5 bolinhas, centralizada na posição atual, recalculada a cada navegação (o `clamp` do `start` garante que a janela nunca "vaza" pra antes do início ou depois do fim da lista).
- Navegação: clicar numa seta dispara `pick-work-item` com o `id` do irmão correspondente — o mesmo mecanismo que a busca já usa hoje (troca o work item ativo do Flow, refetch completo).

### 4. `render.ts`: nova posição na tela Flow

```ts
import { renderParentBanner, renderSiblingNavigator } from './renderParentContext';

// ...
const parentBannerHtml = renderParentBanner(state.parent, state.config);
const siblingNavHtml = renderSiblingNavigator(state.workItem, state.parent);

return `
  <div class="kb-header kb-page-header">...</div>
  <div id="kb-search-section" class="kb-search-overlay kb-hidden">...</div>
  ${parentBannerHtml}
  ${siblingNavHtml}
  <div class="kb-card-wrapper">
    ${renderWorkItemCard(...)}
    ...
  </div>
  ...
`;
```

Sem mudança em `renderHome.ts` (Home continua sem faixa/navegador) nem em `renderWorkItemCard.ts` (subtask cards e o comportamento de `showParent` inalterados).

### 5. CSS (`KanbrainViewProvider.ts`)

```css
.kb-parent-banner { display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 4px; border: 1px solid var(--vscode-panel-border); border-radius: 4px 4px 0 0; cursor: pointer; font-size: 12px; }
.kb-parent-banner:hover { background: var(--vscode-list-hoverBackground); }
.kb-parent-banner .kb-link-text { color: var(--vscode-textLink-foreground); }
.kb-sibling-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0; margin-bottom: 8px; }
.kb-sibling-arrow { background: none; border: none; color: var(--vscode-foreground); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
.kb-sibling-arrow:disabled { opacity: 0.3; cursor: default; }
.kb-sibling-dots { display: flex; gap: 6px; }
.kb-sibling-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-panel-border); }
.kb-sibling-dot-active { background: var(--vscode-textLink-foreground); }
```

## Tratamento de erros

- `state.parent === null`: `renderParentBanner`/`renderSiblingNavigator` retornam `''` — nada aparece, mesmo comportamento de hoje quando não há parent.
- `workItem.id` ausente de `parent.childIds` (inconsistência de dados improvável): `renderSiblingNavigator` retorna `''` em vez de calcular um índice inválido.
- Nenhuma chamada de API nova — nenhum novo modo de falha de rede introduzido.

## Testes

- `renderParentContext.test.ts` (novo):
  - `renderParentBanner`: `''` sem parent; com parent, contém ícone de tipo, `#id`, título escapado, `data-action="open-work-item-detail"` com o `id` do parent.
  - `renderSiblingNavigator`: `''` sem parent; com 1 filho (`childIds` só com o próprio `workItem.id`), 1 bolinha ativa e ambas as setas com `disabled`; com N irmãos, seta prev/next tem o `data-id` correto e fica ausente/desabilitada nas pontas da lista; janela de 5 bolinhas centralizada corretamente quando há mais de 5 irmãos, testando posição no início, no meio e no fim da lista; retorna `''` quando `workItem.id` não está em `parent.childIds`.
- `render.test.ts`: faixa+navegador aparecem no branch Flow quando `state.parent` existe; ausentes quando `state.parent` é `null`.
- Revert: todos os testes de `taskBacklogTypesByTeam` (em `client.test.ts`, `discoverTaskBacklogTypes.test.ts`, `discoverBoardState.test.ts`, `syncConfig.test.ts`, `resolveCardFieldVisibility.test.ts`) são removidos junto com o código revertido.
