# Exibição de imagens embutidas na Description/comentários — Design

## Contexto e motivação

Quando um usuário cola um screenshot dentro da Description, de um campo custom em rich-text (`htmlSections`, ex. Repro Steps) ou de um comentário de um work item no Azure DevOps, a API devolve esse conteúdo como HTML bruto contendo `<img src="https://.../_apis/wit/attachments/{guid}?fileName=...">`. Esse HTML é injetado quase sem tratamento em `renderWorkItemDetail.ts`/`renderComment.ts` (só passa por `stripScriptTags`). O CSP do painel de detalhe já permite `img-src data: https:`, mas a URL do attachment do ADO exige um header `Authorization: Bearer <token>` para responder — que uma tag `<img src="...">` não consegue enviar. Resultado: a imagem nunca carrega (ícone de imagem quebrada).

O projeto já resolve exatamente esse problema de "recurso do ADO que precisa de auth pra aparecer numa `<img>`" para avatares: `AzureDevOpsClient.getAvatarDataUri(url)` busca com o Bearer token do client autenticado e devolve um data URI base64; `WorkItemDetailPanelManager.resolveAvatars` monta um mapa `{url → dataUri}` com cache (`avatarCache`); `renderAvatarOrInitial` troca o `src` original pelo data URI antes de montar o HTML. Esta spec estende o mesmo padrão para as imagens embutidas na Description, nos `htmlSections` e nos comentários do painel de detalhe.

## Escopo

**Dentro do escopo:**
- Painel de detalhe do work item (`WorkItemDetailPanelManager` / `renderWorkItemDetail.ts`): imagens embutidas na Description, em cada campo de `htmlSections`, e no texto de cada comentário (`renderComment.ts`), hospedadas no domínio da organização Azure DevOps configurada.
- Generalização de `AzureDevOpsClient.getAvatarDataUri` para uma busca autenticada genérica reutilizável tanto por avatares quanto por imagens embutidas.
- Cache por painel (mesma vida útil e mesmo padrão de `avatarCache`) para não re-buscar a mesma imagem a cada refresh/poll do painel.
- Fallback visual quando uma imagem não pode ser buscada (404/403/erro de rede): placeholder simples em vez de ícone de imagem quebrada.

**Fora do escopo:**
- Card compacto da lista (`renderWorkItemCard.ts`, usado em Flow/Home/busca) — não renderiza HTML de Description/comentários hoje e continua sem essa seção.
- Painel de Pull Request (`renderPullRequestDetail.ts`) — comentários de PR já passam por `escapeHtml` (texto puro/Markdown, não HTML rico do ADO) e não carregam `<img>` embutida hoje; fora do escopo desta spec.
- Anexos formais listados na relação `AttachedFile` do work item (aba "Attachments" separada da Description no Azure Boards) — fonte de dados distinta, não abordada aqui.
- Qualquer limite de tamanho/contagem de imagens ou lazy loading — segue o mesmo comportamento eager e sem limite que `resolveAvatars` já tem hoje.
- Mudança de CSP — `img-src data: https:` já permite `data:` URIs, nenhuma alteração necessária.

## Design

### 1. `client.ts`: generalizar a busca autenticada de imagem

Renomeia `getAvatarDataUri` para `getAuthenticatedImageDataUri` (mesma implementação, nome neutro já que passa a servir dois usos). Mantém a assinatura e o comportamento (retorna `null` em caso de erro):

```ts
async getAuthenticatedImageDataUri(url: string): Promise<string | null> {
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

Todos os call sites existentes (`resolveAvatars` em `WorkItemDetailPanelManager.ts` e `PullRequestDetailPanelManager.ts`) são atualizados para o novo nome.

### 2. Novo módulo `src/view/inlineImages.ts`

```ts
const IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export function extractImageUrls(html: string, organization: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const url = match[1];
    if (isAdoHostedUrl(url, organization)) {
      urls.add(url);
    }
  }
  return [...urls];
}

// `organization` é o nome curto da org (ex. "myorg"), o mesmo usado para montar
// `https://dev.azure.com/${organization}/...` em client.ts — não um host completo.
function isAdoHostedUrl(url: string, organization: string): boolean {
  try {
    const host = new URL(url).host;
    return host === 'dev.azure.com' || host === `${organization}.visualstudio.com`;
  } catch {
    return false;
  }
}

export function rewriteImageSrcs(html: string, images: Record<string, string | null>): string {
  return html.replace(IMG_SRC_RE, (tag, url) => {
    if (!(url in images)) {
      return tag; // não era uma URL do ADO — deixa como está (já carrega ou já falhava antes)
    }
    const dataUri = images[url];
    if (!dataUri) {
      return '<span class="kb-image-unavailable">🖼 imagem indisponível</span>';
    }
    return tag.replace(url, dataUri);
  });
}
```

`organization` é `config.organization` (o mesmo valor usado para montar as URLs da API em `client.ts`, ex. `"myorg"` em `https://dev.azure.com/myorg/...`).

### 3. `WorkItemDetailPanelManager.ts`: resolução das imagens

Novo cache privado, ao lado de `avatarCache`:

```ts
private inlineImageCache = new Map<string, string | null>();
```

Novo método privado, mesmo padrão de `resolveAvatars`:

```ts
private async resolveInlineImages(
  description: string | null,
  htmlSections: DetailField[],
  comments: WorkItemComment[],
  organization: string,
): Promise<Record<string, string | null>> {
  const htmlBlobs = [description ?? '', ...htmlSections.map(f => String(f.value ?? '')), ...comments.map(c => c.text)];
  const urls = [...new Set(htmlBlobs.flatMap(html => extractImageUrls(html, organization)))];

  const uncached = urls.filter(u => !this.inlineImageCache.has(u));
  await Promise.all(
    uncached.map(async url => {
      this.inlineImageCache.set(url, await this.client.getAuthenticatedImageDataUri(url));
    }),
  );

  const resolved: Record<string, string | null> = {};
  for (const url of urls) {
    resolved[url] = this.inlineImageCache.get(url) ?? null;
  }
  return resolved;
}
```

Em `refresh(id)`, a chamada a `resolveDetailFields(layout, rawFields)` (hoje feita uma vez, depois do `Promise.all` de avatares/PR details) sobe para *antes* desse `Promise.all`, para que `htmlSections` fique disponível para `resolveInlineImages` sem duplicar o cálculo:

```ts
const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
const description = typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null;

const [avatars, prDetails, inlineImages] = await Promise.all([
  this.resolveAvatars(workItem, comments),
  this.resolvePullRequestDetails(workItem, config),
  this.resolveInlineImages(description, htmlSections, comments, config.organization),
]);
```

O bloco que hoje recalcula `resolveDetailFields` logo antes de montar `renderWorkItemDetail` é removido (usa `groups`/`htmlSections` já computados acima). `inlineImages` entra no `stateKey` (junto de `avatars`/`prDetails`) e é passado para `renderWorkItemDetail`.

### 4. `renderWorkItemDetail.ts`

`WorkItemDetailInput` ganha `inlineImages: Record<string, string | null>`. Aplica `rewriteImageSrcs` depois de `stripScriptTags`, na Description e em cada `htmlSection`:

```ts
const descriptionHtml = description
  ? `<div class="kb-detail-html-section"><div class="kb-detail-section-label">Description</div><div class="kb-detail-html-body">${rewriteImageSrcs(stripScriptTags(description), inlineImages)}</div></div>`
  : '';
```

`renderHtmlSection` passa a receber `inlineImages` como segundo parâmetro e aplica o mesmo `rewriteImageSrcs`.

`commentsHtml` passa `inlineImages` para `renderComment`.

### 5. `renderComment.ts`

`renderComment(comment, avatars, inlineImages)` aplica `rewriteImageSrcs(stripScriptTags(comment.text), inlineImages)` no corpo do comentário.

### 6. CSS (`WorkItemDetailPanelManager.ts`, bloco de estilos do webview)

```css
.kb-image-unavailable {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 4px;
  font-size: 12px;
  opacity: 0.7;
}
.kb-detail-html-body img,
.kb-comment-body img {
  max-width: 100%;
  border-radius: 4px;
}
```

## Tratamento de erros

- `getAuthenticatedImageDataUri` já engole exceções e retorna `null` (mesmo comportamento herdado de `getAvatarDataUri`) — falha de rede/403/404 não derruba o refresh do painel.
- `rewriteImageSrcs` trata `null` como "buscado mas indisponível" → placeholder `.kb-image-unavailable`; URLs que nunca foram extraídas (não são do host do ADO) ficam com o `<img>` original intacto, sem regressão em relação ao comportamento atual.
- Sem novo modo de falha para o refresh do painel como um todo: `resolveInlineImages`, assim como `resolveAvatars`, nunca lança.

## Testes

- `inlineImages.test.ts` (novo): `extractImageUrls` — extrai só URLs do host do ADO, ignora `<img>` de outros domínios, dedup; `rewriteImageSrcs` — substitui `src` quando há data URI, gera placeholder quando o valor é `null`, mantém a tag original quando a URL não está no mapa.
- `renderWorkItemDetail.test.ts`: `inlineImages` no `WorkItemDetailInput`; Description com imagem do ADO resolvida vira `<img src="data:...">`; imagem sem resolução vira placeholder; imagem de host externo permanece com a URL original.
- `renderComment.test.ts` (ou cobertura equivalente onde `renderComment` já é testado): mesmo conjunto de casos aplicado ao corpo do comentário.
- `client.test.ts`: renomeia os testes existentes de `getAvatarDataUri` para `getAuthenticatedImageDataUri` (mesmo comportamento, só o nome muda).
- Sem teste dedicado para `resolveInlineImages` em `WorkItemDetailPanelManager` (mesmo precedente de `resolveAvatars`) — verificado via `npm run compile` + suíte completa + validação manual (F5), colando um screenshot num work item de teste.
