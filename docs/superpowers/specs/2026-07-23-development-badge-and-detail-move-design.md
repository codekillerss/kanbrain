# Development: badge no card, lista completa no detail — Design

## Contexto e motivação

A seção Development (`docs/superpowers/specs/2026-07-22-development-links-design.md`) foi implementada exibindo, em todo card renderizado por `renderWorkItemCard` (Flow, filhos, Home), a lista completa de branches e PRs vinculados (nome da branch / `#id título (Status)`). Depois de corrigir um bug de parsing das URLs `vstfs:///` (separador real `%2F`, não `/` literal — ver commit anterior), a seção passou a aparecer, mas o formato não é o que o usuário queria: no card real do Azure Boards, a seção Development aparece como um ícone de fork (dourado, fixo, não monocromático) + uma contagem total de itens vinculados — configurado em **Boards > Settings > Annotations** — não uma lista expandida de cada item.

O usuário quer replicar esse comportamento: **ícone + contagem** no card. A lista completa com título/status de cada PR continua tendo valor, mas passa a viver no painel de detalhes do work item (`WorkItemDetailPanelManager`, aberto ao clicar no título do card na Flow), que já busca dados sob demanda (sem polling de 5s) e já tem um padrão de cache de chamada extra (`avatarCache`) para reaproveitar.

## Escopo

**Dentro do escopo:**
- Card (`renderWorkItemCard`, usado em Flow/filhos/Home): badge = ícone de fork + contagem combinada (branches + PRs juntos, sem distinguir tipo), na mesma posição onde a seção Development aparece hoje (depois da linha de status). Cor do ícone fixa (dourado/âmbar, ex. `#EAA300`), não `currentColor` — deliberadamente diferente do tratamento monocromático dos ícones de tipo, para casar com a aparência real do Azure.
- Detail panel (`WorkItemDetailPanelManager` / `renderWorkItemDetail`): lista completa (nome de branch / `#id título (Status)`), reaproveitando o `renderDevelopmentSection` já existente, na coluna lateral (`kb-detail-side`) junto aos grupos de campos.
- Resolução de `PullRequestDetails` (chamada `getPullRequest` por PR vinculado) passa a acontecer apenas quando o painel de detalhes é aberto, com cache de sessão no próprio `WorkItemDetailPanelManager` (mesmo padrão do `avatarCache`) — não mais a cada poll de 5s do card.
- Remoção do código que ficou morto no caminho do card: `KanbrainViewProvider.prCache`/`resolvePullRequestDetails`, `RenderState.prDetails`, o parâmetro `prDetails` de `renderWorkItemCard`, e a variável/threading de `prDetails` em `render.ts`/`renderHome.ts`.

**Fora do escopo:**
- Clique na badge do card para abrir algo (v1 do badge é só exibição, mesma decisão da spec original).
- Contadores separados por tipo (branches vs PRs) — usuário confirmou que quer só o total combinado, igual ao Azure real.
- Qualquer mudança em `AzureDevOpsClient.getPullRequest` ou no parsing de `mapWorkItem.ts` — ambos continuam como estão, só muda quem chama e quando.

## Design

### 1. `renderDevelopment.ts`: nova função `renderDevelopmentBadge`

```ts
const BADGE_ICON_COLOR = '#EAA300';

function renderDevelopmentBadgeIcon(): string {
  // mesmo path do BRANCH_FORK_ICON, mas fill fixo em vez de currentColor
}

export function renderDevelopmentBadge(development: DevelopmentLink[]): string {
  if (development.length === 0) {
    return '';
  }
  return `
    <div class="kb-field-row kb-dev-badge">
      ${renderDevelopmentBadgeIcon()}<span>${development.length}</span>
    </div>
  `;
}
```

`renderDevelopmentSection` (lista completa, existente) permanece inalterada — passa a ser usada só pelo detail panel.

### 2. `renderWorkItemCard.ts`

- Remove o parâmetro `prDetails` (e o import de `PullRequestDetails`).
- Troca `renderDevelopmentSection(workItem.development, prDetails)` por `renderDevelopmentBadge(workItem.development)`.

### 3. `render.ts` / `renderHome.ts` / `RenderState`

- Remove o campo `prDetails` de `RenderState`.
- Remove a variável `const prDetails = state.prDetails ?? {}` e o argumento correspondente nas chamadas de `renderWorkItemCard` (principal, filhos, Home).

### 4. `KanbrainViewProvider.ts`

- Remove `prCache` (campo privado) e o método `resolvePullRequestDetails`.
- Remove a chamada a `resolvePullRequestDetails` e a atribuição de `prDetails` em `refresh()`.
- Remove `prDetails` do objeto passado para `render(...)`.
- Import de `DevelopmentLink`/`PullRequestDetails` removido se não usado mais nesse arquivo.

### 5. `WorkItemDetailPanelManager.ts`

Novo cache privado, ao lado de `avatarCache`:

```ts
private prCache = new Map<string, PullRequestDetails | null>();
```

Novo método privado, mesmo padrão de `resolveAvatars`:

```ts
private async resolvePullRequestDetails(workItem: WorkItem, config: KanbrainConfig): Promise<Record<string, PullRequestDetails>> {
  const prLinks = workItem.development.filter((d): d is Extract<DevelopmentLink, { kind: 'pullRequest' }> => d.kind === 'pullRequest');
  const uncached = prLinks.filter(link => !this.prCache.has(`${link.repositoryId}:${link.pullRequestId}`));

  await Promise.all(
    uncached.map(async link => {
      const key = `${link.repositoryId}:${link.pullRequestId}`;
      this.prCache.set(key, await this.client.getPullRequest(config.organization, config.project, link.repositoryId, link.pullRequestId));
    }),
  );

  const resolved: Record<string, PullRequestDetails> = {};
  for (const link of prLinks) {
    const key = `${link.repositoryId}:${link.pullRequestId}`;
    const details = this.prCache.get(key);
    if (details) {
      resolved[key] = details;
    }
  }
  return resolved;
}
```

Em `open(id)`, ao lado da resolução de avatares:

```ts
const [avatars, prDetails] = await Promise.all([
  this.resolveAvatars(workItem, comments),
  this.resolvePullRequestDetails(workItem, config),
]);
```

Passa `prDetails` para `renderWorkItemDetail`.

### 6. `renderWorkItemDetail.ts`

- `WorkItemDetailInput` ganha `prDetails: Record<string, PullRequestDetails>`.
- Na coluna `kb-detail-side`, depois de `groups.map(renderDetailGroup)`, adiciona `renderDevelopmentSection(workItem.development, prDetails)` (retorna `''` quando vazio, mesmo comportamento de hoje).

### 7. CSS

`KanbrainViewProvider.ts` (card): troca as regras `.kb-dev-label`/`.kb-dev-item` (usadas só pela lista, agora não usada no card) por:

```css
.kb-dev-badge { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.kb-dev-badge svg { flex-shrink: 0; }
```

`WorkItemDetailPanelManager.ts` (detail panel): adiciona as regras que hoje só existem no card:

```css
.kb-dev-label { display: flex; align-items: center; gap: 4px; }
.kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
```

## Tratamento de erros

- Sem mudança nos caminhos de erro já existentes: `getPullRequest` falhando continua retornando `null` e o item cai no fallback `#id` sem título/status na lista do detail panel — o painel renderiza normalmente.
- Badge do card nunca depende de `prDetails`/chamada de rede — só de `development.length`, então não tem novo modo de falha.

## Testes

- `renderDevelopment.test.ts`: `renderDevelopmentBadge` — array vazio → `''`; badge mostra contagem combinada correta (branch + PR juntos); não depende de `prDetails`.
- `renderWorkItemCard.test.ts`: assinatura sem `prDetails`; card com `development` populado mostra a badge (ícone + número), não mais a lista; card sem `development` não mostra nada.
- `renderWorkItemDetail.test.ts`: `prDetails` no `WorkItemDetailInput`; seção Development aparece na coluna lateral quando `workItem.development` não vazio (lista completa, reaproveitando `renderDevelopmentSection`); ausente quando vazio.
- `render.test.ts` / `renderHome.test.ts`: remove as asserções de threading de `prDetails` que não existem mais.
- Sem teste dedicado para `resolvePullRequestDetails` em `WorkItemDetailPanelManager` (mesmo precedente de `resolveAvatars`) — verificado via `npm run compile` + suíte completa + validação manual (F5).
