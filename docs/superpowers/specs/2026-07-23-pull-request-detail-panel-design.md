# Painel de detalhes de Pull Request — Design (1/2)

## Contexto e motivação

Primeira de duas specs pra trazer visualização de Pull Requests pro Kanbrain (a segunda: ação de diff via GitLens, com fallback pro navegador). Hoje um PR só aparece como texto estático na seção Development do painel de work item (`#id título (status)`). O usuário quer um painel de detalhes dedicado, espelhando a arquitetura já validada pro work item (`WorkItemDetailPanelManager`): `WebviewPanel` sem `enableScripts`, com poll de 5s, navegação por `command:` URI.

Pesquisa feita nesta sessão: `GET .../_apis/git/repositories/{repositoryId}/pullrequests/{pullRequestId}?includeWorkItemRefs=true&api-version=7.1` retorna, numa única chamada, tudo que precisamos — título, descrição, status, `isDraft`, `sourceRefName`/`targetRefName` (branches, no formato `refs/heads/...`), `reviewers[]` (cada um com `displayName`, `vote` — código numérico: `10` Approved, `5` Approved with suggestions, `0` No vote, `-5` Waiting for author, `-10` Rejected —, `isRequired`), `createdBy`, e `workItemRefs[]` (só ids, resolvidos depois via `client.getWorkItems` já existente). `repository.webUrl` dá a base pra montar o link "Open in browser" (`{webUrl}/pullrequest/{id}`).

## Escopo

**Dentro do escopo:**
- Novo tipo `PullRequestDetail` (`src/types.ts`), distinto do `PullRequestDetails` já existente (que continua servindo só o label compacto do Development — `{ title, status }`, cache leve, sem mudança):
  ```ts
  export interface PullRequestReviewer {
    displayName: string;
    imageUrl: string | null;
    vote: number;
    isRequired: boolean;
  }

  export interface PullRequestDetail {
    id: number;
    title: string;
    description: string;
    status: string;
    isDraft: boolean;
    sourceBranch: string;
    targetBranch: string;
    createdBy: AssignedTo;
    reviewers: PullRequestReviewer[];
    workItemIds: number[];
    webUrl: string;
  }
  ```
- Novo `AzureDevOpsClient.getPullRequestDetail(organization, project, repositoryId, pullRequestId): Promise<PullRequestDetail | null>` — chama o endpoint acima, mapeia pro tipo `PullRequestDetail` (`sourceRefName`/`targetRefName` sem o prefixo `refs/heads/`; `webUrl` montada a partir de `repository.webUrl`). Retorna `null` em qualquer falha, sem lançar — mesmo padrão de `getRepository`/`getPullRequest`.
- Novo `src/view/renderPullRequestDetail.ts`, com `renderPullRequestDetail(input): string`, reaproveitando padrões já existentes: header com título + badge de status/draft; branches (`source → target`); descrição como texto escapado com `white-space: pre-wrap` (sem parse de Markdown); lista de reviewers (nome + label do voto em texto, sem cor); work items vinculados renderizados com o mesmo componente visual do Related Work (ícone+id+título, clicável via `command:kanbrain.openWorkItemDetail`); link "Open in browser" pro `webUrl`.
- Novo `src/view/PullRequestDetailPanelManager.ts`, espelhando `WorkItemDetailPanelManager.ts`: `Map` de painéis abertos, chaveado por `` `${repositoryId}:${pullRequestId}` `` (mesma chave já usada em `prCache`); poll compartilhado de 5s, mesmo mecanismo de comparação de estado (`JSON.stringify` + `Map` por chave) pra só re-renderizar quando algo mudou; sem cache de "layout" aqui (PR não tem um metadado de tipo análogo ao `WorkItemTypeLayout` — tudo é revalidado a cada poll).
- Extrai o método privado `css()` de `WorkItemDetailPanelManager.ts` pra uma função compartilhada `src/view/detailPanelCss.ts` (`export function detailPanelCss(): string`), com as novas regras `.kb-pr-*` incluídas nela — evita duplicar ~150 linhas de CSS entre os dois gerenciadores de painel. Ambos os `wrapHtml()` passam a chamar `detailPanelCss()` em vez de `this.css()`.
- Novo comando `kanbrain.openPullRequestDetail`, registrado em `src/commands/openPullRequestDetail.ts`, recebendo `(repositoryId: string, pullRequestId: number)`, chamando `prDetailPanelManager.open(repositoryId, pullRequestId)`.
- `WorkItemDetailPanelManager.ts` e o novo `PullRequestDetailPanelManager.ts` ganham `kanbrain.openPullRequestDetail` na allowlist de `enableCommandUris` (o painel de work item precisa dela porque é lá que o clique no PR acontece; o painel de PR precisa dela porque um PR pode ter work items vinculados que abrem o painel de work item — que por sua vez pode ter outros PRs no Development, então os dois painéis precisam conseguir abrir tanto `openWorkItemDetail` quanto `openPullRequestDetail`).
- `renderDevelopment.ts`: itens de PR (`link.kind === 'pullRequest'`) passam a ser `<a href="command:kanbrain.openPullRequestDetail?${encodeURIComponent(JSON.stringify([link.repositoryId, link.pullRequestId]))}">`, mesmo tratamento visual (`a.kb-dev-item`) que os itens de branch já ganharam na spec do checkout.
- `extension.ts`: instancia `PullRequestDetailPanelManager` (mesmo padrão condicional de `workspaceRoot && client`), registra `registerOpenPullRequestDetailCommand`.

**Fora do escopo:**
- Ação de diff (GitLens/fallback navegador) — spec 2/2, separada.
- Cor nos labels de voto dos reviewers — decisão explícita de deixar só texto por agora.
- Renderizar Markdown na descrição do PR — texto puro escapado.
- Comentários/threads do PR (endpoint `pullrequests/{id}/threads`, separado) — não pedido, fica pra uma spec futura se fizer falta.
- Ações de escrita (aprovar, comentar, completar o PR) — só visualização nesta spec.

## Design

### `types.ts`

(bloco `PullRequestReviewer`/`PullRequestDetail` já mostrado acima, adicionado após `PullRequestDetails` existente.)

### `client.ts`

```ts
async getPullRequestDetail(
  organization: string,
  project: string,
  repositoryId: string,
  pullRequestId: number,
): Promise<PullRequestDetail | null> {
  try {
    const data = await this.request<{
      pullRequestId: number;
      title: string;
      description?: string;
      status: string;
      isDraft: boolean;
      sourceRefName: string;
      targetRefName: string;
      createdBy: { displayName: string; imageUrl?: string };
      reviewers?: { displayName: string; imageUrl?: string; vote: number; isRequired?: boolean }[];
      workItemRefs?: { id: string }[];
      repository: { webUrl: string };
    }>(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?includeWorkItemRefs=true&api-version=7.1`,
    );
    return {
      id: data.pullRequestId,
      title: data.title,
      description: data.description ?? '',
      status: data.status,
      isDraft: data.isDraft,
      sourceBranch: data.sourceRefName.replace(/^refs\/heads\//, ''),
      targetBranch: data.targetRefName.replace(/^refs\/heads\//, ''),
      createdBy: { displayName: data.createdBy.displayName, imageUrl: data.createdBy.imageUrl ?? null },
      reviewers: (data.reviewers ?? []).map(r => ({
        displayName: r.displayName,
        imageUrl: r.imageUrl ?? null,
        vote: r.vote,
        isRequired: r.isRequired ?? false,
      })),
      workItemIds: (data.workItemRefs ?? []).map(w => Number(w.id)),
      webUrl: `${data.repository.webUrl}/pullrequest/${data.pullRequestId}`,
    };
  } catch {
    return null;
  }
}
```

### `renderPullRequestDetail.ts` (novo)

```ts
const VOTE_LABELS: Record<number, string> = {
  10: 'Approved',
  5: 'Approved with suggestions',
  0: 'No vote',
  '-5': 'Waiting for author',
  '-10': 'Rejected',
};

function renderVoteLabel(vote: number): string {
  return VOTE_LABELS[vote] ?? 'No vote';
}

function renderReviewer(reviewer: PullRequestReviewer): string {
  const requiredTag = reviewer.isRequired ? ' <span class="kb-pr-required-tag">Required</span>' : '';
  return `<div class="kb-pr-reviewer"><span>${escapeHtml(reviewer.displayName)}</span><span class="kb-pr-vote">${renderVoteLabel(reviewer.vote)}</span>${requiredTag}</div>`;
}

function renderLinkedWorkItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const commandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <a class="kb-related-item" href="command:kanbrain.openWorkItemDetail?${commandArgs}">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </a>
  `;
}

export interface PullRequestDetailInput {
  pr: PullRequestDetail;
  workItems: WorkItem[];
  config: KanbrainConfig;
}

export function renderPullRequestDetail(input: PullRequestDetailInput): string {
  const { pr, workItems, config } = input;
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);

  return `
    <div class="kb-detail-header">
      <div class="kb-detail-title-row">
        <h1 class="kb-detail-title">${escapeHtml(pr.title)}</h1>
      </div>
      <div class="kb-detail-status-row">${escapeHtml(statusLabel)}</div>
      <div class="kb-pr-branches">${escapeHtml(pr.sourceBranch)} &rarr; ${escapeHtml(pr.targetBranch)}</div>
      <a class="kb-pr-web-link" href="${escapeHtml(pr.webUrl)}">Open in browser</a>
    </div>
    <div class="kb-detail-body">
      <div class="kb-detail-main">
        <div class="kb-detail-html-section">
          <div class="kb-detail-section-label">Description</div>
          <div class="kb-detail-html-body kb-pr-description">${escapeHtml(pr.description)}</div>
        </div>
      </div>
      <div class="kb-detail-side">
        <div class="kb-detail-group">
          <div class="kb-detail-group-label">Reviewers</div>
          ${pr.reviewers.length ? pr.reviewers.map(renderReviewer).join('') : '<div class="kb-empty">No reviewers.</div>'}
        </div>
        ${
          workItems.length
            ? `<div class="kb-detail-group"><div class="kb-detail-group-label">Linked Work Items</div>${workItems.map(w => renderLinkedWorkItem(w, config)).join('')}</div>`
            : ''
        }
      </div>
    </div>
  `;
}
```

`capitalize` (já existe, local a `renderDevelopment.ts`, não exportado) ganha `export` e é importado aqui em vez de duplicado.

### CSS (`WorkItemDetailPanelManager.css()`, reaproveitada por `PullRequestDetailPanelManager`)

```css
.kb-pr-branches { font-size: 12px; opacity: 0.75; margin-top: 6px; }
.kb-pr-web-link { display: inline-block; margin-top: 6px; font-size: 12px; color: var(--vscode-textLink-foreground); }
.kb-pr-description { white-space: pre-wrap; }
.kb-pr-reviewer { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 6px; }
.kb-pr-vote { opacity: 0.75; font-size: 12px; }
.kb-pr-required-tag { font-size: 10px; text-transform: uppercase; opacity: 0.6; }
```

(As duas classes CSS ficam num método compartilhado — ver observação abaixo sobre reaproveitar o `css()` de `WorkItemDetailPanelManager` em vez de duplicar toda a folha de estilo no novo painel.)

### `PullRequestDetailPanelManager.ts` (novo)

Mesma estrutura de `WorkItemDetailPanelManager.ts`: `panels: Map<string, WebviewPanel>` (chave `` `${repositoryId}:${pullRequestId}` ``), `lastStateByPanel: Map<string, string>`, `pollHandle` compartilhado (5s), `open(repositoryId, pullRequestId)` cria/revela o painel e chama `loadAndRender`, que busca `getPullRequestDetail` + `client.getWorkItems(org, project, workItemIds)` em paralelo, serializa/compara estado, só re-renderiza quando mudou.

```ts
enableCommandUris: ['kanbrain.openWorkItemDetail', 'kanbrain.openPullRequestDetail'],
```

### `commands/openPullRequestDetail.ts` (novo)

```ts
export function registerOpenPullRequestDetailCommand(prDetailPanelManager: PullRequestDetailPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openPullRequestDetail', async (repositoryId: string, pullRequestId: number) => {
    await prDetailPanelManager.open(repositoryId, pullRequestId);
  });
}
```

### `renderDevelopment.ts`

```ts
// link.kind === 'pullRequest':
const commandArgs = encodeURIComponent(JSON.stringify([link.repositoryId, link.pullRequestId]));
return `<a class="kb-dev-item" href="command:kanbrain.openPullRequestDetail?${commandArgs}" title="${label}">${PULL_REQUEST_ICON}<span class="kb-dev-item-text">${label}</span></a>`;
```

### `WorkItemDetailPanelManager.ts`

`enableCommandUris` ganha `'kanbrain.openPullRequestDetail'` (além dos dois já existentes).

### `extension.ts`

```ts
const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client) : undefined;
// ...
if (!workspaceRoot || !client || !detailPanelManager || !prDetailPanelManager) {
  return;
}
context.subscriptions.push(
  // ...
  registerOpenPullRequestDetailCommand(prDetailPanelManager),
);
```

## Tratamento de erros

- `getPullRequestDetail` falha (PR deletado, sem acesso, rede): retorna `null` → `loadAndRender` do painel de PR pula esse tick/abertura, sem popup (mesmo tratamento do painel de work item).
- Work items vinculados que falharem ao resolver (`getWorkItems` parcial): lista de work items simplesmente reflete o que veio — sem tratamento especial (mesmo comportamento hoje pro Related Work).
- `reviewers`/`workItemRefs` ausentes na resposta: tratados como array vazio (`?? []`), sem quebrar.

## Testes

- `client.test.ts`: `getPullRequestDetail` mapeia todos os campos corretamente (branches sem prefixo, `webUrl` montada, reviewers mapeados); retorna `null` em falha.
- `renderPullRequestDetail.test.ts` (novo): título/status/isDraft aparecem; branches "source → target"; descrição escapada (XSS); cada código de voto produz o label certo (`renderVoteLabel`); work items vinculados aparecem com link pra `openWorkItemDetail`; link "Open in browser" com o `webUrl` correto.
- `renderDevelopment.test.ts`: item de PR agora tem `href="command:kanbrain.openPullRequestDetail?..."` com `repositoryId`/`pullRequestId` corretos.
- Sem teste automatizado pra `PullRequestDetailPanelManager.ts`/`commands/openPullRequestDetail.ts`/`extension.ts` — mesma observação de sempre (infraestrutura de comando/painel VS Code, verificado via F5).
