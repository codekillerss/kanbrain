# Home / Flow / Config screens split — Design

## Contexto e motivação

A tela Home recém-implementada embutia três coisas num só lugar: comandos, work item atual, e o editor de skills inteiro — ficando densa. Além disso, os botões da seção Comandos usavam o estilo de botão primário do tema (azul de destaque), repetido três vezes em sequência, o que ficou visualmente pesado. E quando não havia work item ativo, a Home mostrava a lista de busca inteira embutida, inconsistente com o diálogo flutuante que a tela de card (agora chamada "Flow") já usa pro mesmo propósito.

Esta mudança separa a configuração de skills numa tela própria ("Config"), simplifica a seção de work item da Home pra um botão que abre o mesmo diálogo flutuante já usado em Flow, e troca o estilo de botão das ações de navegação/comando pro estilo secundário (discreto) já usado em Switch/Clear/Home.

## Escopo

**Dentro do escopo:**
- Três telas: **Home**, **Flow** (renomeação de "focada" — card do work item ativo + children), **Config** (nova — só o editor de skills).
- Estado de navegação vira `screen: 'home' | 'flow' | 'config'` (era `showHome: boolean`), ainda guardado no `KanbrainViewProvider`.
- Home ganha um 4º botão "Configuration" na seção Comandos, que leva pra tela Config.
- Home remove a seção "Skill Configuration" inteira — ela só existe na tela Config agora.
- Home, sem work item ativo: mostra só um botão "🔍 Select Work Item" (mesmo id/comportamento do "Switch work item" de hoje) que abre o mesmo diálogo flutuante de busca — a lista de busca embutida sem overlay deixa de existir na Home.
- Cabeçalho de Flow e Config sempre inclui o botão "🏠 Home".
- Todos os botões de navegação/comando (Home, Switch, Clear, View details, Setup/Check/Sync/Configuration) passam a usar uma classe CSS compartilhada de botão secundário, substituindo o uso do estilo de botão primário nesses casos.

**Fora do escopo:**
- Qualquer mudança de comportamento do diálogo de busca em si (abas por backlog level, agrupamento por status) — só onde/quando ele é aberto muda.
- Qualquer mudança no editor de skills (`renderConfigEditor`) além de onde ele é renderizado (sai da Home, entra na Config).
- Persistir a tela atual (`screen`) entre reinícios do VS Code — cada reinício com um work item ativo salvo continua abrindo direto em Flow, como já acontecia com `showHome`.

## Design

### Estado (`KanbrainViewProvider`)

`showHome: boolean` vira `currentScreen: 'home' | 'flow' | 'config'`, default `'home'`. Transições:
- `setActiveWorkItem(id)` com `id` definido → `currentScreen = 'flow'`; com `undefined` (Limpar) → `currentScreen = 'home'`.
- `showHomeScreen()` (botão "🏠 Home", em Flow ou Config) → `currentScreen = 'home'`.
- `showFlowScreen()` (renomeado de `showFocusedScreen`; botão "View details →" na Home) → `currentScreen = 'flow'`.
- `showConfigScreen()` (novo; botão "Configuration" na Home) → `currentScreen = 'config'`.

### `render()` (`src/view/render.ts`)

`RenderState.showHome: boolean` vira `RenderState.screen: 'home' | 'flow' | 'config'`. Depois dos checks de `hasWorkspace`/`config`:
```
if (screen === 'home') → renderHome(state)
if (screen === 'config') → renderConfig(state)
else (screen === 'flow') → conteúdo de hoje (header com Home/Switch/Clear + card + children)
```

### `renderHome` (`src/view/renderHome.ts`)

- Seção Comandos ganha um 4º botão "🛠️ Configuration" (`id="kb-show-config-btn"`).
- Seção Work Item: quando não há item ativo, em vez da busca inline, mostra só `<button id="kb-toggle-search-btn">🔍 Select Work Item</button>` (mesmo id de sempre — o rótulo muda conforme há ou não item ativo) + o diálogo flutuante (`kb-search-overlay`, escondido por padrão) — igual ao que Flow já faz. Quando há item ativo: card (sem children) + Switch/Clear + "View details →", como já era.
- Seção "Skill Configuration" é removida.

### `renderConfig` (novo, `src/view/renderConfig.ts`)

```html
<div class="kb-header">
  <button id="kb-home-btn">🏠 Home</button>
</div>
<div class="kb-section-label">Skill Configuration</div>
{renderConfigEditor(config)}
```

### Mensagens novas/renomeadas

- `show-focused` (webview → extensão) é renomeada para `show-flow`; comportamento igual (`showFlowScreen()`).
- Nova mensagem `show-config` → `showConfigScreen()`, disparada pelo botão "Configuration" da Home.

### CSS

Nova classe `.kb-secondary-btn` (visual do botão secundário já existente) substitui o seletor por ID (`#kb-toggle-search-btn, #kb-clear-btn, #kb-home-btn`) — a regra de layout (`flex: 1`) fica escopada a `.kb-header .kb-secondary-btn`, já que ela só se aplica quando o botão está dentro de um cabeçalho em linha; os botões da seção Comandos (empilhados verticalmente) usam a mesma classe sem essa regra. Os botões que hoje usam `.kb-action-btn` (Home/Switch/Clear/View details/Setup-Home/Check/Sync/Configuration) passam a usar `.kb-secondary-btn` no lugar; `.kb-action-btn` continua existindo e sendo usado só pro botão de ação de skill (▶) e pro botão "Run Kanbrain: Setup" da tela de "nenhum projeto configurado" (esses dois não foram mencionados como "feios" e mantêm o destaque visual, que faz sentido pra eles — são ações de maior peso, não navegação).

## Tratamento de erros

Nenhum novo — mesma lógica de leitura/escrita de config já existente, só reorganização de onde/quando cada tela é mostrada.

## Testes

- `src/view/render.test.ts`: trocar `showHome` por `screen` em todos os casos; novo caso pra `screen: 'config'` delegando pra `renderConfig`.
- `src/view/renderHome.test.ts`: atualizar pra refletir o botão único "Select Work Item" no lugar da busca inline; novo caso pro botão "Configuration"; remover o caso que testava a seção de config embutida (ela não existe mais aqui).
- `src/view/renderConfig.test.ts` (novo): botão Home presente; editor de config renderizado.
