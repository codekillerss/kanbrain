# Border própria no card "Current Work Item" — Design

## Contexto e motivação

Follow-up da spec `2026-07-23-current-work-item-section-header-design.md` e da `2026-07-23-parent-full-card-design.md`. Hoje, dentro da caixa "Current Work Item" (`.kb-section-card`), o `.kb-main-card` tem sua border removida (`.kb-section-card .kb-main-card { border: none; margin: 0; }`), ficando colado nas bordas da caixa externa. Já o `.kb-subtask-card` (usado nos children e agora também no parent) mantém sua própria border e um respiro de `margin: 8px 10px` dentro da section-card. O usuário quer que o "Current Work Item" siga o mesmo tratamento visual dos children/parent — com border própria e o mesmo respiro.

## Escopo

**Dentro do escopo:**
- CSS (`KanbrainViewProvider.ts`): remove `.kb-section-card .kb-main-card { border: none; margin: 0; }` e junta o `kb-main-card` na regra de margin que já existe pro `kb-subtask-card`: `.kb-section-card .kb-main-card, .kb-section-card .kb-subtask-card { margin: 8px 10px; }`. A border 1px continua vindo da regra base já compartilhada `.kb-main-card, .kb-subtask-card { border: 1px solid ...; }` — sem duplicar.

**Fora do escopo:**
- Qualquer mudança de estrutura HTML (`render.ts`) ou comportamento — é ajuste puro de CSS.
- `kb-main-card` fora de uma `kb-section-card` (Home, `renderHome.ts`) — lá o card já tem sua border própria normalmente (nunca teve o override), sem mudança.

## Design

```css
.kb-section-card .kb-main-card, .kb-section-card .kb-subtask-card { margin: 8px 10px; }
```

substitui as duas regras atuais:

```css
.kb-section-card .kb-main-card { border: none; margin: 0; }
.kb-section-card .kb-subtask-card { margin: 8px 10px; }
```

## Tratamento de erros

Nenhum caso novo — ajuste puro de CSS, sem lógica nova.

## Testes

Nenhum teste automatizado cobre estilo visual/CSS neste projeto (os testes existentes checam presença de classes/atributos no HTML, não valores de CSS) — sem novos testes. Verificação manual visual no VS Code.
