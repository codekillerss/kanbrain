# Skill Configuration: ícone e cor por tipo no cabeçalho de grupo

## Problema

Na página de Config, dentro de "Skill Configuration" (`renderConfigEditor`), cada tipo de work item (Bug, Task, User Story...) vira um grupo colapsável com um cabeçalho (`kb-config-level-header`) que mostra só o chevron e o nome do tipo em texto puro. Em todo o resto do app (cards do board, resultados de busca, detalhe do work item, parent, pull request detail, related work), o mesmo tipo aparece com ícone SVG e uma borda de cor de destaque, via o helper `renderTypeAccent(type, config)`. O cabeçalho de grupo do Skill Configuration é o único lugar que ficou de fora desse padrão.

## Escopo

Somente exibição, reaproveitando dados já existentes (`config.typeIcons` / `config.typeColors`, sincronizados do Azure DevOps) e o helper já existente `renderTypeAccent`. Não inclui:
- Edição/customização de ícone ou cor pela tela de Config (fica para um pedido futuro, se houver).
- Mudanças em `renderTypeAccent` em si.
- Mudanças de CSS novas — `.kb-type-icon` já tem estilo global em `KanbrainViewProvider.ts`.

## Mudança

Arquivo único: `src/view/renderConfigEditor.ts`.

`renderConfigEditor(config: KanbrainConfig)` já recebe o `config` completo. Dentro do `.map(type => ...)` que monta cada grupo de tipo, chamar:

```ts
const { borderStyle, iconHtml } = renderTypeAccent(type, config);
```

E aplicar no cabeçalho do grupo:

```html
<button type="button" class="kb-config-level-header" data-action="toggle-group"${borderStyle}>
  <span class="kb-chevron">▾</span>${iconHtml}${escapeHtml(type)}
</button>
```

- `iconHtml`: o SVG do tipo (ex. ícone de Bug/Task vindo do Azure DevOps), renderizado com a classe `kb-type-icon` (14×14px, já estilizada globalmente), posicionado entre o chevron e o nome do tipo.
- `borderStyle`: aplica `border-right: 4px solid <cor>` no próprio botão do cabeçalho quando `config.typeColors[type]` é um hex válido — mesmo padrão visual usado nos cards do board.
- Quando um tipo não tem ícone/cor mapeado (ex. board ainda não sincronizado), o cabeçalho permanece exatamente como hoje — sem regressão, `iconHtml` e `borderStyle` retornam string vazia.

## Testes

Em `src/view/renderConfigEditor.test.ts`:
- Novo caso: com `typeIcons` e `typeColors` configurados para um tipo, o HTML do grupo contém `kb-type-icon` e a cor no `border-right`.
- Caso já existente (sem `typeIcons`/`typeColors`) continua passando sem essas classes/estilos — cobre a ausência de regressão.

## Fora de escopo (não tocar)

`renderSkillEntryRow`, os campos de cor de texto/botão por status (`kb-config-field-color`), e o `renderStatusDot` do status dentro de cada linha — nada disso muda.
