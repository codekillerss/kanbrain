# Home screen (commands + current work item + config editor) — Design

## Contexto e motivação

Hoje, quando não há work item ativo, o painel mostra só uma caixa de busca solta — não há nenhum atalho pros outros comandos (`Kanbrain: Setup`, `Kanbrain: Check Board Configuration`, `Kanbrain: Sync Board Configuration`), e customizar uma skill (path/label/cores) exige editar `.kanbrain/config.json` à mão.

Esta mudança introduz uma tela "Home" com três seções (comandos, work item atual, editor de configuração de skills) mostrada por padrão quando não há work item ativo, e acessível a qualquer momento via um botão novo na tela focada (a visão de hoje, com card + subtasks). A tela focada continua exatamente como está — só ganha esse botão de volta.

## Escopo

**Dentro do escopo:**
- Tela Home com três seções: Comandos, Work item atual, Configuração de skills.
- Estado `showHome` guardado no `KanbrainViewProvider` (não no cliente), pra sobreviver a re-renders disparados pelo polling.
- Botão "🏠 Home" na tela focada.
- Editor de configuração cobrindo só `backlogLevels[level][status]` (path/label/textColor/buttonColor) — a única informação que não vem automaticamente do Setup/Sync. `organization`, `project`, `typeToBacklogLevel`, `statusColors`, `typeColors`, `typeIcons` continuam só leitura.
- Auto-save por campo (ao perder foco), sem botão "Salvar".
- Campo de path como texto livre + botão pequeno que abre o seletor nativo de arquivo do VS Code, preenchendo o campo (e disparando o mesmo auto-save).
- Reaproveitamento do diálogo de busca flutuante já existente pra trocar de work item a partir da Home (mesmo padrão da tela focada), e da busca inline já existente quando não há item ativo.

**Fora do escopo:**
- Adicionar/remover backlog levels, status ou tipos pela UI — essas chaves continuam vindo só de `Kanbrain: Setup`/`Kanbrain: Sync Board Configuration`; o editor só edita os valores de chaves que já existem.
- Editar `organization`/`project`/campos derivados do board.
- Qualquer otimização pra evitar perder foco num campo se o polling re-renderizar o painel no meio de uma edição de *outro* campo (~a cada 5s) — aceito como limitação conhecida de v1.
- Validação de conteúdo do arquivo de skill escolhido no seletor (aceita qualquer `.md` dentro do workspace).

## Design

### Estado de navegação (`showHome`)

`KanbrainViewProvider` ganha um campo `showHome: boolean`, inicializado `true`. Transições:
- `setActiveWorkItem(id)` com `id` definido (escolher um item, de qualquer lugar) → `showHome = false`.
- `setActiveWorkItem(undefined)` (Limpar) → `showHome = true`.
- Novo método `showHomeScreen()` (disparado pelo botão "🏠 Home") → `showHome = true`, sem alterar `activeWorkItemId`.
- Novo método `showFocusedScreen()` (disparado ao clicar no card resumido da Home, quando há item ativo) → `showHome = false`.

Como `extension.ts` só chama `provider.setActiveWorkItem(savedWorkItemId)` no boot quando havia um item salvo, reabrir o VS Code com um item ativo continua indo direto pra tela focada (comportamento de hoje preservado); sem item salvo, `showHome` fica no default `true`.

### `render()` (`src/view/render.ts`)

`RenderState` ganha `showHome: boolean`. Depois dos checks existentes (`hasWorkspace`, `config`), o fluxo passa a ser:

```
if (showHome) → renderHome(state)
else → renderFocused(state)   // conteúdo que hoje é o retorno final de render()
```

`renderFocused` é o que `render()` já faz hoje (header com Trocar/Limpar, diálogo de busca flutuante, card principal, lista de children) — só ganha o botão "🏠 Home" no header, ao lado de Trocar/Limpar.

### `renderHome` (novo, `src/view/renderHome.ts`)

Três seções, cada uma com um `<div class="kb-section-label">` de título:

1. **Comandos**: três botões, cada um mandando uma mensagem específica (`run-setup` — já existe desde a última mudança —, `run-check-board-config`, `run-sync-board-config`).
2. **Work item atual**: 
   - Sem item ativo: mesma busca inline de hoje (`#kb-search-section` com input + resultados, sem overlay).
   - Com item ativo: o card principal (`renderWorkItemCard`, sem a lista de children) + botões Trocar/Limpar, reaproveitando o mesmo diálogo de busca flutuante (`kb-search-overlay`) já usado na tela focada pro "Trocar". Clicar no card manda `show-focused`.
3. **Configuração**: uma lista por backlog level, cada um com uma linha por status já existente em `config.backlogLevels[level]`, com 4 campos (path + botão "…", label, textColor, buttonColor) — ver próxima seção.

### Editor de configuração (`src/view/renderConfigEditor.ts`, novo)

Para cada `level` em `config.backlogLevels` e cada `status` em `config.backlogLevels[level]`:

```html
<div class="kb-config-row" data-level="<level>" data-status="<status>">
  <div class="kb-config-row-status">
    <span class="kb-status-dot" style="background-color: #<cor>"></span><status>
  </div>
  <div class="kb-config-field-path">
    <input type="text" data-field="path" placeholder="Skill file path" value="<path ou vazio>">
    <button type="button" data-action="pick-skill-file">…</button>
  </div>
  <input type="text" data-field="label" placeholder="Label (optional)" value="<label ou vazio>">
  <input type="text" data-field="textColor" placeholder="Text color" value="<textColor ou vazio>">
  <input type="text" data-field="buttonColor" placeholder="Button color" value="<buttonColor ou vazio>">
</div>
```

`path` vazio no momento do save grava `null` pro status; caso contrário grava `{ path, label?, textColor?, buttonColor? }`, omitindo os campos opcionais que estiverem vazios.

### Mensagens novas (webview ↔ extensão)

| Mensagem (webview → extensão) | Efeito |
|---|---|
| `{ type: 'run-check-board-config' }` | `vscode.commands.executeCommand('kanbrain.checkBoardConfig')` |
| `{ type: 'run-sync-board-config' }` | `vscode.commands.executeCommand('kanbrain.syncBoardConfig')` |
| `{ type: 'show-home' }` | `provider.showHomeScreen()` |
| `{ type: 'show-focused' }` | `provider.showFocusedScreen()` |
| `{ type: 'save-skill-entry', level, status, path, label, textColor, buttonColor }` | Lê o config atual, atualiza só `backlogLevels[level][status]` (com a regra de `null`/objeto acima) e escreve — **sem forçar refresh imediato**; a mudança aparece no próximo ciclo de polling (até 5s depois), evitando derrubar o foco de outro campo que o usuário ainda esteja editando. |
| `{ type: 'pick-skill-file', level, status }` | Abre `vscode.window.showOpenDialog` filtrado por `.md` dentro do workspace; se o usuário escolher um arquivo, responde com `{ type: 'skill-file-picked', level, status, path }` (caminho relativo ao workspace, barras normalizadas) |

No cliente, `skill-file-picked` preenche o input de path da linha correspondente (`data-level`/`data-status`) e dispara o mesmo envio de `save-skill-entry` usado no blur dos outros campos.

`save-skill-entry` só aplica a mudança se `level`/`status` já existirem em `config.backlogLevels` — proteção defensiva contra a mensagem tentar criar uma chave nova (fora do escopo, ver acima).

### CSS

Novas classes pra layout de seção (`kb-home-section`, `kb-config-row` como grid/flex de 4 campos) — sem reinventar nada: reaproveita `kb-section-label`, `kb-status-dot`, `#kb-search-input`, `kb-search-overlay`/`kb-search-dialog`, `kb-main-card` já existentes.

## Tratamento de erros

- `pick-skill-file` sem seleção (usuário cancelou o diálogo): nenhuma mensagem é enviada de volta, campo permanece como estava.
- `save-skill-entry` para um `level`/`status` que não existe mais no config (ex: board mudou entre a renderização e o save): a mensagem é ignorada silenciosamente — o próximo ciclo de polling vai re-renderizar a linha de qualquer forma se o config mudou.
- Falha ao escrever o config (ex: `.kanbrain/config.json` ficou read-only): mesmo padrão dos comandos existentes — não trava a UI; um erro de escrita síncrona (`fs.writeFileSync`) já propagaria como exceção não tratada hoje em `writeConfig` para outros fluxos também, então isso não é uma regressão introduzida aqui.

## Testes

- `src/view/renderHome.test.ts` (novo): comandos section presente; work item section mostra busca inline quando não há item ativo, card + Trocar/Limpar quando há; config section lista cada level/status com os valores atuais nos campos.
- `src/view/renderConfigEditor.test.ts` (novo): linha por status; campos vazios quando entrada é `null`; campos preenchidos quando é um `SkillEntry`; escaping de HTML em valores.
- `src/view/render.test.ts`: novos casos cobrindo `showHome: true` delegando pra Home, `showHome: false` mantendo o comportamento hoje testado (renomear internamente pra `renderFocused` não muda a superfície pública testada).
- Sem teste automatizado pra `KanbrainViewProvider`'s novos handlers de mensagem (`show-home`, `show-focused`, `save-skill-entry`, `pick-skill-file`) — mesmo padrão já estabelecido pra esse arquivo (sem harness de VS Code em unit test); coberto pelo checklist manual do README.
