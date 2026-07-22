# Show Parent no card — Design

## Contexto e motivação

Hoje o card do work item ativo (tela Flow) mostra id, ícone/borda de tipo, título, assignee (opcional via `showAssignedTo`) e status. O `parentId` de cada item já é resolvido pelo `mapWorkItem` e o work item completo do parent já é buscado (`KanbrainViewProvider` chama `client.getWorkItems` para o `parentId` do item ativo e guarda em `state.parent`), mas hoje esse dado só alimenta os placeholders `{{parent.id}}`/`{{parent.title}}`/`{{parent.description}}` dos skill files — nunca aparece na UI.

O board real do Azure DevOps já tem exatamente essa opção: em **Board Settings > Fields**, por tipo de work item, existe um checkbox **Parent** ("Shows parent work item title"). Essa configuração é por **board**, e cada board de Kanban de um time corresponde 1:1 a um backlog level (Epics, Features, Stories, ou o que quer que o *process* do projeto defina — não há nomes fixos: assim como as abas do modal de busca já usam `Object.keys(config.backlogLevels)`, que vem de `client.listBacklogLevels`, sem hardcode nenhum, os boards aqui vêm de `client.listBoards`, também sem hardcode).

Diferente do `showAssignedTo` (toggle local, independente, só editado manualmente na tela Config), o "Show Parent" deve **espelhar automaticamente** essa configuração real do board — mesmo padrão já usado para `statusColors`/`typeColors`/`typeIcons`, capturados no Setup e mantidos atualizados pelo Sync.

## Escopo

**Dentro do escopo:**
- Novo campo em `KanbrainConfig`: `cardSettingsByBoard`, guardando por board real (nome retornado por `listBoards`) se o campo Parent está habilitado por tipo de work item.
- Novo método no `AzureDevOpsClient` (`getCardSettings`) e uma função de descoberta que itera todos os boards do time.
- `Kanbrain: Setup` e `Kanbrain: Sync Board Configuration` populam/atualizam esse campo (replace completo a cada vez, igual `typeColors`/`typeIcons` — não é mesclado com o que já existia).
- Seleção de board: um dropdown na tela Config para desempate, quando o mesmo tipo aparece em mais de um board com valores diferentes (raro, mas possível). Essa seleção é **local por usuário** (não commitada), guardada via `workspaceState` — mesmo mecanismo já usado para o work item ativo (`ACTIVE_WORK_ITEM_KEY` em `extension.ts`). Isso permite que pessoas de times diferentes, com boards diferentes, compartilhem o mesmo `.kanbrain/config.json` commitado sem conflito.
- Função pura de resolução (`resolveShowParent`) que decide, para um tipo de work item e um board selecionado, se o Parent deve aparecer.
- Renderização: uma linha "Parent" no card **principal** da tela Flow (não nos cards filhos, nem nos resultados de busca — esses não têm o work item do parent resolvido hoje, só o `parentId` numérico; resolver isso para todo card exigiria busca em lote adicional, fora de escopo aqui). Clicável, abrindo o detail do parent (reaproveitando `open-work-item-detail`, já usado pelos títulos dos cards filhos).

**Fora do escopo (v1):**
- Branch, Pull Request e Children como links no card — ideias relacionadas, mas ficam para specs futuras e separadas.
- Mostrar o Parent em cards de subtask ou nos resultados de busca.
- Edição manual de `cardSettingsByBoard` na tela Config — só a *seleção* de board (desempate) é editável pelo usuário; o dado em si só muda via Setup/Sync, igual `typeColors`.
- Qualquer escrita no board real do Azure DevOps — Kanbrain continua somente leitura.

**Risco técnico — resolvido após validação real:** a primeira versão implementada assumiu, sem confirmação, que `cards[tipo]` era um objeto `{ fields: [...] }`. Um teste manual contra um projeto Azure DevOps real (via `Kanbrain: Setup`) mostrou `cardSettingsByBoard` populado com todos os tipos como `false`, mesmo com "Parent" configurado como additional field em pelo menos um tipo real — sinal de que o parser nunca encontrava nada. Comparando com o payload documentado da API equivalente (`card-fields`, TFS 2017, mesmo formato hoje), `cards[tipo]` é na verdade um **array direto** de entradas `{ fieldIdentifier, ... }` (algumas sem `fieldIdentifier`, como a entrada final `{ showEmptyFields: ... }`) — não um objeto com propriedade `.fields`. O parser foi corrigido para ler o array diretamente (`getCardSettings`, seção 2). `System.Parent` como identificador de campo foi confirmado como um field reference name real do Azure DevOps (usado também em colunas de query e em Delivery Plans), então a lista de identificadores candidatos se mantém.

## Design

### 1. Tipos (`src/types.ts`)

```ts
export interface KanbrainConfig {
  // ...campos existentes
  cardSettingsByBoard?: Record<string, Record<string, boolean>>; // [nome do board][tipo do work item] => Parent habilitado
}
```

### 2. Cliente (`src/azureDevOps/client.ts`)

```ts
const PARENT_FIELD_IDENTIFIERS = new Set(['System.Parent', 'Parent']);

async getCardSettings(organization: string, project: string, team: string, boardId: string): Promise<Record<string, boolean>> {
  const data = await this.request<{ cards?: Record<string, { fieldIdentifier?: string }[]> }>(
    `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}/cardsettings?api-version=7.1`,
  );
  const cards = data.cards ?? {};
  const result: Record<string, boolean> = {};
  for (const [type, fields] of Object.entries(cards)) {
    result[type] = (fields ?? []).some(f => !!f.fieldIdentifier && PARENT_FIELD_IDENTIFIERS.has(f.fieldIdentifier));
  }
  return result;
}
```

`cards[tipo]` é o array de campos em si (confirmado contra um projeto real, ver risco técnico acima) — cada entrada tem `fieldIdentifier` exceto a última, que carrega só `showEmptyFields`; o filtro `!!f.fieldIdentifier` já ignora essa entrada.

### 3. Descoberta por board (`src/azureDevOps/discoverCardSettings.ts`, novo arquivo)

Mesmo padrão de tolerância a falha por item já usado em `discoverBoardColumns.ts`:

```ts
import type { AzureDevOpsClient } from './client';

export async function discoverCardSettingsByBoard(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<Record<string, Record<string, boolean>>> {
  const boards = await client.listBoards(organization, project, team);

  const result: Record<string, Record<string, boolean>> = {};
  for (const board of boards) {
    try {
      result[board.name] = await client.getCardSettings(organization, project, team, board.id);
    } catch {
      // Falha isolada de um board: continua sem ele em vez de abortar a descoberta inteira.
    }
  }
  return result;
}
```

### 4. `discoverBoardState.ts`: incluir `cardSettingsByBoard`

`discoverBoardState` já resolve `team` internamente (`getDefaultTeamName`) para buscar `listBacklogLevels` — reaproveita esse mesmo `team` para a nova chamada, sem pedir de novo aos comandos que o chamam:

```ts
export interface BoardState {
  levels: BacklogLevel[];
  statesByType: Record<string, WorkItemTypeState[]>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByBoard: Record<string, Record<string, boolean>>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const team = await client.getDefaultTeamName(organization, project);
  // ...levels, statesByType, typeColors, typeIcons como já existe hoje...

  const cardSettingsByBoard = await discoverCardSettingsByBoard(client, organization, project, team);

  return { levels, statesByType, typeColors, typeIcons, cardSettingsByBoard };
}
```

Isso propaga automaticamente para `setup.ts`, `checkBoardConfig.ts` e `syncBoardConfig.ts`, que já consomem `discoverBoardState(...)` — nenhum desses comandos precisa saber o `team` diretamente.

### 5. Setup e Sync (`src/commands/setup.ts`, `src/config/syncConfig.ts`, `src/commands/syncBoardConfig.ts`)

- `setup.ts`: adiciona `cardSettingsByBoard: boardState.cardSettingsByBoard` no objeto passado a `writeConfig(...)`.
- `syncConfig.ts`: novo parâmetro `freshCardSettingsByBoard`, incluído no objeto retornado — **replace completo**, igual `typeColors`/`typeIcons` (não mescla com o `cardSettingsByBoard` anterior, já que o dado inteiro vem fresco a cada sync):

```ts
export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshCardSettingsByBoard: Record<string, Record<string, boolean>>,
): KanbrainConfig {
  // ...
  return {
    // ...campos existentes
    cardSettingsByBoard: freshCardSettingsByBoard,
  };
}
```
- `syncBoardConfig.ts`: passa `boardState.cardSettingsByBoard` na chamada de `syncConfig(...)`.
- `checkBoardConfig.ts`/`diffBoardConfig`: **sem mudança** — `cardSettingsByBoard` é silenciosamente atualizado a cada sync, mesmo tratamento que `typeColors`/`typeIcons` já recebem hoje (não entram no resumo de diff apresentado ao usuário).

### 6. Resolução (`src/config/resolveShowParent.ts`, novo arquivo, puro e testável)

```ts
import type { KanbrainConfig } from '../types';

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean {
  const boards = config.cardSettingsByBoard ?? {};
  const matches = Object.entries(boards).filter(([, byType]) => workItemType in byType);

  if (matches.length === 0) {
    return false;
  }
  if (matches.length === 1) {
    return matches[0][1][workItemType];
  }

  const selectedMatch = matches.find(([name]) => name === selectedBoard);
  return (selectedMatch ?? matches[0])[1][workItemType];
}
```

Caso comum: o tipo só existe em um board → usa direto. Caso raro (mesmo tipo em mais de um board): usa o board selecionado se ele tiver esse tipo; senão cai no primeiro encontrado (nunca quebra, sempre retorna um booleano).

### 7. Seleção de board — persistência local (`extension.ts`, `KanbrainViewProvider.ts`)

Mesmo padrão do `ACTIVE_WORK_ITEM_KEY`:

```ts
// extension.ts
const SELECTED_BOARD_KEY = 'kanbrain.selectedBoard';
// ...
const provider = new KanbrainViewProvider(
  workspaceRoot,
  client,
  () => getCurrentBranch(workspaceRoot ?? ''),
  id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
  () => hasCachedAzureSession(getVscodeMicrosoftSession),
  async id => { /* ...detail panel... */ },
  board => context.workspaceState.update(SELECTED_BOARD_KEY, board),
);
// ...
const savedBoard = context.workspaceState.get<string>(SELECTED_BOARD_KEY);
if (savedBoard) {
  provider.setSelectedBoard(savedBoard);
}
```

`KanbrainViewProvider` ganha:
- Novo parâmetro no construtor: `persistSelectedBoard: (board: string | undefined) => void`.
- Novo campo `selectedBoard: string | undefined`.
- Novo método público `setSelectedBoard(board: string | undefined): void` (mesmo formato de `setActiveWorkItem`: atualiza o campo, persiste, zera `lastState`, chama `refresh()`).
- Novo branch de mensagem: `else if (message.type === 'set-selected-board') { this.setSelectedBoard(message.board || undefined); }`.
- `render(...)` passa `selectedBoard: this.selectedBoard` no `RenderState`.

### 8. Dropdown na tela Config (`src/view/renderConfig.ts`, `RenderState`)

`RenderState` (em `render.ts`) ganha `selectedBoard?: string`. `renderConfig.ts` ganha, ao lado do toggle de assignee:

```ts
const boardNames = Object.keys(state.config!.cardSettingsByBoard ?? {});
const boardOptions = boardNames
  .map(name => `<option value="${escapeHtml(name)}"${name === state.selectedBoard ? ' selected' : ''}>${escapeHtml(name)}</option>`)
  .join('');
// ...
${boardNames.length > 1 ? `
  <label class="kb-select-row">
    Board (desempate de campos)
    <select id="kb-board-select">${boardOptions}</select>
  </label>
` : ''}
```

Script inline no `KanbrainViewProvider` (mesmo padrão do `showAssigneeToggle`):

```js
const boardSelect = document.getElementById('kb-board-select');
if (boardSelect) {
  boardSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'set-selected-board', board: boardSelect.value });
  });
}
```

Se `cardSettingsByBoard` só tiver um board (caso mais comum), o dropdown nem aparece — não há desempate a fazer.

### 9. Renderização do card (`src/view/renderWorkItemCard.ts`, `src/view/render.ts`, novo `src/view/renderParent.ts`)

Novo arquivo `renderParent.ts`, seguindo o mesmo formato de `renderAssignee.ts`:

```ts
import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderParentRow(parent: WorkItem | null, show: boolean): string {
  if (!show || !parent) {
    return '';
  }
  return `<div class="kb-parent-row" data-action="open-work-item-detail" data-id="${parent.id}">↑ Parent: #${parent.id} ${escapeHtml(parent.title)}</div>`;
}
```

`renderWorkItemCard` ganha dois novos parâmetros posicionais opcionais (mesmo estilo já usado para `clickableTitle`), no final da assinatura para não quebrar chamadas existentes:

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
): string {
  // ...
  const parentHtml = renderParentRow(parent, showParent);
  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">${iconHtml}<span class="kb-id">#${workItem.id}</span></div>
      <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      ${parentHtml}
      ${assigneeHtml}
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

`render.ts` (tela Flow) resolve o booleano antes de chamar, só para o card principal:

```ts
const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedBoard);
// ...
${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent)}
```

A chamada dos cards de subtask (mesma tela) e a de `renderHome.ts` **não mudam** — ambas continuam omitindo os dois novos parâmetros, que caem no default (`null`/`false`), preservando o comportamento atual.

### 10. CSS

Nova regra simples em `KanbrainViewProvider.ts` (junto das demais `.kb-*`): `.kb-parent-row { cursor: pointer; opacity: 0.85; } .kb-parent-row:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }` — mesmo tratamento visual do `.kb-title-clickable` já existente.

## Tratamento de erros

- `client.getCardSettings` propaga erro normalmente; `discoverCardSettingsByBoard` isola a falha por board individual (try/catch), igual `discoverBoardColumns` — um board com erro não derruba os demais nem o Setup/Sync inteiro.
- Se `cardSettingsByBoard` vier vazio ou ausente (ex: config antigo, de antes desta feature), `resolveShowParent` retorna `false` — nenhuma linha de Parent aparece, comportamento idêntico ao atual. Não é necessário forçar um re-Setup: `Kanbrain: Sync Board Configuration` já preenche o campo na próxima sincronização.
- Identificador de campo não reconhecido na resposta do `cardsettings` (risco técnico já declarado): mesmo efeito — tipo tratado como `false`.
- `selectedBoard` apontando para um board que não existe mais em `cardSettingsByBoard` (ex: board renomeado/removido no Azure DevOps): `resolveShowParent` já lida com isso via `matches.find(...) ?? matches[0]` — cai no primeiro board que tiver o tipo, sem quebrar.

## Testes

- `src/azureDevOps/client.test.ts`: novos casos para `getCardSettings` — mapeamento correto de `fields[].fieldIdentifier` para booleano por tipo, tipo sem nenhum identificador reconhecido vira `false`, resposta com `cards` ausente vira `{}`.
- `src/azureDevOps/discoverCardSettings.test.ts` (novo): agrega vários boards num único `Record`, e um board que lança erro é ignorado sem abortar os demais (mock do client).
- `src/azureDevOps/discoverBoardState.test.ts`: ajustar para incluir `cardSettingsByBoard` no retorno esperado.
- `src/config/resolveShowParent.test.ts` (novo): tipo ausente em todos os boards → `false`; tipo presente em exatamente um board → usa esse valor; tipo presente em dois boards com valores diferentes → usa o board selecionado; idem mas `selectedBoard` não tem esse tipo → cai no primeiro encontrado.
- `src/config/syncConfig.test.ts`: `cardSettingsByBoard` é substituído por completo (replace, não merge) a cada chamada.
- `src/view/renderParent.test.ts` (novo): `show=false` ou `parent=null` → string vazia; `show=true` e `parent` presente → linha com `#id`, título escapado, e `data-id` correto.
- `src/view/renderWorkItemCard.test.ts`: card sem os dois novos parâmetros continua sem linha de Parent (retrocompatibilidade); com `parent`+`showParent=true`, a linha aparece.
- `src/view/render.test.ts`: tela Flow passa `state.parent` e o resultado de `resolveShowParent` pro card principal; cards de subtask continuam sem Parent.
- `src/view/renderConfig.test.ts`: dropdown de board **ausente** quando `cardSettingsByBoard` tem 0 ou 1 board (nada para desempatar); **presente** quando tem 2+, com a opção marcada como `selected` batendo com `state.selectedBoard`.
- Sem teste de integração novo — comportamento de UI (dropdown, clique na linha de Parent) coberto pelo checklist manual do README, que ganha 2-3 itens novos (Setup popula `cardSettingsByBoard`; card principal mostra/esconde Parent conforme o board real; trocar o board no dropdown persiste entre reloads).
- **Reforçando o risco técnico:** validar manualmente (F5) contra um projeto Azure DevOps real antes de considerar pronto — a lista `PARENT_FIELD_IDENTIFIERS` é a parte menos confiável deste design e pode precisar de ajuste após ver uma resposta real do `cardsettings`.

## Addendum (2026-07-22): espelhar AssignedTo também, e redesenhar o Parent

Depois do teste manual real (que já corrigiu o parser do `cardsettings`), surgiram dois ajustes de escopo:

**1. `showAssignedTo` deixa de valer para os cards — só vale pra busca.** `KanbrainConfig.cardSettingsByBoard` passa de `Record<string, Record<string, boolean>>` (só Parent) para `Record<string, Record<string, CardFieldSettings>>`, onde `CardFieldSettings = { parent: boolean; assignedTo: boolean }` — `getCardSettings` agora detecta `System.AssignedTo` além de `System.Parent`. `resolveShowParent`/`resolveShowAssignedTo` (movidos para `src/config/resolveCardFieldVisibility.ts`, compartilhando a mesma lógica de resolução por tipo/board) decidem a visibilidade do assignee no card principal, nos cards filhos e no card da Home — o toggle manual `showAssignedTo` (tela Config) **continua existindo, mas só governa `renderSearchResults.ts`**; a aba de detalhes do work item não muda (continua sempre mostrando assignee, sem gate nenhum). Como a visibilidade agora é por tipo, `KanbrainViewProvider.refresh()` deixou de usar `config.showAssignedTo` como gate para decidir se busca avatares — sempre busca quando há config (o cache de avatar já evita custo repetido).

**2. Redesenho visual do Parent, espelhando o card nativo do Azure Boards.** Em vez da linha única `↑ Parent: #id Título`, agora é um rótulo "Parent" (como o rótulo de qualquer campo do card nativo, ex. "Effort") seguido de uma linha clicável com o ícone do tipo do parent (via `renderTypeAccent`) e o título como link (cor/sublinhado de link do tema) — sem mostrar o `#id`. `renderParentRow` passou a receber `config` como terceiro parâmetro para resolver o ícone.

Sem novo ciclo de brainstorm/plano formal para este addendum — mudança implementada diretamente, em TDD, reaproveitando a mesma infraestrutura (`cardSettingsByBoard`, Setup/Sync, board tie-break) já revisada e aprovada nesta spec.
