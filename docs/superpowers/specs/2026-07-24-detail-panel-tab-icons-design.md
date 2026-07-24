# Ícones nas abas do VS Code (card details e pull request details)

## Contexto e motivação

Ao abrir um card (work item) ou um pull request pelo Kanbrain, o painel de detalhe abre como uma aba normal do editor do VS Code (`vscode.window.createWebviewPanel`). Hoje nenhum dos dois managers seta `iconPath`, então essas abas ficam com o ícone genérico de webview — sem nenhuma pista visual de qual tipo de conteúdo está aberto, diferente de outras abas do VS Code (arquivos, diffs, extensões como GitLens) que sempre mostram um ícone identificável.

## Escopo

**Dentro do escopo:**
- Ícone fixo e genérico por tipo de painel — um para "card details" (work item), outro para "pull request details". Não varia por tipo de work item (Bug/Task/User Story) nem por estado do PR.
- Dois novos arquivos SVG em `media/icons/`.
- `panel.iconPath` setado uma vez, na criação do painel, em `WorkItemDetailPanelManager.open()` e `PullRequestDetailPanelManager.open()`.

**Fora do escopo:**
- Ícone dinâmico por tipo de work item (reaproveitando `config.typeIcons`/`renderTypeAccent`) — fica para um pedido futuro, se houver.
- Qualquer mudança em `renderWorkItemDetail.ts` / `renderPullRequestDetail.ts` ou no CSS da webview — isso é só o ícone da aba do editor, não algo dentro do conteúdo renderizado.
- Variantes light/dark do ícone — a aba do editor não recolore `iconPath` com base no tema (diferente do ícone da activity bar, `media/icon.svg`, que usa `currentColor` e é mascarado pelo VS Code). Os SVGs novos usam cor fixa, legível tanto em tema claro quanto escuro.

## Design

### Novos assets

16×16, mesma dimensão de `media/icon.svg`. Cores fixas (sem `currentColor`) para diferenciar os dois tipos de aba de relance quando ambas estão abertas lado a lado:

- `media/icons/work-item.svg` — ícone genérico de card/work item, mesma linguagem visual do logo atual da extensão (`media/icon.svg`: retângulo com duas barras, lembrando um quadro kanban), em azul (`#0078D4`, azul de marca do Azure DevOps):
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
  <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#0078D4" stroke-width="1.2"/>
  <rect x="3.5" y="3.5" width="3" height="9" fill="#0078D4"/>
  <rect x="9.5" y="3.5" width="3" height="5" fill="#0078D4"/>
</svg>
```
- `media/icons/pull-request.svg` — reaproveita a forma já usada em `renderPullRequestIcon()` (`src/view/renderDevelopment.ts:12`, dois círculos ligados por linhas, estilo git-pull-request), em roxo (`#8250DF`, mesmo tom usado por GitHub/Azure Repos para indicar merge/PR, distinto do azul do card):
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
  <circle cx="6" cy="18" r="2.5" stroke="#8250DF" stroke-width="2" fill="none"/>
  <circle cx="18" cy="6" r="2.5" stroke="#8250DF" stroke-width="2" fill="none"/>
  <path d="M6 15.5V9a3 3 0 0 1 3-3h6" stroke="#8250DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 3l4 3-4 3" stroke="#8250DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

Ambos ficam em `media/icons/`, dentro de `media/`, que já é publicado no pacote da extensão (`media/` não está no `.vscodeignore`).

### `WorkItemDetailPanelManager` e `PullRequestDetailPanelManager`

Os dois managers passam a receber `extensionUri: vscode.Uri` no construtor:

```ts
constructor(
  private readonly workspaceRoot: string,
  private readonly client: AzureDevOpsClient,
  private readonly extensionUri: vscode.Uri,
) {}
```

E, logo após `createWebviewPanel` em `open()`:

```ts
panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'work-item.svg');
```

(`pull-request.svg` no caso do `PullRequestDetailPanelManager`.)

### `extension.ts`

Passa `context.extensionUri` ao instanciar os dois managers:

```ts
const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;
const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;
```

## Tratamento de erros

Nenhum novo caminho de erro — `vscode.Uri.joinPath` é síncrono e não falha por si; se o arquivo SVG não existir no disco, o VS Code simplesmente não desenha o ícone (mesmo comportamento de qualquer `iconPath` inválido de extensão), sem exceção nem popup.

## Testes

Nenhum dos dois managers tem testes automatizados hoje (infraestrutura de comando VS Code, sem suíte de teste — mesmo padrão documentado em `docs/superpowers/specs/2026-07-23-detail-panel-polling-design.md`). Verificação manual via `npm run compile` + F5: abrir um card, confirmar que a aba mostra o ícone de work item; abrir um pull request, confirmar o ícone de PR; repetir em tema claro e escuro, confirmar legibilidade em ambos.
