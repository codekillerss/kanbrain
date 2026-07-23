# Fade na borda do Current Work Item, revert da cor do Parent — Design

## Contexto e motivação

Follow-up da `2026-07-23-section-card-border-colors-design.md`. A mudança anterior deixou Parent e Current Work Item com borda azul sólida (`--vscode-focusBorder`/`--vscode-textLink-foreground`), parecendo os botões de foco/link da UI em vez de se diferenciar deles — o usuário não gostou do resultado. Pedido: reverter o Parent pra cor neutra padrão (igual Children, como estava antes dessa mudança), e trocar a borda azul chamativa do Current Work Item por um efeito de fade (gradiente) na própria linha da borda, só nele.

## Escopo

**Dentro do escopo:**
- CSS (`KanbrainViewProvider.ts`):
  - Remove `.kb-parent-section { border-color: var(--vscode-textLink-foreground); }` — Parent volta a usar só a border neutra padrão da `.kb-section-card` base (`--vscode-panel-border`), idêntico ao Children.
  - `.kb-section-card-current` deixa de usar `border-color`/`border-width` sólidos e passa a usar `border-image: linear-gradient(135deg, var(--vscode-focusBorder), var(--vscode-panel-border)) 1;` — a borda começa com a cor de destaque do tema (mesma usada hoje em foco de inputs/aba ativa) no canto superior-esquerdo e esmaece pra cor neutra (mesma do Parent/Children) no canto inferior-direito. Espessura volta a 1px (igual às outras duas seções) — a distinção vem da cor esmaecendo, não da grossura.
- `render.ts`: sem mudança — as classes `kb-section-card-current`/`kb-parent-section`/`kb-section-card-children` já existem dos commits anteriores.

**Fora do escopo:**
- Children continua sem nenhuma regra própria (já estava assim, não muda).
- Qualquer outro elemento (botões, links) — a paleta deles não muda; só a técnica de border do Current Work Item.

## Design

### CSS (`KanbrainViewProvider.ts`)

Remove:
```css
.kb-section-card-current { border-color: var(--vscode-focusBorder); border-width: 2px; }
.kb-parent-section { border-color: var(--vscode-textLink-foreground); }
```

Adiciona:
```css
.kb-section-card-current { border-image: linear-gradient(135deg, var(--vscode-focusBorder), var(--vscode-panel-border)) 1; }
```

`border-image` com `slice 1` aplica o gradiente ao redor do retângulo inteiro (as 4 bordas), usando a `border-width: 1px` já herdada da regra base `.kb-section-card`. Como `var(--vscode-panel-border)` é o mesmo tom neutro usado no Parent/Children, o final do fade se funde visualmente com as outras duas seções, e o início (canto superior-esquerdo) mantém o destaque de "este é o principal".

## Tratamento de erros

Nenhum caso novo — CSS puro. `border-image` é suportado em qualquer motor Chromium (base do webview do VS Code), sem necessidade de fallback.

## Testes

Nenhum teste automatizado cobre CSS/estilo visual (mesma observação da spec anterior). Verificação manual no VS Code, tema claro e escuro.
