# Wrapper único para o parent banner + sibling navigator — Design

## Contexto e motivação

Follow-up de `docs/superpowers/specs/2026-07-23-parent-banner-and-sibling-navigator-design.md`. Hoje `renderParentBanner` e `renderSiblingNavigator` produzem dois blocos empilhados e visualmente independentes: a faixa do parent tem sua própria `border`/`border-radius`, e o carrossel de irmãos não tem nenhuma. O usuário quer que os dois fiquem visualmente unidos numa única caixa, no mesmo estilo da `.kb-section-card` que já envolve a seção "Children" mais abaixo na tela Flow — com um header "Parent" equivalente ao "Children (n)".

## Escopo

**Dentro do escopo:**
- `render.ts`: quando `state.parent` existir, envolver `renderParentBanner` + `renderSiblingNavigator` num novo bloco `<div class="kb-section-card kb-parent-section">` com `<div class="kb-section-label">Parent</div>` no topo. Quando não houver parent, nada é renderizado (mesmo comportamento de hoje).
- CSS (`KanbrainViewProvider.ts`): remover `border`, `border-radius` e `margin-bottom` próprios de `.kb-parent-banner` (a caixa externa passa a prover isso). Ajustar margins internas de `.kb-parent-banner` e `.kb-sibling-nav` dentro de `.kb-section-card` para o espaçamento ficar equivalente ao padrão já usado pelos outros conteúdos de `.kb-section-card` (`kb-home-commands`, `kb-card-wrapper`, etc. — margin 10px).

**Fora do escopo:**
- Qualquer mudança de comportamento: `data-action="open-work-item-detail"` no banner e `data-action="pick-work-item"` nas setas continuam idênticos.
- `renderParentBanner`/`renderSiblingNavigator` (assinatura e lógica) não mudam — só onde/como o HTML resultante é envolvido em `render.ts`.
- Seção "Children" não muda.

## Design

### `render.ts`

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

Substitui as duas interpolações separadas (`${parentBannerHtml}` / `${siblingNavHtml}`) no template principal por `${parentSectionHtml}`.

### CSS

```css
.kb-parent-banner { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.kb-parent-banner:hover { background: var(--vscode-list-hoverBackground); }
.kb-parent-banner .kb-link-text { color: var(--vscode-textLink-foreground); }
.kb-sibling-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0; }
.kb-section-card .kb-parent-banner { margin: 8px 10px 0; }
.kb-section-card .kb-sibling-nav { margin: 0 0 4px; }
```

(`border`, `border-radius: 4px 4px 0 0` e `margin-bottom` saem da regra base de `.kb-parent-banner`; `margin-bottom` sai de `.kb-sibling-nav`.)

## Tratamento de erros

Nenhum caso novo: `state.parent === null` já é o guard existente que faz `renderParentBanner`/`renderSiblingNavigator` retornarem `''`; o novo wrapper só é montado quando `state.parent` existe, então nunca aparece uma caixa "Parent" vazia.

## Testes

- `render.test.ts`: os testes existentes que checam presença/ausência de `kb-parent-banner`/`kb-sibling-nav` continuam válidos; adicionar checagem de que `kb-section-card`/`kb-parent-section`/label "Parent" aparecem junto quando há parent, e que nada disso aparece quando `state.parent` é `null`.
