# Seção "Related Work" (parentesco) no painel de detalhes — Design

## Contexto e motivação

O painel de detalhes do work item (`WorkItemDetailPanelManager`, um `WebviewPanel` nativo do VS Code, separado da sidebar) hoje mostra descrição, campos em grupos, development links e comentários, mas nada sobre o parentesco do item (pai/filhos). O Azure DevOps nativo tem uma seção "Related Work" no painel de detalhes que lista o Parent e os Children como itens clicáveis com ícone, id, título e status (ver imagem de referência anexada pelo usuário). O usuário quer uma seção equivalente, porém mais sucinta — só ícone, id e título, sem a linha de "Updated / status" da referência — e sem navegação por clique nesta primeira versão (o painel roda com `enableScripts: false`, então clique exigiria uma mudança maior de infraestrutura, fora de escopo agora).

## Escopo

**Dentro do escopo:**
- Novo arquivo `src/view/renderRelatedWork.ts`, com uma função `renderRelatedWorkSection(parent: WorkItem | null, children: WorkItem[], config: KanbrainConfig): string`:
  - Retorna `''` quando `parent` é `null` e `children` está vazio (sem seção nenhuma nesse caso).
  - Caso contrário, retorna uma caixa reaproveitando o estilo `.kb-detail-group` (mesma border/padding que os grupos de campos já usam), com label "Related Work" (reaproveitando `.kb-detail-group-label`).
  - Dentro da caixa: sub-label "Parent" seguido do item, só se `parent` não for `null`; sub-label "Child" seguido da lista de itens, só se `children.length > 0`. Cada item: ícone do tipo (via `renderTypeAccent`, mesmo helper já usado em cards) + `#id` + título (escapado), sem link, sem status, sem data.
- `WorkItemDetailPanelManager.open()`: busca `parent` (`workItem.parentId ? await client.getWorkItems(org, project, [workItem.parentId]) : []`, pegando o primeiro elemento ou `null`) e `children` (`await client.getChildren(org, project, workItem)`) em paralelo com as buscas que já existem (`layout`, `rawFields`, `comments`) — mesmo padrão de fetch já usado em `KanbrainViewProvider.refresh()` pra tela Flow. Passa `parent`/`children` pro novo campo de `WorkItemDetailInput`.
- `renderWorkItemDetail.ts`: `WorkItemDetailInput` ganha `parent: WorkItem | null` e `children: WorkItem[]`. A seção é renderizada na coluna lateral (`kb-detail-side`), entre os grupos de campos (`groups.map(renderDetailGroup)`) e a seção Development (`renderDevelopmentSection`).
- CSS (`WorkItemDetailPanelManager.css()`): novas regras `.kb-related-subgroup-label` (label pequeno tipo "Parent"/"Child", estilo parecido com `.kb-detail-group-label` mas sem uppercase forçado — só um pouco menor/mais discreto que o label principal) e `.kb-related-item` (flex row: ícone + id + título, com `text-overflow: ellipsis` pra títulos longos).

**Fora do escopo:**
- Navegação por clique nos itens (abrir o work item relacionado a partir daqui) — fica pra uma spec futura, se fizer falta. Vai exigir decidir entre habilitar `enableScripts` nesse painel ou usar `command:` URIs.
- Status, data de atualização, ou qualquer outro campo além de ícone/id/título nos itens relacionados.
- Mudança na tela Flow ou na sidebar — essa seção é exclusiva do painel de detalhes nativo.
- "Avô" (parent do parent) ou "netos" (filhos dos filhos) — só um nível, igual à tela Flow.

## Design

### `renderRelatedWork.ts`

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

function renderRelatedItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  return `
    <div class="kb-related-item">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </div>
  `;
}

export function renderRelatedWorkSection(parent: WorkItem | null, children: WorkItem[], config: KanbrainConfig): string {
  if (!parent && children.length === 0) {
    return '';
  }
  const parentHtml = parent
    ? `<div class="kb-related-subgroup-label">Parent</div>${renderRelatedItem(parent, config)}`
    : '';
  const childrenHtml = children.length
    ? `<div class="kb-related-subgroup-label">Child</div>${children.map(c => renderRelatedItem(c, config)).join('')}`
    : '';
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label">Related Work</div>
      ${parentHtml}
      ${childrenHtml}
    </div>
  `;
}
```

### `WorkItemDetailPanelManager.open()`

```ts
const [layout, rawFields, comments, parentResult, children] = await Promise.all([
  this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type),
  this.client.getWorkItemRawFields(config.organization, config.project, id),
  this.client.getComments(config.organization, config.project, id).catch(() => []),
  workItem.parentId ? this.client.getWorkItems(config.organization, config.project, [workItem.parentId]) : Promise.resolve([]),
  this.client.getChildren(config.organization, config.project, workItem),
]);
const parent = parentResult[0] ?? null;
```

`parent`/`children` entram no objeto passado pra `renderWorkItemDetail`.

### `renderWorkItemDetail.ts`

```ts
export interface WorkItemDetailInput {
  // ...campos existentes
  parent: WorkItem | null;
  children: WorkItem[];
}

// dentro de renderWorkItemDetail:
<div class="kb-detail-side">
  ${groups.map(renderDetailGroup)}
  ${renderRelatedWorkSection(parent, children, config)}
  ${renderDevelopmentSection(workItem.development, prDetails)}
</div>
```

### CSS (`WorkItemDetailPanelManager.css()`)

```css
.kb-related-subgroup-label { font-size: 11px; font-weight: 600; opacity: 0.7; margin: 8px 0 4px; }
.kb-related-subgroup-label:first-child { margin-top: 0; }
.kb-related-item { display: flex; align-items: center; gap: 4px; font-size: 13px; margin-bottom: 4px; }
.kb-related-id { font-weight: 600; flex-shrink: 0; }
```

## Tratamento de erros

- `workItem.parentId` nulo: não busca parent, `parent` fica `null`, sub-label "Parent" não aparece.
- `workItem.childIds` vazio: `getChildren` já retorna `[]` nesse caso (early return existente em `client.getWorkItems`), sub-label "Child" não aparece.
- Sem parent e sem children: a seção inteira não é renderizada (`renderRelatedWorkSection` retorna `''`).
- Falha ao buscar parent/children (erro de rede): não há tratamento especial nesta spec — mesmo comportamento (sem catch) que `layout`/`rawFields` já têm hoje nesse método; só `comments` tem `.catch(() => [])`. Fora de escopo mudar isso agora.

## Testes

- `renderRelatedWork.test.ts` (novo): `''` quando `parent` é `null` e `children` é `[]`; mostra só "Parent" quando só há parent; mostra só "Child" quando só há children; mostra ambos quando há os dois; título escapado; ícone do tipo presente; `#id` presente.
- `renderWorkItemDetail.test.ts`: seção "Related Work" aparece na coluna lateral quando `parent`/`children` são passados; ausente quando ambos vazios/null.
