# Clique nos itens do Related Work no painel de detalhes — Design (2/3)

## Contexto e motivação

Segunda de três specs pra tornar o painel de detalhes interativo sem `enableScripts` (1/3: polling, já implementado; 3/3: checkout de branch, ainda por vir). Hoje a seção "Related Work" (`renderRelatedWork.ts`) mostra o parent/children como texto estático (ícone + `#id` + título), sem navegação. O usuário quer clicar no título de um item relacionado e abrir o painel de detalhes daquele item.

Como o painel roda sem JavaScript, a navegação usa o mecanismo de `command:` URI do VS Code: um link `<a href="command:...">` que, quando clicado dentro de um webview, invoca um comando registrado da extensão — sem precisar de nenhum script rodando na página.

## Escopo

**Dentro do escopo:**
- Novo comando `kanbrain.openWorkItemDetail`, registrado em `src/commands/openWorkItemDetail.ts` (`registerOpenWorkItemDetailCommand`, seguindo o padrão `registerXCommand(...): vscode.Disposable` já usado por `setup.ts`/`selectWorkItem.ts`/etc.), que recebe um `id: number` e chama `detailPanelManager.open(id)`.
- `extension.ts`: registra esse comando no `context.subscriptions`, ao lado dos demais.
- `WorkItemDetailPanelManager.open()`: as opções do `createWebviewPanel` ganham `enableCommandUris: ['kanbrain.openWorkItemDetail']` — allowlist explícita de um único comando (mais restritivo que `enableCommandUris: true`, que liberaria qualquer comando registrado na extensão pra ser disparado por um clique dentro do webview).
- `renderRelatedWork.ts`: cada item vira um `<a href="command:kanbrain.openWorkItemDetail?${encodeURIComponent(JSON.stringify([item.id]))}">` (formato padrão de argumento de `command:` URI do VS Code — JSON array, URI-encoded) envolvendo o ícone + `#id` + título que já existia, em vez de uma `<div>` estática.
- CSS: `.kb-related-item` ganha `color: inherit; text-decoration: none; cursor: pointer;` (era `<div>`, sem essas propriedades; como `<a>`, herda estilo de link do navegador por padrão — neutralizamos isso) e um `:hover` que usa `var(--vscode-textLink-foreground)`, mesmo padrão já usado por `.kb-parent-link:hover .kb-link-text` nos cards da sidebar.

**Fora do escopo:**
- Checkout de branch nos itens de Development — fica pra spec 3/3.
- Qualquer mudança em `data-action="open-work-item-detail"` (usado pela sidebar, que tem JS/postMessage) — mecanismo diferente, não relacionado a esse.
- Indicar visualmente "já existe um painel aberto pra esse item" antes do clique — `open()` já reaproveita/dá foco no painel existente (`existing.reveal()`), então clicar de novo no mesmo item só traz o painel já aberto pra frente, sem duplicar. Sem indicação prévia disso na UI.

## Design

### `src/commands/openWorkItemDetail.ts` (novo)

```ts
import * as vscode from 'vscode';
import type { WorkItemDetailPanelManager } from '../view/WorkItemDetailPanelManager';

export function registerOpenWorkItemDetailCommand(detailPanelManager: WorkItemDetailPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openWorkItemDetail', async (id: number) => {
    await detailPanelManager.open(id);
  });
}
```

### `extension.ts`

```ts
import { registerOpenWorkItemDetailCommand } from './commands/openWorkItemDetail';

// ...
if (!workspaceRoot || !client || !detailPanelManager) {
  return;
}

context.subscriptions.push(
  registerSetupCommand(...),
  // ...demais comandos já existentes...
  registerOpenWorkItemDetailCommand(detailPanelManager),
);
```

(O guard passa a incluir `!detailPanelManager` — na prática ele já é sempre definido nesse ponto, já que é construído a partir dos mesmos `workspaceRoot`/`client`, mas isso deixa o TypeScript estreitar o tipo pra `WorkItemDetailPanelManager` sem `undefined`, em vez de um cast/non-null assertion.)

### `WorkItemDetailPanelManager.ts`

```ts
const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${id}`, vscode.ViewColumn.Active, {
  enableScripts: false,
  enableCommandUris: ['kanbrain.openWorkItemDetail'],
});
```

### `renderRelatedWork.ts`

```ts
function renderRelatedItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const commandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <a class="kb-related-item" href="command:kanbrain.openWorkItemDetail?${commandArgs}">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </a>
  `;
}
```

### CSS (`WorkItemDetailPanelManager.css()`)

```css
.kb-related-item { display: flex; align-items: center; gap: 4px; font-size: 13px; margin-bottom: 4px; color: inherit; text-decoration: none; cursor: pointer; }
.kb-related-item:hover { color: var(--vscode-textLink-foreground); }
```

## Tratamento de erros

- Clicar num item cujo work item foi deletado/ficou inacessível: `detailPanelManager.open(id)` já trata isso hoje (`getWorkItems` retorna vazio → `open()` retorna sem abrir nada) — sem popup de erro, o clique simplesmente não abre nada. Aceito, consistente com o comportamento atual de `open()`.
- `enableCommandUris` restrito a um único comando: cliques em qualquer outro link `command:` que porventura aparecesse nesse painel (não há nenhum outro hoje) seriam bloqueados pelo VS Code — comportamento de segurança esperado, não um erro a tratar.

## Testes

- `renderRelatedWork.test.ts`: item relacionado agora contém `href="command:kanbrain.openWorkItemDetail?` com o id certo codificado (checagem via `decodeURIComponent`/`JSON.parse` do argumento, ou checagem de substring do id serializado).
- Sem teste automatizado pra `openWorkItemDetail.ts`/`extension.ts`/`WorkItemDetailPanelManager.ts` (mesma observação de sempre — infraestrutura de comando VS Code, sem suíte, verificado via `npm run compile` + F5): abrir um item com parent/children, clicar num item do Related Work, confirmar que abre o painel de detalhes daquele item; clicar de novo no mesmo item (painel já aberto), confirmar que só traz o painel existente pra frente em vez de abrir um segundo.
