# Header do card details: ícone/id na linha do título, status abaixo do assignee, faixa de status — Design

## Contexto e motivação

No painel de detalhes do work item (`renderWorkItemDetail.ts`, aberto pelo `WorkItemDetailPanelManager`), o header hoje tem: uma linha "top" com ícone + `#id` + status (dot + texto), depois o título como `<h1>` numa linha própria, depois o assignee. O usuário quer o ícone e o `#id` na mesma linha do título (não numa linha acima), e o status abaixo do assignee (não junto do ícone/id). Também quer que a cor do status vire uma faixa horizontal — reaproveitando a `border-bottom` que já separa o header do corpo do card — mantendo legibilidade em qualquer tema do VS Code.

## Escopo

**Dentro do escopo:**
- `renderWorkItemDetail.ts`: reestrutura o header —
  1. `.kb-detail-title-row` (substitui `.kb-detail-header-top`): ícone do tipo + `#id` + `<h1 class="kb-detail-title">` na mesma linha, alinhados verticalmente ao centro, ícone escalado pra acompanhar o tamanho do título (~22px, em vez dos 14px atuais).
  2. Assignee continua logo abaixo, sem mudança de posição relativa.
  3. Novo `.kb-detail-status-row` (dot + texto do status, mesmo conteúdo que já existia) fica depois do assignee.
- A border do `.kb-detail-header` passa a combinar duas cores no mesmo `style` inline: `border-right` com a cor do type (accent já existente, via `renderTypeAccent`) e `border-bottom` com a cor do status (`config.statusColors[workItem.status]`), em 3-4px — só quando a cor for um hex válido. Quando não há cor de status mapeada, a regra CSS base (`border-bottom: 1px solid var(--vscode-panel-border)`) continua valendo como fallback neutro, igual hoje.
- Como isso exige montar um único atributo `style` combinando duas cores (hoje `renderTypeAccent` já devolve uma string `style="border-right: ...;"` pronta, e não dá pra ter dois atributos `style` no mesmo elemento), a extração de cor/validação (`isValidHexColor`/`normalizeHex`, de `badgeColor.ts`) é feita diretamente em `renderWorkItemDetail.ts` pra montar o `style` combinado — sem alterar o contrato de `renderTypeAccent` (que outros call sites, como os cards, continuam usando do jeito que está).

**Fora do escopo:**
- Qualquer mudança no `renderStatusDot`/`renderTypeAccent` em si (funções inalteradas, só como são combinadas aqui).
- Cards da sidebar (`renderWorkItemCard.ts`) — layout deles não muda, essa spec é só do painel de detalhes.
- Contraste automático de texto sobre a faixa (`pickReadableTextColor`) — descartado nesta spec: a faixa é só uma linha colorida (`border-bottom`), sem texto desenhado em cima dela, então não há problema de legibilidade de texto a resolver. O mesmo padrão (cor crua, sem contrast-check) já é usado hoje pela `border-right` de type accent.

## Design

### `renderWorkItemDetail.ts`

```ts
import { isValidHexColor, normalizeHex } from './badgeColor';

// dentro de renderWorkItemDetail:
const { iconHtml } = renderTypeAccent(workItem.type, config); // borderStyle não é mais usado direto daqui
const typeColor = config.typeColors?.[workItem.type];
const statusColor = config.statusColors?.[workItem.status];
const borderDeclarations = [
  typeColor && isValidHexColor(typeColor) ? `border-right: 4px solid ${normalizeHex(typeColor)};` : '',
  statusColor && isValidHexColor(statusColor) ? `border-bottom: 4px solid ${normalizeHex(statusColor)};` : '',
]
  .filter(Boolean)
  .join(' ');
const headerStyle = borderDeclarations ? ` style="${borderDeclarations}"` : '';

// ...

return `
  <div class="kb-detail-header"${headerStyle}>
    <div class="kb-detail-title-row">
      ${iconHtml}
      <span class="kb-detail-id">#${workItem.id}</span>
      <h1 class="kb-detail-title">${escapeHtml(workItem.title)}</h1>
    </div>
    ${assigneeHtml}
    <div class="kb-detail-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
  </div>
  ...
`;
```

### CSS (`WorkItemDetailPanelManager.css()`)

```css
.kb-detail-header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; margin-bottom: 16px; }
.kb-detail-title-row { display: flex; align-items: center; gap: 8px; }
.kb-detail-title-row .kb-type-icon { width: 22px; height: 22px; }
.kb-detail-id { font-weight: 600; font-size: 16px; opacity: 0.75; flex-shrink: 0; }
.kb-detail-title { font-size: 22px; margin: 0; }
.kb-detail-status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.75; margin-top: 6px; }
```

Remove `.kb-detail-header-top` (substituída por `.kb-detail-title-row`/`.kb-detail-status-row`).

## Tratamento de erros

- `typeColor`/`statusColor` ausentes ou não-hex válidos: a declaração correspondente é omitida do `style` combinado (via `filter(Boolean)`); se nenhuma das duas for válida, `headerStyle` fica `''` e a regra CSS base (`border-bottom: 1px solid var(--vscode-panel-border)`) vale sozinha — mesmo comportamento de fallback que já existe hoje pro type accent.

## Testes

- `renderWorkItemDetail.test.ts`: ícone/id aparecem dentro de `kb-detail-title-row` junto com o título; `kb-detail-status-row` aparece depois do assignee no HTML (checagem de índice); `style` do header contém `border-right` quando `typeColors` tem cor válida pro tipo; contém `border-bottom` com a cor certa quando `statusColors` tem cor válida pro status; nenhum dos dois quando as cores não estão configuradas/são inválidas.
