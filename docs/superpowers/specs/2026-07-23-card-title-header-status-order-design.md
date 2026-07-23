# Título ao lado do id + status antes de assignedTo — Design

## Contexto e motivação

`renderWorkItemCard.ts` monta todos os cards (current work item, parent, children) da tela Flow e da Home. Hoje o título fica numa linha própria, abaixo do header (ícone + `#id`), e a ordem das linhas é: header, título, parent, assignee, status, development, ação. O usuário quer o título na mesma linha do `#id` (economiza altura, deixa o card mais compacto) e a ordem trocada entre status e assignee (status primeiro).

## Escopo

**Dentro do escopo:**
- `renderWorkItemCard.ts`: `.kb-title` passa a ser renderizado dentro do `.kb-card-header`, depois do `<span class="kb-id">`, em vez de numa `<div>` própria abaixo. Ordem final dos elementos do card:
  1. `.kb-card-header` (ícone + `#id` + título)
  2. `parentHtml` (linha "Parent: #id", se `showParent`)
  3. `.kb-status-row` (era depois do assignee, agora vem antes)
  4. `assigneeHtml` (era antes do status, agora vem depois)
  5. `developmentHtml`
  6. botão de skill (`showActionButton`)
- CSS (`KanbrainViewProvider.ts`):
  - `.kb-title` perde o `margin: 4px 0` (não faz mais sentido numa linha flex) e ganha `flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` — títulos que não cabem truncam com reticências em vez de quebrar linha ou espremer o `#id`.
  - `.kb-card-header` ganha `padding-right: 26px;` — reserva espaço pro botão `.kb-pick-btn` (24px + 4px de `top/right`) nos cards que o têm, pra ele nunca ficar sobreposto ao final do título. Cards sem o botão (o card do work item atual) só ficam com uma folga extra à direita, sem efeito colateral visível.

**Fora do escopo:**
- Qualquer mudança na lógica de quais campos aparecem (`resolveShowAssignedTo`, `resolveShowParent`, `showActionButton`, `showPickButton`) — só a ordem/posição visual muda, não a visibilidade condicional já existente.
- `renderParentRow`, `renderAssigneeRow`, `renderStatusDot`, `renderDevelopmentBadge` — funções inalteradas, só a ordem de chamada no template muda.

## Design

### `renderWorkItemCard.ts`

```ts
const titleAttrs = clickableTitle
  ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
  : ' class="kb-title"';

return `
  <div class="${cssClass}"${borderStyle}>
    ${showPickButton ? renderPickButton(workItem.id) : ''}
    <div class="kb-card-header">
      ${iconHtml}
      <span class="kb-id">#${workItem.id}</span>
      <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
    </div>
    ${parentHtml}
    <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
    ${assigneeHtml}
    ${developmentHtml}
    ${showActionButton ? renderActionButton(workItem, config) : ''}
  </div>
`;
```

### CSS (`KanbrainViewProvider.ts`)

```css
.kb-card-header { display: flex; align-items: center; padding-right: 26px; }
.kb-title { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

## Tratamento de erros

Nenhum caso novo — reordenação/reposicionamento puro de markup e CSS existentes.

## Testes

- `renderWorkItemCard.test.ts`: os testes que já checam presença de `kb-title`/`kb-status-row`/`kb-assignee-row` continuam válidos por conteúdo; adicionar checagem de que o título aparece dentro do `kb-card-header` (mesma linha do `#id`), e que `kb-status-row` aparece antes de `kb-assignee-row` no HTML gerado (comparando índices).
