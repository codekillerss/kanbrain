# Threads de comentário no painel de PR (arquivo/linha, respostas, status) — Design

## Contexto e motivação

`getPullRequestThreadComments` (adicionado na spec anterior) hoje achata todos os threads de comentário de um PR numa lista plana de `WorkItemComment[]`, descartando: (1) o arquivo/linha de código a que o comentário se refere, quando é um comentário de code review; (2) a relação de resposta entre comentários (`parentCommentId`); (3) o status do próprio thread (Active/Fixed/Won't Fix/Closed/By Design/Pending). O usuário quer essas três informações de volta na seção Discussion.

## Escopo

**Dentro do escopo:**
- Novos tipos (`src/types.ts`):
  ```ts
  export interface PullRequestThreadComment {
    id: number;
    parentCommentId: number;
    text: string;
    createdBy: AssignedTo;
    createdDate: string;
  }

  export interface PullRequestThread {
    id: number;
    status: string;
    filePath: string | null;
    line: number | null;
    comments: PullRequestThreadComment[];
  }
  ```
- `client.ts`: `getPullRequestThreadComments` é renomeado/substituído por `getPullRequestThreads(organization, project, repositoryId, pullRequestId): Promise<PullRequestThread[]>` — mesma consulta (`.../threads?api-version=7.1`), mas em vez de achatar tudo:
  1. Por thread: filtra os comentários pra manter só `commentType === 'text' && !isDeleted` (mesmo filtro de hoje, aplicado por thread em vez de globalmente).
  2. Descarta a thread inteira se não sobrar nenhum comentário real (thread 100% de sistema).
  3. Preserva `parentCommentId` de cada comentário (pra montar a árvore raiz+respostas na renderização).
  4. Extrai `filePath` de `threadContext.filePath` (`null` se ausente — comentário geral do PR, não de code review).
  5. Extrai `line` de `threadContext.rightFileStart.line`, caindo para `threadContext.leftFileStart.line` se o primeiro não existir (`null` se nenhum dos dois existir).
  6. Extrai `status` de `thread.status` (`'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending' | 'unknown'`, conforme `CommentThreadStatus` da API).
- `renderPullRequestDetail.ts`: a seção Discussion passa a renderizar uma lista de **threads** (não mais uma lista plana de comentários). Cada thread vira um card (`kb-pr-thread`) com:
  - Etiqueta de arquivo/linha no topo, só quando `filePath` não for `null` (`📄 {filePath}:{line}`, ou só `📄 {filePath}` se `line` for `null`) — texto informativo, sem link/navegação nesta spec.
  - Etiqueta de status, só quando `status` não for `'unknown'`/ausente (label mapeado: `active`→Active, `fixed`→Fixed, `wontFix`→Won't Fix, `closed`→Closed, `byDesign`→By Design, `pending`→Pending).
  - O(s) comentário(s) raiz (`parentCommentId` falsy/`0`) renderizados via `renderComment` (reaproveitado, com o texto escapado como já é feito hoje).
  - Respostas (comentários cujo `parentCommentId` bate com o `id` de um comentário raiz da mesma thread) renderizadas logo abaixo, indentadas (`kb-pr-reply`).
- `PullRequestDetailPanelManager.ts`: troca `getPullRequestThreadComments` por `getPullRequestThreads`; `avatars` passa a ser resolvido a partir de todos os `createdBy.imageUrl` de todos os comentários de todas as threads (achatando só pra essa resolução, não pra exibição); `stateKey` inclui `threads` no lugar de `comments`.

**Fora do escopo:**
- Clique na etiqueta de arquivo/linha pra abrir o arquivo — fica pra uma spec futura, se fizer falta (decisão explícita: só texto por agora).
- Responder/editar/resolver threads a partir do Kanbrain — só visualização, igual o resto do painel de PR.
- Diff do código em si — já é a spec 2/2 da feature de PR (GitLens), não relacionada a comentários.
- Threads aninhadas com mais de um nível (resposta de resposta) — o modelo raiz+respostas cobre o caso comum do Azure DevOps (que não suporta UI de aninhamento profundo); se uma resposta tiver `parentCommentId` apontando pra outra resposta (não pra um comentário raiz), ela simplesmente não aparece agrupada corretamente — aceito como limitação, não é o padrão real de uso do Azure DevOps.

## Design

### `types.ts`

(bloco `PullRequestThreadComment`/`PullRequestThread` já mostrado acima.)

### `client.ts`

```ts
async getPullRequestThreads(
  organization: string,
  project: string,
  repositoryId: string,
  pullRequestId: number,
): Promise<PullRequestThread[]> {
  interface RawComment {
    id: number;
    parentCommentId?: number;
    content?: string;
    author?: unknown;
    publishedDate: string;
    commentType?: string;
    isDeleted?: boolean;
  }
  interface RawThreadContext {
    filePath?: string;
    rightFileStart?: { line: number };
    leftFileStart?: { line: number };
  }
  interface RawThread {
    id: number;
    status?: string;
    threadContext?: RawThreadContext | null;
    comments?: RawComment[];
  }
  const data = await this.request<{ value?: RawThread[] }>(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1`,
  );
  const threads = data.value ?? [];
  return threads
    .map(t => {
      const comments = (t.comments ?? [])
        .filter(c => c.commentType === 'text' && !c.isDeleted)
        .map(c => ({
          id: c.id,
          parentCommentId: c.parentCommentId ?? 0,
          text: c.content ?? '',
          createdBy: mapIdentityRef(c.author),
          createdDate: c.publishedDate,
        }));
      return {
        id: t.id,
        status: t.status ?? 'unknown',
        filePath: t.threadContext?.filePath ?? null,
        line: t.threadContext?.rightFileStart?.line ?? t.threadContext?.leftFileStart?.line ?? null,
        comments,
      };
    })
    .filter(t => t.comments.length > 0)
    .sort((a, b) => new Date(a.comments[0].createdDate).getTime() - new Date(b.comments[0].createdDate).getTime());
}
```

Remove `getPullRequestThreadComments` (substituída por esta).

### `renderPullRequestDetail.ts`

```ts
const THREAD_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  fixed: 'Fixed',
  wontFix: "Won't Fix",
  closed: 'Closed',
  byDesign: 'By Design',
  pending: 'Pending',
};

function renderThread(thread: PullRequestThread, avatars: Record<string, string>): string {
  const roots = thread.comments.filter(c => !c.parentCommentId);
  const repliesByParent = new Map<number, PullRequestThreadComment[]>();
  for (const c of thread.comments) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  const fileLabel = thread.filePath
    ? `<div class="kb-pr-thread-file">📄 ${escapeHtml(thread.filePath)}${thread.line ? `:${thread.line}` : ''}</div>`
    : '';
  const statusLabel = THREAD_STATUS_LABELS[thread.status]
    ? `<span class="kb-pr-thread-status">${THREAD_STATUS_LABELS[thread.status]}</span>`
    : '';

  const commentsHtml = roots
    .map(root => {
      const replyHtml = (repliesByParent.get(root.id) ?? [])
        .map(r => `<div class="kb-pr-reply">${renderComment({ ...r, text: escapeHtml(r.text) }, avatars)}</div>`)
        .join('');
      return renderComment({ ...root, text: escapeHtml(root.text) }, avatars) + replyHtml;
    })
    .join('');

  return `
    <div class="kb-pr-thread">
      ${fileLabel || statusLabel ? `<div class="kb-pr-thread-header">${fileLabel}${statusLabel}</div>` : ''}
      ${commentsHtml}
    </div>
  `;
}
```

`PullRequestDetailInput.comments`/`WorkItemComment[]` viram `threads: PullRequestThread[]`. O bloco de "Discussion" na função principal passa a ser:

```ts
const threadsHtml = threads.length ? threads.map(t => renderThread(t, avatars)).join('') : '<div class="kb-empty">No comments.</div>';
```

### `PullRequestDetailPanelManager.ts`

```ts
const threads = await this.client
  .getPullRequestThreads(config.organization, config.project, repositoryId, pullRequestId)
  .catch(() => []);
const avatars = await this.resolveAvatars(threads.flatMap(t => t.comments));
// ...
const stateKey = JSON.stringify({ pr, workItems, threads, avatars });
// ...
renderPullRequestDetail({ pr, workItems, config, threads, avatars })
```

`resolveAvatars` já aceita `WorkItemComment[]` (só lê `.createdBy.imageUrl`) — `PullRequestThreadComment[]` é estruturalmente compatível, sem mudança na assinatura do método.

### CSS (`detailPanelCss.ts`)

```css
.kb-pr-thread { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 12px; }
.kb-pr-thread-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 12px; opacity: 0.75; }
.kb-pr-thread-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-pr-thread-status { flex-shrink: 0; text-transform: uppercase; font-size: 10px; opacity: 0.7; }
.kb-pr-reply { margin-left: 24px; margin-top: 8px; }
```

(`.kb-comment`/`.kb-comment-header`/etc. continuam usados dentro de cada thread via `renderComment`, sem mudança — só ganham um container `.kb-pr-thread` ao redor em vez do `.kb-comments` flat de hoje. `.kb-comments`/`.kb-pr-comments` do work item e da versão anterior do PR deixam de ser usados pela seção Discussion do PR — mantidos, já que `renderWorkItemDetail.ts` ainda os usa pra comentários de work item, que continuam flat.)

## Tratamento de erros

- Falha ao buscar threads: `.catch(() => [])`, mesmo padrão de hoje — a seção Discussion mostra "No comments." em vez de quebrar o painel.
- Thread sem `threadContext` (comentário geral do PR): `filePath`/`line` ficam `null`, sem badge de arquivo — comportamento correto, não é um erro.
- Thread sem comentários reais restantes após o filtro (só comentários de sistema): thread inteira descartada, não aparece nem vazia.
- Resposta cujo `parentCommentId` não corresponde a nenhum comentário raiz presente na mesma thread (caso incomum): fica órfã, não aparece — mesma limitação já assumida na seção "Fora do escopo".

## Testes

- `client.test.ts`: `getPullRequestThreads` — mapeia `filePath`/`line` (com fallback right→left), `status`, `parentCommentId`; descarta threads sem comentários reais; mantém comentários de sistema fora mas preserva a thread se houver ao menos 1 comentário de texto junto de comentários de sistema na mesma thread; ordena threads pela data do primeiro comentário.
- `renderPullRequestDetail.test.ts`: thread com `filePath`+`line` mostra a etiqueta `📄 arquivo:linha`; thread sem `filePath` não mostra etiqueta de arquivo; cada status mapeado mostra o label certo; `status: 'unknown'` não mostra etiqueta; resposta aparece indentada (`kb-pr-reply`) depois do comentário raiz; múltiplas threads viram múltiplos `kb-pr-thread` separados; "No comments." quando não há threads.
