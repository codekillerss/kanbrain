# Exibição do assignedTo nos cards — Design

## Contexto e motivação

Hoje o `WorkItem` não carrega quem está atribuído ao item (`System.AssignedTo`), e nenhum card (principal, subtask, ou item da lista de busca) mostra essa informação. O usuário quer ver o responsável tanto no card do item já selecionado (e nos subtasks) quanto no modal de seleção/busca, com uma opção pra ligar/desligar essa exibição na tela de Configuration.

## Escopo

**Dentro do escopo:**
- Novo campo `WorkItem.assignedTo` (nome + URL do avatar), populado a partir de `System.AssignedTo` do Azure DevOps.
- Exibição de avatar + nome nos cards (`renderWorkItemCard`, usado no card principal e nos cards de subtask) e no modal de busca (`renderSearchResults`).
- Resolução autenticada do avatar (o Azure DevOps exige o mesmo Bearer token usado nas chamadas de API pra servir a foto) via `AzureDevOpsClient`, convertendo pra `data:` URI, com cache em memória no `KanbrainViewProvider` pra não rebuscar a cada poll (5s) ou a cada tecla na busca.
- Fallback sem foto: badge com a inicial do nome. Sem responsável: texto "Unassigned", sem avatar.
- Novo campo opcional `KanbrainConfig.showAssignedTo` (ausente ou `true` = mostrar; `false` = esconder), com um checkbox "Show assignee on cards" numa nova seção "Display" no topo da tela de Configuration (`renderConfig.ts`), persistido via nova mensagem de webview `set-show-assigned-to`.

**Fora do escopo:**
- Qualquer ação a partir do avatar/nome (ex: filtrar por responsável, reatribuir o item pelo painel).
- Exibir o assignedTo em qualquer outro lugar além dos cards e do modal de busca (ex: não entra no arquivo de contexto gerado pra skills, `generateContextFile`).
- Paginação/lazy loading de avatares — o volume por render (item atual + parent + subtasks, ou os resultados da busca atual) é pequeno o suficiente pra resolver tudo antes de renderizar.
- Suporte a múltiplos responsáveis por item (Azure DevOps permite só um `System.AssignedTo`).

## Design

### Tipos (`src/types.ts`)

```ts
export interface AssignedTo {
  displayName: string;
  imageUrl: string | null;
}

export interface WorkItem {
  // ...campos existentes
  assignedTo: AssignedTo | null;
}

export interface KanbrainConfig {
  // ...campos existentes
  showAssignedTo?: boolean;
}
```

Em todos os pontos de leitura, ausência de `showAssignedTo` é tratada como `true` (`config.showAssignedTo !== false`), mesmo padrão já usado pra `statusColors ?? {}`.

### Mapeamento (`src/azureDevOps/mapWorkItem.ts`)

`raw.fields['System.AssignedTo']` é um `IdentityRef` (ou `undefined` se ninguém estiver atribuído):

```ts
interface RawIdentityRef {
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function mapAssignedTo(raw: unknown): AssignedTo | null {
  const identity = raw as RawIdentityRef | undefined;
  if (!identity?.displayName) {
    return null;
  }
  const imageUrl = identity.imageUrl ?? identity._links?.avatar?.href ?? null;
  return { displayName: identity.displayName, imageUrl };
}
```

Chamado em `mapWorkItem` como `assignedTo: mapAssignedTo(raw.fields['System.AssignedTo'])`. Nenhuma mudança em `client.ts` — `getWorkItems` já busca todos os campos (sem parâmetro `fields` restringindo o retorno).

### Avatar autenticado (`src/azureDevOps/client.ts`)

Novo método público, reaproveitando a mesma auth de `fetchWithAuth`:

```ts
async getAvatarDataUri(url: string): Promise<string | null> {
  try {
    const response = await this.fetchWithAuth(url);
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}
```

### Cache e resolução (`src/view/KanbrainViewProvider.ts`)

```ts
private avatarCache = new Map<string, string | null>();

private async resolveAvatars(items: WorkItem[]): Promise<Record<string, string>> {
  const urls = [...new Set(items.map(i => i.assignedTo?.imageUrl).filter((u): u is string => !!u))];
  const uncached = urls.filter(u => !this.avatarCache.has(u));
  await Promise.all(
    uncached.map(async url => {
      this.avatarCache.set(url, this.client ? await this.client.getAvatarDataUri(url) : null);
    }),
  );
  const resolved: Record<string, string> = {};
  for (const url of urls) {
    const dataUri = this.avatarCache.get(url);
    if (dataUri) {
      resolved[url] = dataUri;
    }
  }
  return resolved;
}
```

- Em `refresh()`: quando `config.showAssignedTo !== false`, chama `resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w))` antes de montar o `RenderState`, e passa o resultado como `avatars` pro `render()`.
- Em `searchWorkItems()`: mesma lógica sobre os `items` retornados pela busca, antes de chamar `renderSearchResults`, passando `avatars` como novo parâmetro.
- Cache nunca expira durante a sessão da view (avatares raramente mudam); não há limite de tamanho porque o número de identidades distintas num projeto é pequeno.

### Detecção de mudança de estado (`src/view/hasStateChanged.ts`)

`serializeState`/`hasStateChanged` passam a receber também o mapa `avatars` resolvido pro render atual, incluído no JSON serializado:

```ts
export function serializeState(config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown): string {
  return JSON.stringify({ config, workItem, subtasks, avatars });
}

export function hasStateChanged(previous: string, config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown): boolean {
  return serializeState(config, workItem, subtasks, avatars) !== previous;
}
```

Isso garante que, quando um avatar termina de resolver (chega no cache) depois de um primeiro render sem ele, a mudança do mapa `avatars` força um novo render — mesmo que `config`/`workItem`/`subtasks` não tenham mudado.

### Cards (`src/view/renderWorkItemCard.ts`)

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
): string
```

Nova linha, abaixo de `.kb-status-row`, só quando `config.showAssignedTo !== false`:

```ts
function renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>): string {
  if (!assignedTo) {
    return '<div class="kb-assignee-row"><span class="kb-avatar-initial">?</span>Unassigned</div>';
  }
  const dataUri = assignedTo.imageUrl ? avatars[assignedTo.imageUrl] : undefined;
  const avatarHtml = dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(assignedTo.displayName.charAt(0).toUpperCase())}</span>`;
  return `<div class="kb-assignee-row">${avatarHtml}${escapeHtml(assignedTo.displayName)}</div>`;
}
```

Chamada tanto no card principal quanto no de subtask, já que ambos passam pela mesma função.

### Modal de busca (`src/view/renderSearchResults.ts`)

`renderSearchResults` e `renderStatusGroups` ganham o parâmetro `avatars: Record<string, string>`. Cada `.kb-result-item` passa a ter uma segunda linha (`.kb-result-item-assignee`) com a mesma lógica de `renderAssigneeRow` acima (reaproveitada/extraída pra um helper compartilhado, dado que a marcação — avatar + nome — é a mesma, só o tamanho via CSS muda), condicionada a `config.showAssignedTo !== false`.

### Configuration (`src/view/renderConfig.ts`)

Nova seção antes de "Skill Configuration":

```html
<div class="kb-section-label">Display</div>
<label class="kb-checkbox-row">
  <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
  Show assignee on cards
</label>
```

### Webview: mensagem e persistência (`KanbrainViewProvider.ts`)

- Handler no listener de mensagens: `else if (message.type === 'set-show-assigned-to') { this.setShowAssignedTo(Boolean(message.value)); }`.
- `setShowAssignedTo(value)`: lê o config, seta `config.showAssignedTo = value`, `writeConfig`, zera `this.lastState` e chama `refresh()` — mesmo padrão de `saveSkillEntry`.
- No script inline de `wrapHtml`, listener de `change` no `#kb-show-assignee-toggle` postando `{ type: 'set-show-assigned-to', value: checkbox.checked }`.

### `syncConfig` (`src/config/syncConfig.ts`)

O objeto retornado passa a preservar explicitamente `showAssignedTo: config.showAssignedTo` (hoje `syncConfig` monta um objeto literal que não repassa campos não listados — sem essa linha, sincronizar o board apagaria a preferência salva).

### Estilos (`KanbrainViewProvider.css()`)

```css
.kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; }
.kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
.kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
.kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; }
.kb-result-item-assignee .kb-avatar, .kb-result-item-assignee .kb-avatar-initial { width: 14px; height: 14px; }
.kb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; cursor: pointer; }
```

## Tratamento de erros

- `System.AssignedTo` ausente → `assignedTo: null` → card mostra "Unassigned", sem chamada de rede.
- Fetch do avatar falha (401, rede, etc.) → `getAvatarDataUri` retorna `null`, cache guarda `null` (não tenta de novo a cada poll dentro da mesma sessão), UI cai no badge de inicial.
- `showAssignedTo === false` → nenhuma linha de assignee é renderizada e nenhuma chamada de avatar é feita (evita custo de rede quando o usuário desligou o recurso).

## Testes

- `src/azureDevOps/mapWorkItem.test.ts`: casos novos para `System.AssignedTo` presente (com `imageUrl` e com só `_links.avatar.href`) e ausente (`assignedTo: null`).
- `src/view/renderWorkItemCard.test.ts`: card com assignee (avatar resolvido, avatar não resolvido → inicial, sem assignee → "Unassigned"), e card com `showAssignedTo: false` não renderizando a linha.
- `src/view/renderSearchResults.test.ts`: mesma cobertura, verificando a segunda linha por item.
- `src/view/renderConfig.test.ts` / `renderConfigEditor` ou novo teste dedicado: checkbox marcado por padrão quando `showAssignedTo` ausente, desmarcado quando `false`.
- `src/view/hasStateChanged.test.ts`: novo parâmetro `avatars` incluído na comparação — mudança só no mapa de avatares já é suficiente pra `hasStateChanged` retornar `true`.
- `src/config/syncConfig.test.ts`: caso novo garantindo que `showAssignedTo` sobrevive a um sync.
