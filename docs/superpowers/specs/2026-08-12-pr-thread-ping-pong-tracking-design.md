# PR thread ping-pong tracking on the Reviews page — Design

## Contexto e motivação

A equipe do usuário usa um processo manual pra rastrear "ping-pong" de revisão de PR: um revisor comenta pedindo correção (abre uma *thread* no PR do Azure), o autor corrige depois — muitas vezes sem que o revisor saiba que já pode voltar a conferir, e vice-versa (o autor às vezes não percebe que o PR tem pendência, porque ignora a notificação por e-mail). Hoje isso é rastreado manualmente movendo o card do work item pra uma coluna "PR Reprovado" no board do Azure.

O objetivo é dar duas visões automáticas na página Reviews do Kanbrain, baseadas no **status das threads do PR** (não no status geral do PR, nem no voto do revisor — que fica "preso" em Rejected/Waiting mesmo depois da correção a menos que exista uma política de reset):

- **Needs my fix** (como Autor): meus PRs abertos que têm pelo menos uma thread `active` de qualquer pessoa — "alguém pediu algo e ainda não resolvi."
- **Fixed** (como Corretor): PRs abertos onde eu tenho pelo menos uma thread que eu abri, e todas as minhas threads já estão resolvidas (`fixed`/`closed`/`wontFix`/`byDesign`) — "eu pedi algo, foi resolvido, preciso conferir de novo." Esse estado se autocorrige: se ao reconferir o revisor não gostar e reabrir/criar uma thread, ela volta a `active` e o PR sai desse filtro sozinho — sem precisar de nenhum controle extra de "já vi isso".

## Escopo

**Dentro do escopo:**
- Três abas no topo da página Reviews, exclusivas: **All** / **Fixed** / **Needs my fix**.
- Dentro da aba **All** (única com esses controles): o filtro de status vira **multi-select** (Active/Completed/Abandoned, pelo menos um sempre marcado) reaproveitando o visual de aba já existente, e os checkboxes **My PRs**/**Assigned to me** continuam exatamente como hoje.
- Abas **Fixed**/**Needs my fix**: sem os controles de status/owner — o escopo (reviewerId/creatorId = eu, status = Active) é implícito na própria aba.
- `AssignedTo` ganha `id?: string` (hoje descartado no mapeamento de identidades do Azure) — necessário pra comparar "quem abriu a thread" com o usuário atual.
- Novo helper puro `classifyPrThreads` pra decidir se um PR entra em "Fixed"/"Needs my fix" a partir da lista de threads.
- Backend: para "Fixed"/"Needs my fix", busca a lista base de PRs (já existente) e, só para esses, busca as threads de cada PR (1 chamada extra por PR).

**Fora do escopo:**
- Qualquer mudança na coluna "PR Reprovado" do Azure Boards em si — o Kanbrain só passa a refletir a mesma informação de um jeito automático, não substitui nem sincroniza com a coluna.
- Mudar o voto do PR (approve/reject) ou automatizar isso — só leitura de threads.
- Paginação/cache de threads entre sessões — busca threads a cada fetch, sem persistir localmente (mesma filosofia do resto da página Reviews, que já re-busca PRs periodicamente).

## Design

### 1. `AssignedTo` ganha `id`

`src/types.ts`:

```ts
export interface AssignedTo {
  id?: string;
  displayName: string;
  imageUrl: string | null;
}
```

`src/azureDevOps/client.ts`, `mapIdentityRef`:

```ts
interface RawIdentityRef {
  id?: string;
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function mapIdentityRef(raw: unknown): AssignedTo {
  const identity = raw as RawIdentityRef | undefined;
  const imageUrl = identity?.imageUrl ?? identity?._links?.avatar?.href ?? null;
  return { id: identity?.id, displayName: identity?.displayName ?? 'Unknown', imageUrl };
}
```

Campo opcional e aditivo — nenhum outro uso existente de `AssignedTo` (cards, avatares, reviewers) quebra.

### 2. `classifyPrThreads` — novo helper puro

Novo arquivo `src/azureDevOps/classifyPrThreads.ts`:

```ts
import type { PullRequestThread } from '../types';

const RESOLVED_STATUSES = new Set(['fixed', 'closed', 'wontFix', 'byDesign']);

export interface PrThreadClassification {
  hasAnyActiveThread: boolean;
  hasMyThreadsAllResolved: boolean;
}

export function classifyPrThreads(threads: PullRequestThread[], currentUserId: string): PrThreadClassification {
  const hasAnyActiveThread = threads.some(t => t.status === 'active');

  const myThreads = threads.filter(t => t.comments[0]?.createdBy.id === currentUserId);
  const hasMyThreadsAllResolved = myThreads.length > 0 && myThreads.every(t => RESOLVED_STATUSES.has(t.status));

  return { hasAnyActiveThread, hasMyThreadsAllResolved };
}
```

Notas:
- "Thread minha" = `comments[0]` (primeiro comentário, quem abriu a thread) tem `createdBy.id === currentUserId`. `getPullRequestThreads` já filtra comentários de sistema (`commentType !== 'text'`) e threads sem nenhum comentário restante, então `comments[0]` é sempre um comentário de texto real.
- `pending`/`unknown`/`active` **não** contam como resolvido — só os 4 status explicitamente positivos de `RESOLVED_STATUSES`.
- PR sem nenhuma thread minha (`myThreads.length === 0`) nunca entra em "Fixed" — `hasMyThreadsAllResolved` fica `false` (evita o "vácuo lógico" de considerar um array vazio como "tudo resolvido").

### 3. Estado e busca — `KanbrainViewProvider.ts`

Substituir os campos de estado hoje existentes:

```ts
private reviewsStatusFilter: 'active' | 'completed' | 'abandoned' = 'active';
private reviewsOwnerFilter: 'all' | 'mine' | 'assigned' = 'all';
```

por:

```ts
private reviewsTab: 'all' | 'fixed' | 'needsMyFix' = 'all';
private reviewsStatusFilters: Array<'active' | 'completed' | 'abandoned'> = ['active'];
private reviewsOwnerFilter: 'all' | 'mine' | 'assigned' = 'all';
```

(`reviewsOwnerFilter` só é relevante — e só é enviado pelo webview — quando `reviewsTab === 'all'`.)

No `refresh()`, o bloco que hoje busca `this.reviewsPullRequests` (branch único) vira:

```ts
if (config && this.client && this.currentScreen === 'reviews') {
  if (this.currentUserId === undefined && (this.reviewsTab !== 'all' || this.reviewsOwnerFilter !== 'all')) {
    this.currentUserId = await this.client.getCurrentUserId();
  }
  const now = Date.now();
  const filterKey = `${this.reviewsTab}|${this.reviewsStatusFilters.join(',')}|${this.reviewsOwnerFilter}`;
  const filterChanged = this.lastReviewsFilterKeyFetched !== filterKey;
  if (filterChanged || now - this.lastReviewsFetchAt >= REVIEWS_POLL_INTERVAL_MS) {
    this.reviewsPullRequests = await this.fetchReviewsPullRequests(config);
    this.lastReviewsFetchAt = now;
    this.lastReviewsFilterKeyFetched = filterKey;
  }
}
```

(`lastReviewsStatusFilterFetched`/`lastReviewsOwnerFilterFetched` — dois campos — viram um único `lastReviewsFilterKeyFetched: string | undefined`, já que agora há 3 dimensões de filtro a comparar.)

Novo método privado:

```ts
private async fetchReviewsPullRequests(config: KanbrainConfig): Promise<PullRequestSummary[]> {
  if (!this.client) return [];

  if (this.reviewsTab === 'all') {
    const creatorId = this.reviewsOwnerFilter === 'mine' && this.currentUserId ? this.currentUserId : undefined;
    const reviewerId = this.reviewsOwnerFilter === 'assigned' && this.currentUserId ? this.currentUserId : undefined;
    const perStatus = await Promise.all(
      this.reviewsStatusFilters.map(status =>
        this.client!.listProjectPullRequests(config.organization, config.project, status, { creatorId, reviewerId }),
      ),
    );
    return perStatus.flat();
  }

  if (!this.currentUserId) return [];
  const isFixed = this.reviewsTab === 'fixed';
  const base = await this.client.listProjectPullRequests(config.organization, config.project, 'active', {
    creatorId: isFixed ? undefined : this.currentUserId,
    reviewerId: isFixed ? this.currentUserId : undefined,
  });
  const classified = await Promise.all(
    base.map(async pr => {
      try {
        const threads = await this.client!.getPullRequestThreads(config.organization, config.project, pr.repositoryId, pr.id);
        const { hasAnyActiveThread, hasMyThreadsAllResolved } = classifyPrThreads(threads, this.currentUserId!);
        return { pr, keep: isFixed ? hasMyThreadsAllResolved : hasAnyActiveThread };
      } catch {
        // One PR's thread fetch failing (network blip, deleted repo, etc.) shouldn't take down
        // the whole tab — just exclude that PR rather than rejecting the whole Promise.all.
        return { pr, keep: false };
      }
    }),
  );
  return classified.filter(c => c.keep).map(c => c.pr);
}
```

`isFixed ? undefined : this.currentUserId` no `creatorId`/`reviewerId`: "Needs my fix" (autor) usa `creatorId`, "Fixed" (corretor) usa `reviewerId` — nomes invertidos de propósito porque o autor pede pra si (`creatorId`) e o corretor filtra pelos PRs que revisa (`reviewerId`).

Novos branches de mensagem (`onDidReceiveMessage`), substituindo `set-reviews-owner-filter`/`set-reviews-status-filter`:

```ts
} else if (message.type === 'set-reviews-tab') {
  this.setReviewsTab(message.tab);
} else if (message.type === 'toggle-reviews-status-filter') {
  this.toggleReviewsStatusFilter(message.status);
} else if (message.type === 'set-reviews-owner-filter') {
  this.setReviewsOwnerFilter(message.value);
}
```

```ts
private setReviewsTab(tab: unknown): void {
  if (tab !== 'all' && tab !== 'fixed' && tab !== 'needsMyFix') return;
  if (tab === this.reviewsTab) return;
  this.reviewsTab = tab;
  this.lastState = '';
  void this.refresh();
}

private toggleReviewsStatusFilter(status: unknown): void {
  if (status !== 'active' && status !== 'completed' && status !== 'abandoned') return;
  const isSelected = this.reviewsStatusFilters.includes(status);
  if (isSelected && this.reviewsStatusFilters.length === 1) return; // pelo menos 1 sempre marcado
  this.reviewsStatusFilters = isSelected
    ? this.reviewsStatusFilters.filter(s => s !== status)
    : [...this.reviewsStatusFilters, status];
  this.lastState = '';
  void this.refresh();
}
```

`setReviewsOwnerFilter` continua igual ao de hoje (só muda o que `refresh()` faz com o valor).

### 4. Markup — `renderReviews.ts`

```ts
const TAB_OPTIONS: { value: 'all' | 'fixed' | 'needsMyFix'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'needsMyFix', label: 'Needs my fix' },
];

function renderReviewsTabs(selected: 'all' | 'fixed' | 'needsMyFix'): string {
  return `
    <div class="kb-search-tabs">
      ${TAB_OPTIONS.map(
        o => `<button type="button" class="kb-search-tab${o.value === selected ? ' kb-search-tab-active' : ''}" data-action="set-reviews-tab" data-tab="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewsStatusMultiSelect(selected: ('active' | 'completed' | 'abandoned')[]): string {
  return `
    <div class="kb-search-tabs">
      ${STATUS_FILTER_OPTIONS.map(
        o => `<button type="button" class="kb-search-tab${selected.includes(o.value) ? ' kb-search-tab-active' : ''}" data-action="toggle-reviews-status-filter" data-status="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}
```

`export function renderReviews(state: RenderState)`:

```ts
export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const repositories = config.repositories ?? {};
  const tab = state.reviewsTab ?? 'all';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsTabs(tab)}
    <div class="kb-reviews-filters">
      ${
        tab === 'all'
          ? `${renderReviewsStatusMultiSelect(state.reviewsStatusFilters ?? ['active'])}${renderReviewsOwnerFilters(state.reviewsOwnerFilter ?? 'all')}`
          : ''
      }
    </div>
    <div class="kb-reviews-list">
      ${
        sorted.length
          ? groupByRepo(sorted).map(group => renderRepoGroup(group, repositories)).join('')
          : renderEmptyMessage(tab, state.reviewsStatusFilters ?? ['active'], state.reviewsOwnerFilter ?? 'all')
      }
    </div>
  `;
}
```

A função `renderReviewsStatusTabs` de hoje é **substituída** por `renderReviewsStatusMultiSelect` (acima) — não coexistem, o multi-select assume o papel dela. `renderEmptyMessage` tem sua assinatura ajustada pra receber `tab` e a lista de status em vez do status único — `renderEmptyMessage` passa a dizer algo como "No fixed pull requests to re-review." / "No PRs need your fix." quando `tab !== 'all'`.

`RenderState` (`render.ts`) troca `reviewsStatusFilter?: 'active' | 'completed' | 'abandoned'` por `reviewsStatusFilters?: ('active' | 'completed' | 'abandoned')[]` e ganha `reviewsTab?: 'all' | 'fixed' | 'needsMyFix'`.

### 5. JS do webview

Substituir o listener do `data-action="set-reviews-status-filter"` (hoje exclusivo, com `!target.classList.contains('kb-search-tab-active')` pra ignorar reclique) por dois branches:

```js
} else if (target.dataset && target.dataset.action === 'set-reviews-tab' && !target.classList.contains('kb-search-tab-active')) {
  setLoading(target);
  vscode.postMessage({ type: 'set-reviews-tab', tab: target.dataset.tab });
} else if (target.dataset && target.dataset.action === 'toggle-reviews-status-filter') {
  setLoading(target);
  vscode.postMessage({ type: 'toggle-reviews-status-filter', status: target.dataset.status });
}
```

A aba de tab (`set-reviews-tab`) continua com o guard de "não reclicar na já ativa" (comportamento exclusivo). O multi-select de status (`toggle-reviews-status-filter`) **não** tem esse guard — cada clique alterna aquele status específico, independente do estado dos outros.

`applyReviewsOwnerFilter`/os dois checkboxes (`kb-reviews-filter-mine`/`kb-reviews-filter-assigned`) continuam exatamente como hoje, sem mudança — só passam a não existir no DOM quando `tab !== 'all'` (já que `renderReviews` não os renderiza fora da aba All).

### 6. CSS

Reaproveita 100% do `.kb-search-tabs`/`.kb-search-tab`/`.kb-search-tab-active` já existente — nenhuma classe nova, já que visualmente as duas linhas de aba (tabs de tab + multi-select de status) usam o mesmo componente, só muda o comportamento de clique no JS.

## Tratamento de erros

- `getPullRequestThreads` (usado por PR dentro de `fetchReviewsPullRequests`) já lança em caso de erro de rede/HTTP — como `listProjectPullRequests` hoje já engole erros e devolve `[]` (`try/catch` interno), mas `getPullRequestThreads` **não** engole — um erro numa única thread-fetch dentro do `Promise.all` derruba a lista toda de "Fixed"/"Needs my fix". Para não quebrar a página inteira por causa de 1 PR com erro, envolvo cada chamada individual num `try/catch` que, em caso de erro, trata aquele PR como `keep: false` (não aparece na lista, não trava as outras).
- `this.currentUserId` nulo (usuário sem perfil resolvido) → `fetchReviewsPullRequests` devolve `[]` para as abas Fixed/Needs my fix, mesmo comportamento de guard que outras partes do arquivo já usam.
- `reviewsStatusFilters` nunca fica vazio — `toggleReviewsStatusFilter` recusa desmarcar o último item restante.

## Testes

- `src/azureDevOps/classifyPrThreads.test.ts` (novo): `hasAnyActiveThread` true/false; `hasMyThreadsAllResolved` true quando todas as minhas são resolvidas, false quando alguma é `active`, false quando não tenho nenhuma thread (array vazio não conta como "tudo resolvido"); threads de outras pessoas não contam para `hasMyThreadsAllResolved`.
- `src/azureDevOps/client.test.ts`: `mapIdentityRef` (indiretamente via `getComments`/`getPullRequestThreads`/etc.) passa a incluir `id` quando presente no raw response.
- `src/view/renderReviews.test.ts`: tabs `All`/`Fixed`/`Needs my fix` renderizadas e a correta marcada como ativa; multi-select de status e checkboxes de owner só aparecem quando `tab === 'all'`; múltiplos status marcados simultaneamente no multi-select.
- Sem teste automatizado pro fetch/wiring assíncrono em `KanbrainViewProvider.ts` (mesmo padrão já estabelecido nesse arquivo — sem test file, verificação por `npm run compile` + releitura cuidadosa).
