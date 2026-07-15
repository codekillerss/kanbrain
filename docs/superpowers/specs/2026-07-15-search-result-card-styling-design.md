# Estilização dos itens de busca (troca de work item) — Design

## Contexto e motivação

Na lista de "Trocar work item" (`renderSearchResults`), cada resultado hoje é uma linha de texto puro (`#id título`) agrupada por status. Não há nenhuma indicação visual do *tipo* do work item (PBI, Bug, ou um tipo customizado do processo Azure DevOps do projeto), diferente do card do work item ativo (`renderWorkItemCard`), que já mostra o ícone real do tipo e uma borda colorida por tipo (via `config.typeColors`/`config.typeIcons`, capturados durante o `Kanbrain: Setup`).

Isso torna difícil diferenciar itens na lista de busca — especialmente quando o resultado mistura Epics, Stories, Bugs e Tasks no mesmo grupo de status. O objetivo desta mudança é reaproveitar a estilização por tipo que já existe no card ativo, aplicando-a aos itens da lista de busca, sem transformar cada resultado numa caixa grande — a lista pode ter até 50 itens e precisa continuar compacta e rolável.

## Escopo

**Dentro do escopo:**
- Cada item da lista de busca (`.kb-result-item`) passa a mostrar o ícone real do tipo (mesmo SVG sanitizado já usado no card ativo) antes do `#id`, e uma borda colorida (mesmo padrão visual do card: `border-right` na cor do tipo) quando `config.typeColors` tiver essa cor.
- Extração de um helper compartilhado `renderTypeAccent(type, config)` para montar ícone + borda por tipo, hoje embutido só dentro de `renderWorkItemCard`, para ser reaproveitado por `renderSearchResults` sem duplicar a lógica.
- Ajuste de assinatura: `renderSearchResults(items, config: KanbrainConfig)` no lugar de `renderSearchResults(items, statusColors)`, já que agora precisa também de `typeColors`/`typeIcons`.

**Fora do escopo:**
- Status dot/texto por item na lista de busca — o cabeçalho do grupo já indica o status compartilhado por todos os itens daquele grupo, então repetir por item seria redundante.
- Botão de ação (▶ skill) nos itens de busca — clicar num resultado continua apenas definindo esse item como work item ativo (comportamento atual); a ação só aparece depois, no card ativo.
- Qualquer mudança no fluxo de seleção/persistência do work item ativo, no polling, ou na lógica de agrupamento por status (`groupByStatus`) — nada disso muda.

## Design

### `renderTypeAccent` (novo módulo `src/view/renderTypeAccent.ts`)

Extraído do trecho hoje embutido em `renderWorkItemCard` (`render.ts`):

```ts
export function renderTypeAccent(type: string, config: KanbrainConfig): { borderStyle: string; iconHtml: string }
```

- `borderStyle`: `` style="border-right: 4px solid <hex normalizado>;" `` quando `config.typeColors[type]` existir e for um hex válido (reaproveita `isValidHexColor`/`normalizeHex` de `badgeColor.ts`); string vazia caso contrário.
- `iconHtml`: `<span class="kb-type-icon"><svg do config.typeIcons[type]></span>` quando existir; string vazia caso contrário.

`renderWorkItemCard` em `render.ts` passa a chamar `renderTypeAccent` em vez de montar essas duas strings inline — comportamento do card ativo/subtask não muda, só a origem do HTML.

### Item de busca compacto (`renderSearchResults.ts`)

Assinatura muda para `renderSearchResults(items: WorkItem[], config: KanbrainConfig): string`. Cada item passa a ser:

```html
<button class="kb-result-item" data-action="pick-work-item" data-id="<id>"<borderStyle>>
  <iconHtml>#<id> <título escapado>
</button>
```

usando o mesmo `renderTypeAccent(item.type, config)`. `groupByStatus` e o cabeçalho de grupo (com `renderStatusDot` + nome do status) não mudam.

### Chamador (`KanbrainViewProvider.searchWorkItems`)

Troca `renderSearchResults(filterSearchResults(items, query), config.statusColors ?? {})` por `renderSearchResults(filterSearchResults(items, query), config)`.

### CSS

`.kb-result-item` ganha `display: flex; align-items: center; gap: 4px;` (hoje é `display: block`, só texto) para acomodar o ícone antes do `#id` na mesma linha. Nenhuma classe nova — reaproveita `.kb-type-icon`, já estilizada (`width/height: 14px`).

## Tratamento de erros / casos de borda

- Tipo sem cor configurada em `config.typeColors`: item renderiza sem borda (sem `style`), igual ao comportamento hoje do card ativo para esse caso.
- Tipo sem ícone configurado em `config.typeIcons`: item renderiza sem `<span class="kb-type-icon">`, igual ao card ativo.
- Cor inválida (não bate o regex hex): tratada como ausente, sem borda — mesma regra de `isValidHexColor` já usada no card ativo.

## Testes

- Novo `src/view/renderTypeAccent.test.ts`: cor válida, cor ausente, cor inválida, ícone presente, ícone ausente.
- `src/view/renderSearchResults.test.ts` (existente): novos casos cobrindo ícone renderizado por item, borda colorida presente/ausente conforme `typeColors`, e confirmando ausência de status dot/texto e de botão de ação por item.
- `src/view/render.test.ts` (existente): sem mudança de comportamento esperada; ajustar apenas se a extração exigir.
