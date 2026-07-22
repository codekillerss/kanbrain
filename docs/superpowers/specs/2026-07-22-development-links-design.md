# Development (branch/PR) no card — Design

## Contexto e motivação

O Azure DevOps já resolve `parentId`/`childIds` a partir das relações `System.LinkTypes.Hierarchy-*` do work item (`mapWorkItem.ts`), mas ignora completamente as relações do tipo `ArtifactLink` — que é como branches e pull requests vinculados aparecem na seção **Development** do work item real, com um ícone próprio (diferente do de tipo/parent/children). Kanbrain hoje não busca, resolve nem exibe nada disso.

Diferente do Parent/AssignedTo (Fields do board, mirrados via `cardsettings`), a seção Development no Azure é controlada por outra configuração inteiramente (aba *Annotations* do board) — uma API que não foi validada nesta sessão e que traria o mesmo tipo de risco técnico não verificado que o `cardsettings` trouxe da primeira vez. Para evitar esse risco, esta feature **não espelha nenhuma configuração do board**: a seção Development aparece sempre que o work item tiver relações do tipo, incondicionalmente — mesmo tratamento que a lista "Children (N)" já recebe hoje.

O ícone real da Azure para essa seção é um asset estático da UI dela (Fluent UI), não exposto por nenhum endpoint que já usamos — não dá para buscá-lo em tempo de execução. Em vez de aproximar com emoji, usamos o SVG real do ícone **"Branch Fork"** da biblioteca **Fluent UI System Icons** (MIT, Microsoft — mesma linguagem visual usada pela própria Azure DevOps), embutido no código:

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z" fill="currentColor"/>
</svg>
```

(`fill` trocado para `currentColor` para herdar a cor do texto do tema, mesmo tratamento que os ícones de tipo de work item já recebem.)

## Escopo

**Dentro do escopo:**
- Branches e pull requests juntos, numa única seção "Development" — sem separar em duas listas (espelha como a própria Azure agrupa os dois sob o mesmo ícone/seção).
- Branch: mostra só o nome (decodificado direto da URL da relation, sem chamada nova à API).
- Pull Request: mostra `#id`, título e status — exige uma chamada nova por PR vinculado (`client.getPullRequest`). Se essa chamada falhar, mostra só `#id`, sem título/status, sem quebrar o card.
- Aparece em **todo card renderizado por `renderWorkItemCard`** — card principal da tela Flow, cada card filho, e o card ativo da Home (mesma função compartilhada) — já que os dados de relations vêm no mesmo fetch de cada work item, sem custo extra de API por card (só os PRs individuais custam 1 chamada cada, com cache).
- Sem toggle, sem configuração nenhuma — sempre exibida quando `development.length > 0`, mesmo tratamento incondicional que "Children (N)" já tem.
- Sem ação de clique — só exibição (v1).
- Cache de detalhes de PR (`título`/`status`) **indefinido por sessão**, mesmo padrão do `avatarCache` — um PR que mudar de status durante a sessão só atualiza se o VS Code for reiniciado.

**Fora do escopo (v1):**
- Clique para abrir o PR/branch (no navegador ou, mais adiante, um diff viewer dentro do VS Code) — ideia original da conversa, mas fica para uma spec futura e separada.
- Qualquer outro tipo de `ArtifactLink` (Build, Commit, etc.) — ignorado silenciosamente.
- Resolver o nome do repositório (a URL só carrega o `repositoryId`, um GUID) — mostra só nome da branch / título do PR, sem prefixar com o nome do repo.
- Mirroring de qualquer configuração do board (Annotations) — sempre exibido incondicionalmente, ver "Contexto e motivação".
- Exibição na aba de detalhes do work item ou nos resultados de busca — só nos cards (`renderWorkItemCard`).

**Risco técnico a declarar:** o formato exato da URL `vstfs:///Git/...` e da resposta de `GET .../pullrequests/{id}` foram confirmados via pesquisa (não uma chamada real nesta sessão) — mesmo tipo de risco que o `cardsettings` teve inicialmente. O parser da URL é escrito de forma defensiva (relação que não bate com nenhum dos dois padrões é simplesmente ignorada, nunca lança erro) e `getPullRequest` engole qualquer erro retornando `null` — mas **vale validar contra um projeto Azure DevOps real com work items que tenham branches/PRs vinculados** antes de considerar essa feature pronta, ajustando os regexes de parsing se a resposta real vier diferente.

## Design

### 1. Tipos (`src/types.ts`)

```ts
export type DevelopmentLink =
  | { kind: 'branch'; repositoryId: string; branchName: string }
  | { kind: 'pullRequest'; repositoryId: string; pullRequestId: number };

export interface PullRequestDetails {
  title: string;
  status: string;
}

export interface WorkItem {
  // ...campos existentes
  development: DevelopmentLink[];
}
```

### 2. Parsing das relations (`src/azureDevOps/mapWorkItem.ts`)

`RawRelation` ganha `attributes` (não usado para classificar — a classificação usa o padrão da própria URL, mais robusto do que depender de um campo que pode não vir sempre):

```ts
export interface RawRelation {
  rel: string;
  url: string;
  attributes?: { name?: string };
}
```

Novo parser, exportado para teste direto:

```ts
const PULL_REQUEST_URL = /^vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/([^/]+)\/(\d+)$/;
const BRANCH_URL = /^vstfs:\/\/\/Git\/Ref\/[^/]+\/([^/]+)\/GB(.+)$/;

export function parseDevelopmentLink(relation: RawRelation): DevelopmentLink | null {
  const prMatch = relation.url.match(PULL_REQUEST_URL);
  if (prMatch) {
    return { kind: 'pullRequest', repositoryId: prMatch[1], pullRequestId: Number(prMatch[2]) };
  }
  const branchMatch = relation.url.match(BRANCH_URL);
  if (branchMatch) {
    return { kind: 'branch', repositoryId: branchMatch[1], branchName: decodeURIComponent(branchMatch[2]) };
  }
  return null;
}
```

Em `mapWorkItem`:

```ts
export function mapWorkItem(raw: RawWorkItem, organization: string, project: string): WorkItem {
  const relations = raw.relations ?? [];
  const parentRelation = relations.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  const childRelations = relations.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward');
  const development = relations
    .filter(r => r.rel === 'ArtifactLink')
    .map(parseDevelopmentLink)
    .filter((link): link is DevelopmentLink => link !== null);

  return {
    // ...campos existentes
    development,
  };
}
```

Uma relação `ArtifactLink` de tipo não reconhecido (Build, Commit, etc.) não bate em nenhum dos dois regexes — `parseDevelopmentLink` retorna `null` e o filtro final descarta, sem lançar erro.

### 3. Cliente (`src/azureDevOps/client.ts`)

```ts
async getPullRequest(organization: string, project: string, repositoryId: string, pullRequestId: number): Promise<PullRequestDetails | null> {
  try {
    const data = await this.request<{ title: string; status: string }>(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=7.1`,
    );
    return { title: data.title, status: data.status };
  } catch {
    return null;
  }
}
```

### 4. Renderização (`src/view/renderDevelopment.ts`, novo arquivo)

```ts
import type { DevelopmentLink, PullRequestDetails } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_FORK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z" fill="currentColor"/></svg>`;

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    return `<div class="kb-dev-item">${escapeHtml(link.branchName)}</div>`;
  }
  const details = prDetails[`${link.repositoryId}:${link.pullRequestId}`];
  const label = details
    ? `#${link.pullRequestId} ${escapeHtml(details.title)} (${escapeHtml(capitalize(details.status))})`
    : `#${link.pullRequestId}`;
  return `<div class="kb-dev-item">${label}</div>`;
}

export function renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string {
  if (development.length === 0) {
    return '';
  }
  return `
    <div class="kb-field-row">
      <div class="kb-field-label kb-dev-label">${BRANCH_FORK_ICON}<span>Development</span></div>
      ${development.map(link => renderDevelopmentItem(link, prDetails)).join('')}
    </div>
  `;
}
```

### 5. `renderWorkItemCard.ts`: novo parâmetro, incondicional

```ts
import { renderDevelopmentSection } from './renderDevelopment';

export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedBoard: string | undefined = undefined,
  prDetails: Record<string, PullRequestDetails> = {},
): string {
  // ...borderStyle, iconHtml, showAssignedTo, assigneeHtml, parentHtml como já existe...
  const developmentHtml = renderDevelopmentSection(workItem.development, prDetails);

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      ${parentHtml}
      ${assigneeHtml}
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

`developmentHtml` fica depois da linha de status (última "seção" do card, antes do botão de skill) — não depende de `config` nem de `selectedBoard`, é puramente incondicional a partir de `workItem.development`.

### 6. Resolução em `KanbrainViewProvider.ts`

Novo cache, mesmo padrão do `avatarCache` (linha ~30, junto aos outros campos privados):

```ts
private prCache = new Map<string, PullRequestDetails | null>();
```

Novo método privado, ao lado de `resolveAvatars`:

```ts
private async resolvePullRequestDetails(items: WorkItem[]): Promise<Record<string, PullRequestDetails>> {
  if (!this.client) {
    return {};
  }
  const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;
  if (!config) {
    return {};
  }
  const prLinks = items.flatMap(i => i.development.filter((d): d is Extract<DevelopmentLink, { kind: 'pullRequest' }> => d.kind === 'pullRequest'));
  const uncached = prLinks.filter(link => !this.prCache.has(`${link.repositoryId}:${link.pullRequestId}`));

  await Promise.all(
    uncached.map(async link => {
      const key = `${link.repositoryId}:${link.pullRequestId}`;
      this.prCache.set(key, await this.client!.getPullRequest(config.organization, config.project, link.repositoryId, link.pullRequestId));
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

Em `refresh()`, ao lado da resolução de avatares:

```ts
const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
const prDetails = config ? await this.resolvePullRequestDetails([workItem, ...subtasks].filter((w): w is WorkItem => !!w)) : {};
```

(`parent` fica de fora — a seção Development só aparece nos cards renderizados por `renderWorkItemCard`, e o work item do parent nunca passa por essa função, só é usado pelo `renderParentRow`.)

`render({ ...avatars, prDetails, ... })` passa `prDetails` no `RenderState` (seção 7).

### 7. `RenderState`, `render.ts`, `renderHome.ts`

```ts
export interface RenderState {
  // ...campos existentes
  prDetails?: Record<string, PullRequestDetails>;
}
```

`render.ts`:
```ts
const prDetails = state.prDetails ?? {};
// subtasks:
state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedBoard, prDetails)).join('')
// card principal:
renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedBoard, prDetails)
```

`renderHome.ts` (mesmo `prDetails`, via `state.prDetails ?? {}`):
```ts
renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedBoard, prDetails)
```

### 8. CSS (`KanbrainViewProvider.ts`)

```css
.kb-dev-label { display: flex; align-items: center; gap: 4px; }
.kb-dev-item { font-size: 12px; margin-top: 2px; opacity: 0.85; }
```

## Tratamento de erros

- Relação `ArtifactLink` cuja URL não bate com o padrão de branch nem de PR (Build, Commit, tipo futuro desconhecido): `parseDevelopmentLink` retorna `null`, descartada silenciosamente — nunca lança erro, nunca aparece na lista.
- `client.getPullRequest` falha (404, sem permissão, rede): retorna `null`; `resolvePullRequestDetails` simplesmente não inclui aquele PR no dicionário resolvido; `renderDevelopmentItem` cai no fallback `#id` sem título/status — o card renderiza normalmente, sem quebrar.
- `resolvePullRequestDetails` sem `client`/`config` (ex: workspace sem projeto configurado): retorna `{}` imediatamente, sem tentar nenhuma chamada.
- Cache (`prCache`) guarda inclusive o `null` de uma falha — evita bater na API de novo a cada poll de 5s para um PR que já falhou uma vez (mesmo comportamento do `avatarCache`, que já faz isso hoje).

## Testes

- `src/azureDevOps/mapWorkItem.test.ts`: `parseDevelopmentLink` — URL de PR válida extrai `repositoryId`+`pullRequestId`; URL de branch válida extrai `repositoryId`+nome decodificado (incluindo um nome com `/`, ex: `feature%2Ffoo` → `feature/foo`); URL de outro tipo de artifact (ex: Build) retorna `null`; `mapWorkItem` popula `development` a partir das relações `ArtifactLink`, ignorando as de Hierarchy.
- `src/azureDevOps/client.test.ts`: `getPullRequest` — sucesso mapeia `title`/`status`; erro (404) retorna `null`.
- `src/view/renderDevelopment.test.ts` (novo): array vazio → string vazia (sem ícone, sem "Development"); branch renderiza nome escapado; PR com detalhe resolvido renderiza `#id título (Status capitalizado)`; PR sem detalhe resolvido (ausente do dicionário) renderiza só `#id`; múltiplos itens (branch + PR) na mesma seção.
- `src/view/renderWorkItemCard.test.ts`: card sem `workItem.development` (array vazio, valor padrão dos testes existentes) continua sem seção Development; com `development` populado, a seção aparece incondicionalmente (não depende de `config`/`cardSettingsByBoard`).
- `src/view/render.test.ts` / `src/view/renderHome.test.ts`: `prDetails` passado adiante para os cards (principal, filhos, Home).
- Sem teste dedicado para `resolvePullRequestDetails` (acoplado à API do VS Code/client, mesmo padrão de `resolveAvatars`, nunca testado isoladamente) — verificado via `npm run compile` + suíte completa.
- **Reforçando o risco técnico:** validar manualmente (F5) contra um work item real com branch e/ou PR vinculados antes de considerar pronto — os regexes de `PULL_REQUEST_URL`/`BRANCH_URL` e a resposta de `getPullRequest` não foram confirmados contra uma chamada real nesta sessão.
