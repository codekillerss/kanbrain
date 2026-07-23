# Botões Switch/Clear no header da seção Flow (Home) — Design

## Contexto e motivação

A tela Flow já migrou os botões de trocar (⇄) e limpar (✕) do overlay sobre o card (`kb-card-actions`, posicionamento absoluto) pro header da section-card, ao lado do título "Current Work Item" (`2026-07-23-current-work-item-section-header-design.md`). A tela Home ainda usa o padrão antigo na sua seção "Flow" — os mesmos botões sobrepostos ao canto do card. O usuário quer o mesmo padrão de header aplicado lá.

De brinde, a Home tem hoje o mesmo bug de margin dobrada que identificamos e corrigimos no Current Work Item (`2026-07-23-current-work-item-card-border-design.md`'s follow-up de fix): o `.kb-card-wrapper` que envolve o card na Home está dentro de uma `.kb-section-card` ("Flow"), então a regra `.kb-section-card .kb-card-wrapper { margin: 10px; }` soma com a margin própria do `.kb-main-card` (`margin: 8px 10px`), dobrando o espaçamento lateral ali também. Remover o wrapper (que perde a razão de existir quando os botões saem do overlay) corrige os dois problemas de uma vez.

## Escopo

**Dentro do escopo:**
- `renderHome.ts`:
  - Novo helper `renderHomeFlowActions(state)`: retorna `''` quando `!state.workItem`; caso contrário retorna `<div class="kb-section-actions"><button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button><button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button></div>` — mesmo HTML que hoje fica em `kb-card-actions`, só que sem o wrapper posicionado.
  - `renderHome()`: o label da seção "Flow" passa de `<div class="kb-section-label">Flow</div>` para `<div class="kb-section-label"><span>Flow</span>${renderHomeFlowActions(state)}</div>` — mesmo padrão (`<span>` + ações) já usado no header "Current Work Item" do Flow.
  - `renderHomeWorkItemSection()`: quando há `state.workItem`, remove o `<div class="kb-card-wrapper">`/`<div class="kb-card-actions">` — o card é renderizado direto, sem wrapper: `${renderWorkItemCard(...)}` seguido do `<div class="kb-home-commands">` com o botão "Open Flow", igual já é feito nas seções Parent/Children/Current Work Item da tela Flow.
  - Caso sem work item ativo (`!state.workItem`): nenhuma mudança — continua mostrando só o botão "🔍 Select Work Item" (`kb-secondary-btn`, id `kb-toggle-search-btn`) dentro de `kb-home-commands`, sem nada no header da seção "Flow" (`renderHomeFlowActions` retorna `''` nesse caso).
- CSS (`KanbrainViewProvider.ts`): remove `.kb-card-actions { ... }` (não usado em lugar nenhum depois dessa mudança) e `.kb-card-wrapper { position: relative; }` (idem). Remove a menção a `.kb-card-wrapper` da regra combinada `.kb-section-card .kb-home-commands, .kb-section-card .kb-card-wrapper, .kb-section-card .kb-checkbox-row, .kb-section-card .kb-empty { margin: 10px; }` (fica só `.kb-home-commands, .kb-checkbox-row, .kb-empty`).

**Fora do escopo:**
- Border/cor da seção "Flow" na Home — fica com a border neutra padrão, sem o fade que o Current Work Item ganhou na tela Flow (não foi pedido).
- Qualquer outra seção da Home (Team, Commands, Configuration) — sem mudança.

## Design

### `renderHome.ts`

```ts
function renderHomeFlowActions(state: RenderState): string {
  if (!state.workItem) {
    return '';
  }
  return `
    <div class="kb-section-actions">
      <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
      <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
    </div>
  `;
}

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;
  const avatars = state.avatars ?? {};
  const searchDialog = `...`; // inalterado

  if (!state.workItem) {
    return `
      <div class="kb-home-commands">
        <button id="kb-toggle-search-btn" class="kb-secondary-btn">🔍 Select Work Item</button>
      </div>
      ${searchDialog}
    `;
  }

  return `
    ${searchDialog}
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedTeam)}
    <div class="kb-home-commands">
      <button id="kb-open-flow-btn" class="kb-secondary-btn">➡️ Open Flow</button>
    </div>
  `;
}

export function renderHome(state: RenderState): string {
  return `
    <div class="kb-section-card">
      <div class="kb-section-label">
        <span>Flow</span>
        ${renderHomeFlowActions(state)}
      </div>
      ${renderHomeWorkItemSection(state)}
    </div>
    ...
  `;
}
```

### CSS (`KanbrainViewProvider.ts`)

Remove:
```css
.kb-card-wrapper { position: relative; }
.kb-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 2px; }
```

Troca:
```css
.kb-section-card .kb-home-commands, .kb-section-card .kb-card-wrapper, .kb-section-card .kb-checkbox-row, .kb-section-card .kb-empty { margin: 10px; }
```
por:
```css
.kb-section-card .kb-home-commands, .kb-section-card .kb-checkbox-row, .kb-section-card .kb-empty { margin: 10px; }
```

## Tratamento de erros

Nenhum caso novo — `renderHomeFlowActions` segue o mesmo guard (`!state.workItem`) que já existe em `renderHomeWorkItemSection` pro mesmo estado.

## Testes

- `renderHome.test.ts`: testes existentes que checam `kb-card-actions`/posição dos botões são atualizados pra verificar que `kb-toggle-search-btn`/`kb-clear-btn` aparecem dentro do `kb-section-label` da seção "Flow" quando há work item, e que nem o header nem `kb-home-commands` mostram esses ids quando não há (só o botão "Select Work Item"). Adicionar checagem de que `kb-card-actions`/`kb-card-wrapper` não aparecem mais em nenhum caso.
