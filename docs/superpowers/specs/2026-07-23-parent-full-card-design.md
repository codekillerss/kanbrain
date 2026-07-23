# Parent como card completo, remoção do sibling navigator — Design

## Contexto e motivação

Desde a introdução do botão de pick nos children cards e no parent banner (`docs/superpowers/specs/2026-07-23-pick-work-item-button-design.md`), navegar entre irmãos ficou possível de outro jeito: clicar no ⇄ do parent banner troca o current work item para o parent, e a seção "Children" passa a listar os mesmos irmãos que o `renderSiblingNavigator` mostrava como bolinhas — só que com cards completos em vez de bolinhas. O `renderSiblingNavigator` (setas + bolinhas) fica redundante.

Com o carrossel saindo, sobra espaço pra fazer o parent banner exibir mais informação — hoje ele só mostra ícone + `#id: título`. O usuário quer que o parent passe a ser exibido com o mesmo nível de detalhe que os children cards e o card atual: status, assignee, badge de development etc., respeitando `cardSettingsByTeam` (o mesmo toggle que já rege o que aparece nos outros cards, por team + work item type).

## Escopo

**Dentro do escopo:**
- `render.ts`: a seção "Parent" passa a renderizar `renderWorkItemCard(state.parent, state.config, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true)` — mesmos argumentos usados pros children cards (classe visual idêntica, título clicável pra abrir detalhe, botão de skill quando configurado, botão de pick), trocando `state.workItem`/`state.subtasks` map por `state.parent`. `showParent`/`parent` desse card ficam `false`/`null` — não temos dado do avô (mesma limitação que já existe hoje pros children cards, que também não mostram o parent deles).
- Remoção completa de `renderSiblingNavigator` e `renderArrow` (`renderParentContext.ts`), do `MAX_VISIBLE_DOTS`, dos testes correspondentes em `renderParentContext.test.ts`, e do CSS `.kb-sibling-nav`/`.kb-sibling-arrow`/`.kb-sibling-dots`/`.kb-sibling-dot`/`.kb-sibling-dot-active` (`KanbrainViewProvider.ts`).
- Remoção de `renderParentBanner` (função inteira) — substituída pela chamada a `renderWorkItemCard` descrita acima. `renderParentContext.ts` deixa de existir (nenhuma função sobra nele); `render.ts` importa `renderWorkItemCard` (já importado) em vez de `renderParentBanner`/`renderSiblingNavigator`.
- CSS: remoção de `.kb-parent-banner`, `.kb-parent-banner:hover`, `.kb-parent-banner .kb-link-text`, `.kb-section-card .kb-parent-banner` (regras específicas do banner antigo). A caixa externa continua sendo `.kb-section-card.kb-parent-section` com `.kb-section-label` "Parent" — isso não muda; só o conteúdo interno passa a ser um `.kb-subtask-card` em vez do banner.

**Fora do escopo:**
- `resolveShowParent`/`resolveShowAssignedTo`/`cardSettingsByTeam` em si — reaproveitados como já existem, sem mudança de lógica. O card do parent usa `resolveShowAssignedTo(config, parent.type, selectedTeam)` internamente (já é o que `renderWorkItemCard` faz para qualquer item, usando `workItem.type` — aqui `workItem` é o `parent`).
- Children cards e o card do work item atual — nenhuma mudança de comportamento ou aparência.
- Exibir o avô (parent do parent) — sem dado disponível hoje; fica pra uma spec futura se houver necessidade.

## Design

### `render.ts`

Troca:

```ts
const parentSectionHtml = state.parent
  ? `
    <div class="kb-section-card kb-parent-section">
      <div class="kb-section-label">Parent</div>
      ${renderParentBanner(state.parent, state.config)}
      ${renderSiblingNavigator(state.workItem, state.parent)}
    </div>
  `
  : '';
```

por:

```ts
const parentSectionHtml = state.parent
  ? `
    <div class="kb-section-card kb-parent-section">
      <div class="kb-section-label">Parent</div>
      ${renderWorkItemCard(state.parent, state.config, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true)}
    </div>
  `
  : '';
```

Remove o import `{ renderParentBanner, renderSiblingNavigator } from './renderParentContext'`.

### `renderParentContext.ts` e `renderParentContext.test.ts`

Ambos os arquivos são deletados por completo — toda a lógica que sobrava (`renderParentBanner`, `renderSiblingNavigator`, `renderArrow`, `MAX_VISIBLE_DOTS`) deixa de ter uso.

### CSS (`KanbrainViewProvider.ts`)

Remove as regras:
```css
.kb-parent-banner { ... }
.kb-parent-banner:hover { ... }
.kb-parent-banner .kb-link-text { ... }
.kb-section-card .kb-parent-banner { ... }
.kb-sibling-nav { ... }
.kb-sibling-arrow { ... }
.kb-sibling-arrow:disabled { ... }
.kb-sibling-dots { ... }
.kb-sibling-dot { ... }
.kb-sibling-dot-active { ... }
```

`.kb-section-card .kb-sibling-nav { margin: 0 0 4px; }` (adicionada na spec do wrapper único) também sai. `.kb-section-card .kb-subtask-card { margin: 8px 10px; }` já existe e passa a valer também pro card do parent, sem precisar de regra nova.

## Tratamento de erros

Nenhum caso novo: `state.parent === null` continua fazendo `parentSectionHtml` ser `''` (guard já existente em `render.ts`, inalterado).

## Testes

- `render.test.ts`: os testes que hoje checam `kb-parent-banner`/`kb-sibling-nav` são atualizados — a seção "Parent" passa a ser verificada checando que o card do parent (`kb-subtask-card` dentro de `kb-parent-section`) aparece com `#id`, título, `data-action="pick-work-item"` com o id do parent, quando há parent; e que nada da seção aparece quando `state.parent` é `null`.
- `renderParentContext.test.ts`: arquivo removido (a funcionalidade que ele testava não existe mais como funções separadas).
- Nenhuma mudança esperada em `renderWorkItemCard.test.ts` (a função em si não muda, só ganha mais um call site).
