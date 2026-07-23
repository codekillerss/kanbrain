# Cores de border distintas para as section-cards do Flow — Design

## Contexto e motivação

Follow-up da `2026-07-23-current-work-item-card-border-design.md`. As três section-cards da tela Flow (Current Work Item, Parent, Children) hoje têm a mesma border neutra (`--vscode-panel-border`). O usuário quer cores distintas por seção, com a do Current Work Item mais chamativa, pra reforçar visualmente "este é o card principal".

## Escopo

**Dentro do escopo:**
- `render.ts`: cada uma das três `.kb-section-card` ganha uma classe modificadora — `kb-section-card-current` (Current Work Item), `kb-section-card-parent` (reaproveita a já existente `kb-parent-section`), e `kb-section-card-children` (Children).
- CSS (`KanbrainViewProvider.ts`):
  - `.kb-section-card-current { border-color: var(--vscode-focusBorder); border-width: 2px; }` — mesma cor de destaque que o VS Code já usa pra indicar foco/seleção ativa (usada hoje no `#kb-search-input:focus` e na aba de busca ativa), com border mais grossa pra reforçar a hierarquia visual.
  - `.kb-parent-section { border-color: var(--vscode-textLink-foreground); }` — mesma cor já usada nos links de parent (`kb-parent-link`, título clicável), reaproveitando uma associação de cor que já existe no resto da UI.
  - `.kb-section-card-children { }` — sem regra nova: mantém `--vscode-panel-border` (a cor neutra padrão da `.kb-section-card` base), servindo como o terceiro tom (neutro) por contraste com os outros dois.
- Todas as cores vêm de variáveis de tema do VS Code — funcionam em qualquer tema claro/escuro/alto-contraste, sem cor fixa hardcoded.

**Fora do escopo:**
- Cor de fundo, sombra ou outros efeitos além da border — só border-color/width.
- Qualquer outra tela (Home, Config) — só a tela Flow tem essas três section-cards.

## Design

### `render.ts`

```html
<div class="kb-section-card kb-parent-section">...</div>   <!-- já existe -->
<div class="kb-section-card kb-section-card-current">...</div>
...
<div class="kb-section-card kb-section-card-children">...</div>
```

### CSS (`KanbrainViewProvider.ts`)

```css
.kb-section-card-current { border-color: var(--vscode-focusBorder); border-width: 2px; }
.kb-parent-section { border-color: var(--vscode-textLink-foreground); }
```

## Testes

Nenhum teste automatizado cobre CSS neste projeto; `render.test.ts` pode ganhar uma checagem simples de que as três classes modificadoras aparecem nas seções corretas. Verificação visual manual no VS Code (tema claro e escuro).
