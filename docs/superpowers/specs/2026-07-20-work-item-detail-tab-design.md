# Aba de detalhes do work item (estilo Azure DevOps) — Design

## Contexto e motivação

Hoje o Kanbrain só mostra um resumo do work item (id, título, status, tipo, assignee) nos cards da sidebar. Para ver a descrição completa, os demais campos ou os comentários, o usuário precisa abrir o item no navegador (via `workItem.url`). O pedido é trazer isso pra dentro do VS Code: uma aba de editor (igual abrir um arquivo — com título na aba, fechável com X), somente leitura, mostrando os campos do work item e a discussão/comentários, com uma estilização que lembre o formulário de edição da Azure DevOps.

A Azure DevOps expõe exatamente a configuração de quais campos aparecem e em que agrupamento através da API de layout do tipo de work item (`GET .../_apis/wit/workitemtypes/{type}/layout`), que reflete a customização do *process* do projeto. Em vez de curar uma lista fixa de campos ou inventar uma config nova, a aba usa essa API — com uma lista mínima fixa como fallback caso ela falhe ou venha vazia.

## Escopo

**Dentro do escopo:**
- Nova aba de editor (via `vscode.window.createWebviewPanel`) por work item, somente leitura, sem `<script>` (conteúdo 100% estático — sem necessidade de recarregar/interatividade nesta v1).
- Reabrir o mesmo work item foca a aba já aberta em vez de duplicar.
- Gatilhos:
  - **Tela de flow**: o título do card principal e dos cards de subtask ganham hover + clique, abrindo a aba do respectivo work item.
  - **Modal de busca**: cada item ganha um botão "View details" numa linha de rodapé compartilhada com o assignee (assignee à esquerda, botão alinhado à direita via `margin-left: auto`), já que não é mais possível aninhar um botão de ação dentro do botão que seleciona o item (ver "Restruturação do modal de busca" abaixo).
- Conteúdo da aba: cabeçalho (ícone do tipo, #id, título, status, assignee — reaproveitando os componentes já existentes), campos agrupados conforme o layout do processo (ou fallback), campos de texto rico (Descrição e outros campos HTML do processo) renderizados como HTML, e a seção de Discussion com comentários (avatar, autor, data, corpo em HTML).
- 3 novas chamadas em `AzureDevOpsClient`: layout do tipo, campos brutos completos do item, e comentários.
- CSP estrita na aba nova (`default-src 'none'`) já que ela embute HTML vindo da Azure DevOps (descrição/comentários) — sem `script-src`, então nenhum `<script>` injetado executa, mesmo sem sanitização completa do HTML.

**Fora do escopo (v1):**
- Edição de qualquer campo — é somente leitura.
- Abas de Attachments/Links/History do work item — só Details + Description + Discussion.
- Botão de "Refresh" na aba — fechar e reabrir busca dados novos (consistente com o modelo mental de "abrir um arquivo").
- Imagens embutidas dentro da descrição/comentários (ex: um screenshot colado no comentário): elas viriam de URLs da Azure DevOps que também exigem o Bearer token pra carregar (mesmo problema do avatar), e resolver isso exigiria parsear o HTML em busca de `<img>` e buscar cada uma autenticada — fica pra uma iteração futura. Texto/formatação renderizam normalmente; imagens embutidas ficam quebradas.
- Sanitização completa de HTML (tipo DOMPurify) — a defesa é a CSP (bloqueia qualquer `<script>`) + uma remoção simples de tags `<script>` como reforço, não uma biblioteca de sanitização completa.

**Risco técnico a declarar:** as 3 chamadas novas (layout do tipo, comentários, campos brutos) são implementadas com base em conhecimento geral da API da Azure DevOps, sem uma chamada real de verificação neste ambiente. O código é defensivo onde a forma exata da resposta é incerta (comentários especialmente), mas vale um teste manual contra um projeto real antes de considerar pronto — sinalizado de novo na seção de Testes.

## Design

### 1. Tipos e resolução de campos (`src/azureDevOps/workItemDetail.ts`, novo arquivo)

```ts
export interface WorkItemTypeLayoutControl {
  id: string; // nome de referência do campo, ex: "System.AssignedTo"
  label: string;
  controlType: string; // 'HtmlFieldControl' para campos de texto rico; outros valores tratados como campo simples
}

export interface WorkItemTypeLayoutGroup {
  label?: string;
  controls: WorkItemTypeLayoutControl[];
}

export interface WorkItemTypeLayoutSection {
  groups: WorkItemTypeLayoutGroup[];
}

export interface WorkItemTypeLayoutPage {
  sections: WorkItemTypeLayoutSection[];
}

export interface WorkItemTypeLayout {
  pages: WorkItemTypeLayoutPage[];
}

export interface DetailField {
  refName: string;
  label: string;
  value: unknown;
}

export interface DetailGroup {
  label: string | null;
  fields: DetailField[];
}

export interface DetailSections {
  groups: DetailGroup[];
  htmlSections: DetailField[];
}

const FALLBACK_FIELDS: { refName: string; label: string }[] = [
  { refName: 'System.State', label: 'State' },
  { refName: 'System.WorkItemType', label: 'Work Item Type' },
  { refName: 'System.AssignedTo', label: 'Assigned To' },
  { refName: 'System.AreaPath', label: 'Area Path' },
  { refName: 'System.IterationPath', label: 'Iteration Path' },
  { refName: 'System.Tags', label: 'Tags' },
  { refName: 'Microsoft.VSTS.Common.Priority', label: 'Priority' },
  { refName: 'System.CreatedBy', label: 'Created By' },
  { refName: 'System.CreatedDate', label: 'Created Date' },
  { refName: 'System.ChangedBy', label: 'Changed By' },
  { refName: 'System.ChangedDate', label: 'Changed Date' },
];

function resolveFallbackFields(rawFields: Record<string, unknown>): DetailField[] {
  return FALLBACK_FIELDS.filter(f => rawFields[f.refName] !== undefined).map(f => ({
    refName: f.refName,
    label: f.label,
    value: rawFields[f.refName],
  }));
}

export function resolveDetailFields(layout: WorkItemTypeLayout | null, rawFields: Record<string, unknown>): DetailSections {
  const controls = (layout?.pages ?? []).flatMap(page =>
    page.sections.flatMap(section =>
      section.groups.flatMap(group => group.controls.map(control => ({ ...control, groupLabel: group.label ?? null }))),
    ),
  );
  const usable = controls.filter(c => c.id !== 'System.Title' && c.id !== 'System.Description');

  if (usable.length === 0) {
    return { groups: [{ label: null, fields: resolveFallbackFields(rawFields) }], htmlSections: [] };
  }

  const htmlSections = usable
    .filter(c => c.controlType === 'HtmlFieldControl')
    .map(c => ({ refName: c.id, label: c.label, value: rawFields[c.id] }));

  const gridControls = usable.filter(c => c.controlType !== 'HtmlFieldControl');
  const order: string[] = [];
  const byGroup = new Map<string, DetailField[]>();
  for (const c of gridControls) {
    const key = c.groupLabel ?? '';
    if (!byGroup.has(key)) {
      order.push(key);
      byGroup.set(key, []);
    }
    byGroup.get(key)!.push({ refName: c.id, label: c.label, value: rawFields[c.id] });
  }

  return { groups: order.map(key => ({ label: key || null, fields: byGroup.get(key)! })), htmlSections };
}
```

`System.Title` e `System.Description` são sempre excluídos da grade/seções — o chamador (`renderWorkItemDetail`) trata os dois diretamente a partir de `rawFields`, independente do layout ter funcionado ou não, já que título e descrição são sempre exibidos.

### 2. Comentários e novas chamadas (`src/azureDevOps/client.ts`)

`WorkItemComment` também mora em `workItemDetail.ts` (mesmo padrão de `backlogLevels.ts` guardar tipos usados pelo `client.ts`):

```ts
export interface WorkItemComment {
  id: number;
  text: string;
  createdBy: { displayName: string; imageUrl: string | null };
  createdDate: string;
}
```

Novos métodos em `AzureDevOpsClient`, reaproveitando `mapAssignedTo`-style extraction (duplicada localmente já que `mapWorkItem.ts` não exporta essa função hoje):

```ts
async getWorkItemTypeLayout(organization: string, project: string, type: string): Promise<WorkItemTypeLayout | null> {
  try {
    return await this.request<WorkItemTypeLayout>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/layout?api-version=7.1-preview.1`,
    );
  } catch {
    return null;
  }
}

async getWorkItemRawFields(organization: string, project: string, id: number): Promise<Record<string, unknown>> {
  const data = await this.request<{ fields: Record<string, unknown> }>(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`,
  );
  return data.fields ?? {};
}

async getComments(organization: string, project: string, id: number): Promise<WorkItemComment[]> {
  const data = await this.request<{ comments?: RawComment[]; value?: RawComment[] }>(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.3`,
  );
  const list = data.comments ?? data.value ?? [];
  return list
    .map(c => ({
      id: c.id,
      text: c.text ?? '',
      createdBy: mapIdentityRef(c.createdBy),
      createdDate: c.createdDate,
    }))
    .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
}
```

`getWorkItemTypeLayout` engole erro e retorna `null` (em vez de propagar) — é exatamente o gatilho de fallback do `resolveDetailFields`. `getWorkItemRawFields`/`getComments` propagam erro normalmente (o chamador, `WorkItemDetailPanelManager`, decide o que fazer — ver seção 5).

### 3. Renderização (`src/view/renderWorkItemDetail.ts`, novo arquivo)

Função pura, testável, seguindo o mesmo padrão de `render.ts`/`renderWorkItemCard.ts` — recebe tudo já resolvido, devolve o HTML do `<body>` (o wrapper com `<!DOCTYPE>`/CSP/`<style>` fica no manager, seção 5, assim como `KanbrainViewProvider.wrapHtml` faz para a sidebar):

```ts
export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
}

export function renderWorkItemDetail(input: WorkItemDetailInput): string
```

Estrutura do HTML gerado:
- **Cabeçalho**: `renderTypeAccent`, `#id Título`, `renderStatusDot`+status, `renderAssigneeRow` — todos reaproveitados da sidebar pra manter consistência visual.
- **Corpo em duas colunas** (`display:flex; flex-wrap:wrap;` — quebra pra uma coluna em painéis estreitos): coluna larga com Descrição + outros `htmlSections` (cada um como um bloco com rótulo + HTML), coluna estreita com a grade de `groups` (rótulo do grupo como subtítulo, pares rótulo/valor abaixo).
- **Discussion**: lista de comentários (mais antigo primeiro), cada um com avatar (`renderAvatarOrInitial`, novo export de `renderAssignee.ts` — ver abaixo), nome, data formatada, corpo em HTML.

Formatação de valor (`formatFieldValue(refName, value): string`, exportada para teste direto):
- `null`/`undefined`/`''` → `—`
- Identity ref (`{ displayName: string }`) → `escapeHtml(displayName)`
- `refName` termina em `"Date"` e valor é uma data válida → `new Date(value).toLocaleString()`
- `refName === 'System.Tags'` e valor é string → cada tag (separadas por `;`) vira um `<span class="kb-detail-tag">`
- Caso contrário → `escapeHtml(String(value))`

Descrição e `htmlSections` passam por `stripScriptTags` (remoção simples de `<script>...</script>` via regex, defesa em profundidade) antes de entrar no HTML — a CSP é a defesa principal (seção 6).

### 4. `renderAssignee.ts`: extrair `renderAvatarOrInitial`

```ts
export function renderAvatarOrInitial(displayName: string, imageUrl: string | null, avatars: Record<string, string>): string {
  const dataUri = imageUrl ? avatars[imageUrl] : undefined;
  return dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`;
}
```

`renderAssigneeRow` passa a chamar essa função internamente (mesmo HTML de saída — refatoração sem mudança de comportamento). Reaproveitada pelo cabeçalho do comentário na aba de detalhes.

### 5. `WorkItemDetailPanelManager` (`src/view/WorkItemDetailPanelManager.ts`, novo arquivo)

Classe acoplada à API do VS Code (sem suíte de teste dedicada, mesmo padrão do `KanbrainViewProvider`):

```ts
export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}

  async open(id: number): Promise<void> {
    const existing = this.panels.get(id);
    if (existing) {
      existing.reveal();
      return;
    }

    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

    const [layout, rawFields, comments] = await Promise.all([
      this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type),
      this.client.getWorkItemRawFields(config.organization, config.project, id),
      this.client.getComments(config.organization, config.project, id).catch(() => []),
    ]);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const avatars = await this.resolveAvatars(workItem, comments);

    const panel = vscode.window.createWebviewPanel(
      'kanbrain.workItemDetail',
      `#${workItem.id} ${workItem.title}`,
      vscode.ViewColumn.Active,
      { enableScripts: false },
    );
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description: (rawFields['System.Description'] as string | undefined) ?? null,
        groups,
        htmlSections,
        comments,
        avatars,
      }),
    );
    panel.onDidDispose(() => this.panels.delete(id));
    this.panels.set(id, panel);
  }

  // resolveAvatars: mesmo padrão de KanbrainViewProvider.resolveAvatars, cache própria
  // (Map<string, string | null>), cobrindo workItem.assignedTo + cada comments[].createdBy.
}
```

### 6. Segurança (CSP) e wrapper HTML

Como a aba embute HTML vindo direto da Azure DevOps (descrição, comentários), o `wrapHtml` do manager usa uma política restritiva e **sem `<script>` nenhum**:

```html
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;">
  <style>${this.css()}</style>
</head>
<body>${body}</body>
</html>
```

Sem `script-src` liberado, qualquer `<script>` que sobreviver ao `stripScriptTags` (ex: um `<script>` dentro de um atributo malformado) simplesmente não executa — a CSP é quem garante isso, não a remoção de tags. `img-src data: https:` permite os avatares (`data:`) e não quebra se algum `<img>` remoto aparecer (mesmo sabendo que ele não vai carregar sem auth, per "fora do escopo").

### 7. Gatilhos

**Título clicável (`src/view/renderWorkItemCard.ts`)**: novo parâmetro `clickableTitle = false`.

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
): string {
  ...
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';
  ...
  <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
  ...
}
```

`src/view/render.ts` passa `true` nas duas chamadas de `renderWorkItemCard` da tela de flow (card principal e cada subtask). `src/view/renderHome.ts` não muda (fica `false`, o padrão).

**Modal de busca (`src/view/renderSearchResults.ts`)**: reestruturação necessária porque não dá pra colocar um `<button>` (View details) dentro de outro `<button>` (`.kb-result-item`, hoje o item inteiro):

```ts
return `
  <div class="kb-result-item"${borderStyle}>
    <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}">
      ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>
    </button>
    <div class="kb-result-item-footer">
      ${assigneeHtml}
      <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
    </div>
  </div>
`;
```

`.kb-result-item` vira um `<div>` (só carrega a borda colorida por tipo); `.kb-result-item-main` vira o `<button>` que antes era `.kb-result-item` (ganha o hover/clique de seleção); `.kb-result-item-footer` é a nova linha com assignee à esquerda e "View details" com `margin-left: auto` (funciona mesmo com `showAssignedTo: false`, quando `assigneeHtml` é vazio).

### 8. Wiring (`KanbrainViewProvider.ts`, `extension.ts`)

- `KanbrainViewProvider` ganha uma nova dependência no construtor: `openWorkItemDetail: (id: number) => Promise<void>`.
- Novo branch na mensagem: `else if (message.type === 'open-work-item-detail') { await this.openWorkItemDetail(Number(message.id)); }` chamando a dependência injetada.
- Novo branch no script inline (clique): `else if (target.dataset && target.dataset.action === 'open-work-item-detail') { vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id }); }`.
- CSS nova: `.kb-title-clickable { cursor: pointer; } .kb-title-clickable:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }`, mais as regras atualizadas de `.kb-result-item*` (seção 7) e `.kb-view-details-link`.
- `extension.ts` instancia `new WorkItemDetailPanelManager(workspaceRoot, client)` e passa `id => manager.open(id)` como o novo argumento do `KanbrainViewProvider`.

## Tratamento de erros

- `getWorkItemTypeLayout` falha silenciosamente (retorna `null`) → aciona o fallback de campos.
- `getComments` falha → tratado no manager com `.catch(() => [])`, a aba abre sem a seção de comentários preenchida (mostra "No comments." em vez de quebrar a abertura da aba inteira).
- `getWorkItemRawFields`/`getWorkItems` falham → propaga; `open()` deixa o erro subir (mesmo padrão adotado hoje pelas outras ações do `KanbrainViewProvider`, que não têm tratamento de erro visível ao usuário além do try/catch já existente em `searchWorkItems`) — like esse gap já existe hoje em `runSkill`, não é regressão introduzida por esta feature.
- Campo referenciado pelo layout mas ausente em `rawFields`: `formatFieldValue` trata como vazio (`—`), não quebra a renderização.

## Testes

- `src/azureDevOps/workItemDetail.test.ts` (novo): `resolveDetailFields` — agrupamento por `group.label`, separação de `HtmlFieldControl` em `htmlSections`, exclusão de `System.Title`/`System.Description`, fallback quando `layout` é `null` ou `pages` vazio, fallback filtrando campos ausentes em `rawFields`. `formatFieldValue` pode ficar testado junto de `renderWorkItemDetail.test.ts` já que é exportado de lá.
- `src/azureDevOps/client.test.ts`: novos casos para `getWorkItemTypeLayout` (sucesso e retorno `null` no erro), `getWorkItemRawFields`, `getComments` (mapeamento, ordenação por data, e as duas formas de resposta `comments`/`value`).
- `src/view/renderAssignee.test.ts`: 1-2 casos diretos pra `renderAvatarOrInitial`.
- `src/view/renderWorkItemDetail.test.ts` (novo): cabeçalho, grade de grupos, seções HTML, comentários com/sem avatar resolvido, todos os ramos de `formatFieldValue`.
- `src/view/renderWorkItemCard.test.ts`: título não é clicável por padrão; fica clicável com `clickableTitle: true`.
- `src/view/render.test.ts`: tela de flow passa `clickableTitle: true` pro card principal e pros subtasks.
- `src/view/renderHome.test.ts`: tela de home não marca o título como clicável.
- `src/view/renderSearchResults.test.ts`: botão "View details" presente com `data-id` correto; asserções antigas (`pick-work-item`, ícone, borda colorida) continuam válidas com a nova estrutura.
- Sem teste dedicado para `WorkItemDetailPanelManager.ts` (acoplado à API do VS Code) — verificado via `npm run compile` + suíte completa.
- **Recomendo fortemente um teste manual (F5) contra um projeto Azure DevOps real** antes de dar essa feature por pronta — as 3 chamadas novas não foram validadas contra uma resposta real da API neste ambiente.
