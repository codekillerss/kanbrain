# Sections recolhíveis na Configuration + assignee alinhado à direita — Design

## Contexto e motivação

A tela de Configuration agrupa as entradas de skill por backlog level (Tasks, Features, Backlog Items...), dentro da seção "Skill Configuration". Hoje esse agrupamento é só um `<div class="kb-section-label">` por level, sem nenhuma fronteira visual — não dá pra perceber que os levels são filhos de "Skill Configuration", e a lista inteira fica sempre expandida, o que fica maçante conforme cresce o número de levels/status.

Com a adição recente da seção "Display" (toggle "Show assignee on cards") acima de "Skill Configuration", a falta de hierarquia visual ficou mais evidente: as três seções (Display, Skill Configuration, backlog levels) hoje parecem todas do mesmo nível.

Separadamente, a linha de assignee (avatar + nome) renderizada nos cards e no modal de busca está alinhada à esquerda, junto com status/título; o pedido é alinhá-la à direita (align end) pra ficar visualmente separada do resto do conteúdo do card/item.

## Escopo

**Dentro do escopo:**
- "Skill Configuration" ganha um visual de "section" (caixa com borda) que contém visivelmente os backlog levels — sem ser recolhível.
- Cada backlog level vira uma "sub-section" recolhível (borda própria, cabeçalho clicável com chevron), aninhada dentro da caixa de "Skill Configuration".
- Backlog levels renderizam recolhidos por padrão (lista de status escondida até o clique no cabeçalho).
- Reaproveita o mecanismo já existente de toggle (`data-action="toggle-group"` + `kb-hidden` no irmão seguinte), sem introduzir um novo tipo de mensagem/estado no `KanbrainViewProvider`.
- Pequeno ajuste de robustez no handler de clique: usar `.closest('[data-action="toggle-group"]')` em vez de checar o alvo exato do clique, pra cliques no chevron (elemento filho do botão) também disparem o toggle.
- `.kb-assignee-row` (cards) e `.kb-result-item-assignee` (modal de busca) alinhados à direita (`justify-content: flex-end`).

**Fora do escopo:**
- Persistir o estado de expandido/recolhido entre re-renders — a tela de Configuration é re-renderizada por inteiro a cada poll quando o `config.json` muda (mesmo comportamento que já reseta a aba ativa do modal de busca hoje). Resolver isso exigiria trocar a estratégia de re-render (diff/patch em vez de substituição total do HTML), o que está fora do escopo deste pedido.
- Recolher a seção "Skill Configuration" em si (fica sempre expandida, só com a moldura visual de section).
- Mudar o estilo das linhas individuais de skill entry (`.kb-config-row`) — elas continuam com sua própria borda, agora aninhadas dentro do corpo do level.
- Mudar o agrupamento por status no modal de busca (`.kb-result-group`/`.kb-group-toggle`) — já tem seu próprio padrão de toggle e não foi pedido para mudar visualmente.

## Design

### Estrutura (`src/view/renderConfig.ts`)

```ts
export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee on cards
    </label>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

### Backlog levels recolhíveis (`src/view/renderConfigEditor.ts`)

```ts
export function renderConfigEditor(config: KanbrainConfig): string {
  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return '<div class="kb-empty">No backlog levels configured yet.</div>';
  }

  return levels
    .map(level => {
      const statuses = config.backlogLevels[level];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(level, status, statuses[status], config.statusColors ?? {}))
        .join('');
      return `
        <div class="kb-config-level">
          <button type="button" class="kb-config-level-header" data-action="toggle-group">
            <span class="kb-chevron">▾</span>${escapeHtml(level)}
          </button>
          <div class="kb-config-level-body kb-hidden">
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');
}
```

`renderSkillEntryRow` não muda — continua produzindo o mesmo `.kb-config-row` de sempre, só que agora aninhado dentro de `.kb-config-level-body`.

### Robustez do toggle (`src/view/KanbrainViewProvider.ts`, script inline)

Troca, no listener de `click`:

```js
} else if (target.dataset && target.dataset.action === 'toggle-group') {
  const items = target.nextElementSibling;
  if (items) {
    items.classList.toggle('kb-hidden');
  }
}
```

por:

```js
} else if (target.closest && target.closest('[data-action="toggle-group"]')) {
  const toggle = target.closest('[data-action="toggle-group"]');
  const items = toggle.nextElementSibling;
  if (items) {
    items.classList.toggle('kb-hidden');
  }
}
```

Isso cobre tanto o `.kb-group-toggle` do modal de busca (que já tem um `<span class="kb-status-dot">` como filho) quanto o novo `.kb-config-level-header` (com o `<span class="kb-chevron">` filho) — clicar em qualquer parte do botão, incluindo o ícone, funciona.

### CSS (`KanbrainViewProvider.css()`)

Novas regras:

```css
.kb-config-parent-section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-top: 8px; background: var(--vscode-sideBarSectionHeader-background, transparent); }
.kb-config-parent-header { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 6px; }
.kb-config-level { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 6px 0; }
.kb-config-level-header { display: flex; align-items: center; width: 100%; text-align: left; padding: 6px 8px; background: var(--vscode-editor-background); border: none; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; }
.kb-config-level-header:hover { background: var(--vscode-list-hoverBackground); }
.kb-config-level-body { padding: 6px 8px; }
.kb-chevron { display: inline-block; margin-right: 6px; transition: transform 0.15s ease; }
.kb-config-level-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
```

`.kb-config-level` substitui o antigo uso de `<div class="kb-section-label">${level}</div>` solto — a regra `.kb-config-level` existia antes só como `margin-bottom: 8px`; passa a ter a moldura de card. `:has()` é suportado pelo Chromium/Electron usado pelo VS Code ^1.85 (Chromium ≥ 105 já suporta desde bem antes dessa versão), então não precisa de fallback.

### Alinhamento do assignee (`KanbrainViewProvider.css()`)

```css
.kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; justify-content: flex-end; }
.kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; justify-content: flex-end; }
```

(Só adiciona `justify-content: flex-end;` às regras já existentes — nenhuma outra propriedade muda.)

## Tratamento de erros

Não há novos estados de erro — é uma mudança puramente de apresentação (markup + CSS) sobre dados que já existem e já são validados/escapados (`escapeHtml(level)` continua sendo aplicado).

## Testes

- `src/view/renderConfigEditor.test.ts`: casos novos verificando que cada level renderiza `data-action="toggle-group"` no header, `kb-chevron` presente, e que o corpo (`kb-config-level-body`) vem com `kb-hidden` por padrão (recolhido).
- `src/view/renderConfig.test.ts`: caso novo verificando que `kb-config-parent-section`/`kb-config-parent-header` envolvem a saída de `renderConfigEditor`.
- Sem mudança de teste para o `KanbrainViewProvider.ts` (sem suíte de teste dedicada, como já registrado nos specs anteriores) — verificação via `npm run compile` + `npm run test:unit` completo.
