# Polling/auto-refresh no painel de detalhes — Design (1/3)

## Contexto e motivação

Primeira de três specs independentes pra tornar o painel de detalhes do work item (`WorkItemDetailPanelManager`) interativo sem habilitar `enableScripts` (as outras duas: clique nos itens de Related Work, e checkout de branch a partir do Development — cada uma com sua própria spec/implementação). Hoje o painel é renderizado uma vez, na abertura, e nunca mais atualiza — se o work item mudar de status/assignee/comentário em outro lugar (Azure DevOps web, outro dev, a própria tela Flow do Kanbrain), o painel aberto fica desatualizado indefinidamente.

O sidebar (`KanbrainViewProvider.ts`) já resolve exatamente esse problema pra si mesmo: um `setInterval` de 5s que reconsulta a API e só substitui `webview.html` quando o estado serializado (`JSON.stringify`) mudou de fato — evitando re-render/flicker desnecessário. Vamos replicar esse padrão pro painel de detalhes.

## Escopo

**Dentro do escopo:**
- `WorkItemDetailPanelManager` ganha um único `setInterval` compartilhado (não um por painel) — roda a cada 5s (mesmo `POLL_INTERVAL_MS` do sidebar, redeclarado localmente neste arquivo) e reconsulta **todos** os painéis abertos (`this.panels`) em paralelo.
- Refatora a lógica de `open()` (fetch + montagem do HTML) numa função privada compartilhada `loadAndRender(id, panel)`, reaproveitada tanto na abertura inicial quanto em cada tick de poll — evita duplicar a sequência de fetches.
- `layout` (`getWorkItemTypeLayout`, metadado do tipo do work item — nome dos campos, form, etc., praticamente estático) é buscado só uma vez, na primeira abertura de cada painel, e cacheado num novo `Map<number, WorkItemTypeLayout | null>` por id — não é re-buscado nos ticks de poll seguintes. Todo o resto (`workItem`, `rawFields`, `comments`, `parent`, `children`, `avatars`, `prDetails`) é revalidado a cada tick, já que qualquer um pode mudar a qualquer momento.
- Comparação de estado por painel: novo `Map<number, string>` (`lastStateByPanel`), com `JSON.stringify({ workItem, rawFields, comments, parent, children, avatars, prDetails })` — só substitui `panel.webview.html` quando essa string mudou em relação ao valor salvo pra aquele id. Isso cobre tanto a abertura inicial (mapa vazio, sempre renderiza) quanto os polls seguintes.
- O intervalo começa (`setInterval`) quando o primeiro painel é aberto (dentro de `open()`, só se `this.pollHandle` ainda for `undefined`) e para (`clearInterval`) quando o último painel fecha (dentro do `onDidDispose` de cada painel, checando `this.panels.size === 0` depois do `delete`).
- `onDidDispose` de cada painel também limpa a entrada correspondente em `lastStateByPanel` e no cache de `layout` (evita vazamento de memória pra painéis fechados).
- Falha de rede/auth transitória num tick de poll (qualquer exceção durante o fetch): pula esse painel silenciosamente nesse tick, sem popup de erro — tenta de novo no próximo tick. Sem tela de "disconnected" nesse painel (diferente do sidebar); se a sessão realmente expirou, o usuário vai notar pelo sidebar, reconectar, e o próximo poll bem-sucedido aqui volta a atualizar normalmente.

**Fora do escopo:**
- Qualquer indicação visual de "atualizando..."/"desatualizado" no painel — poll é silencioso, sem feedback de progresso (consistente com a decisão de não habilitar JS nesse painel).
- Tratamento especial pra work item deletado/inacessível durante o poll (ex: 404) — cai no mesmo caminho de "pula esse tick", sem UI dedicada.
- Preservar posição de scroll quando o conteúdo de fato muda — limitação aceita da abordagem sem JS (reatribuir `webview.html` sempre volta o scroll ao topo); só evitamos isso quando nada mudou.
- As outras duas specs (clique no Related Work, checkout de branch) — ficam pras próprias specs, depois desta.

## Design

### `WorkItemDetailPanelManager.ts`

```ts
const POLL_INTERVAL_MS = 5000;

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();
  private layoutCache = new Map<number, WorkItemTypeLayout | null>();
  private lastStateByPanel = new Map<number, string>();
  private pollHandle: ReturnType<typeof setInterval> | undefined;

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

    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${id}`, vscode.ViewColumn.Active, {
      enableScripts: false,
    });
    this.panels.set(id, panel);

    panel.onDidDispose(() => {
      this.panels.delete(id);
      this.lastStateByPanel.delete(id);
      this.layoutCache.delete(id);
      if (this.panels.size === 0 && this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = undefined;
      }
    });

    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => void this.pollAll(), POLL_INTERVAL_MS);
    }

    await this.loadAndRender(id, panel);
  }

  private async pollAll(): Promise<void> {
    await Promise.all([...this.panels.entries()].map(([id, panel]) => this.loadAndRender(id, panel)));
  }

  private async loadAndRender(id: number, panel: vscode.WebviewPanel): Promise<void> {
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    let workItem: WorkItem | undefined;
    try {
      [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    } catch {
      return; // transient failure — skip this refresh, retry next poll
    }
    if (!workItem) {
      return;
    }

    let layout = this.layoutCache.get(id);
    if (layout === undefined) {
      try {
        layout = await this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type);
      } catch {
        layout = null;
      }
      this.layoutCache.set(id, layout);
    }

    let rawFields: Record<string, unknown>;
    let comments: WorkItemComment[];
    let parentResult: WorkItem[];
    let children: WorkItem[];
    try {
      [rawFields, comments, parentResult, children] = await Promise.all([
        this.client.getWorkItemRawFields(config.organization, config.project, id),
        this.client.getComments(config.organization, config.project, id).catch(() => []),
        workItem.parentId ? this.client.getWorkItems(config.organization, config.project, [workItem.parentId]) : Promise.resolve([]),
        this.client.getChildren(config.organization, config.project, workItem),
      ]);
    } catch {
      return; // transient failure — skip this refresh, retry next poll
    }
    const parent = parentResult[0] ?? null;

    const [avatars, prDetails] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
    ]);

    const stateKey = JSON.stringify({ workItem, rawFields, comments, parent, children, avatars, prDetails });
    if (this.lastStateByPanel.get(id) === stateKey) {
      return;
    }
    this.lastStateByPanel.set(id, stateKey);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    panel.title = `#${workItem.id} ${workItem.title}`;
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description: typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null,
        groups,
        htmlSections,
        comments,
        avatars,
        prDetails,
        parent,
        children,
      }),
    );
  }
}
```

Observação: `panel.title` passa a ser atualizado a cada render (hoje só é setado uma vez, na criação) — assim o título da aba do VS Code reflete um título editado no Azure DevOps depois da abertura.

## Tratamento de erros

- Config ausente (`readConfig` retorna `null`): `loadAndRender` retorna sem fazer nada — mesmo comportamento de hoje no `open()`.
- Falha ao buscar `workItem`, `rawFields`, `comments`, `parent` ou `children`: qualquer exceção nesse bloco faz `loadAndRender` retornar cedo, sem alterar `panel.webview.html` — o painel mantém o último conteúdo bem-sucedido, tenta de novo no próximo tick.
- `workItem` vindo `undefined` (id não encontrado/deletado): retorna sem renderizar, mesmo tratamento de erro de fetch.
- `layout` falhando ao buscar: cacheia `null` (mesmo comportamento de "sem layout" que já existe hoje via `resolveDetailFields(null, rawFields)`, que cai no fallback de campos), sem tentar de novo nos polls seguintes (evita re-tentar uma falha permanente indefinidamente — se o layout realmente importa e falhou, um "fechar e reabrir o painel" força nova tentativa).
- `getComments` já tem seu próprio `.catch(() => [])` hoje (não crítico) — mantido.

## Testes

`WorkItemDetailPanelManager.ts` não tem testes automatizados hoje (é infraestrutura de comando VS Code, sem suíte de teste — mesmo padrão de `setup.ts`/`syncBoardConfig.ts`, verificado via `npm run compile` + F5). Sem teste novo automatizado; verificação manual: abrir um painel, editar o work item em outro lugar (ex: mudar status no Azure DevOps web), confirmar que o painel reflete a mudança dentro de ~5s sem popup de erro; abrir dois painéis de itens diferentes, confirmar que ambos atualizam; fechar todos os painéis, confirmar (via breakpoint/log manual, se necessário) que o interval para.
