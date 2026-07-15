# Skill entry customization (label & colors) — Design

## Contexto e motivação

Hoje, cada entrada de `backlogLevels[level][status]` em `.kanbrain/config.json` é só uma string apontando pro arquivo de skill (ou `null`). O rótulo do botão de ação é sempre derivado do nome do arquivo (`skillPath.split('/').pop()`), e a cor do botão é sempre a cor padrão de botão do tema do VS Code (`--vscode-button-background`/`--vscode-button-foreground`) — sem nenhuma customização por skill.

Esta mudança permite que cada entrada de skill defina opcionalmente um rótulo customizado e cores de texto/botão próprias, além do caminho do arquivo.

Como o Kanbrain ainda não foi publicado (não há usuários além do autor), não é necessário manter compatibilidade com o formato antigo (string solta) — toda entrada de skill passa a ser sempre um objeto.

## Escopo

**Dentro do escopo:**
- Novo tipo `SkillEntry { path: string; label?: string; textColor?: string; buttonColor?: string }` — `path` obrigatório, os demais campos opcionais.
- `KanbrainConfig.backlogLevels` muda de `Record<string, Record<string, string | null>>` para `Record<string, Record<string, SkillEntry | null>>`.
- O botão de ação (`.kb-action-btn`, renderizado em `renderWorkItemCard`/`render.ts`) usa `label` quando definido (senão cai no nome do arquivo, como hoje), e aplica `textColor`/`buttonColor` como estilo inline quando forem hex válidos (reaproveitando `isValidHexColor`/`normalizeHex` de `badgeColor.ts`) — cor ausente ou inválida cai no tema padrão do VS Code, sem erro.
- `resolveSkillPath` (`src/config/resolveSkillPath.ts`) é renomeado para `resolveSkill` e passa a retornar o `SkillEntry` inteiro (ou `null`), não só o caminho — os dois chamadores existentes (`render.ts`, `KanbrainViewProvider.runSkill`) são atualizados para usar `.path` onde precisam só do arquivo.
- Todos os lugares que hoje criam ou repassam entradas de `backlogLevels` (`buildPresetPlan` em `presetSkillFiles.ts`, `syncConfig`, `diffBoardConfig`) são atualizados para o novo tipo — mudança mecânica de tipo, sem mudança de lógica de negócio (continuam tratando a entrada como um valor opaco copiado/comparado por chave).
- README: exemplo de `config.json` atualizado pro novo formato, com nota documentando os campos opcionais.

**Fora do escopo:**
- Qualquer migração automática de configs antigos (não existem, já que o projeto não foi publicado).
- Prompt novo no `Kanbrain: Setup` ou `Kanbrain: Sync Board Configuration` para configurar label/cores — ambos continuam gerando entradas só com `{ path }`; customizar label/cores é sempre uma edição manual do `config.json` para aquela entrada específica.
- Validação de outros formatos de cor (nomes CSS, `rgb()`, etc.) — só hex, mesmo padrão já usado em `typeColors`/`statusColors`.
- Qualquer customização visual do botão além de rótulo/cor de texto/cor de fundo (ex: ícone próprio, tamanho).

## Design

### Tipos (`src/types.ts`)

```ts
export interface SkillEntry {
  path: string;
  label?: string;
  textColor?: string;
  buttonColor?: string;
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}
```

### `resolveSkill` (renomeado de `resolveSkillPath`)

```ts
export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null
```

Mesma lógica de hoje (olha `typeToBacklogLevel[workItem.type]`, depois `backlogLevels[level]?.[workItem.status]`), só que retorna a entrada inteira em vez de extrair um caminho.

### Botão de ação (`render.ts`)

```ts
function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  if (!skill) {
    return '';
  }
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  const style = textColor || buttonColor
    ? ` style="${buttonColor ? `background: ${buttonColor};` : ''}${textColor ? `color: ${textColor};` : ''}"`
    : '';
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}"${style}>▶ ${escapeHtml(label)}</button>`;
}
```

Mesmo padrão de estilo inline já usado em `renderTypeAccent` para a borda colorida por tipo.

### `KanbrainViewProvider.runSkill`

Troca `resolveSkillPath(config, workItem)` por `resolveSkill(config, workItem)`, usando `skill.path` no lugar de `skillPath` ao chamar `generateContextFile`.

### `buildPresetPlan` (`presetSkillFiles.ts`)

Entradas geradas passam de `statusSkills[statusName] = relativePath` para `statusSkills[statusName] = { path: relativePath }`. Tipo de `PresetPlan.backlogLevels` atualizado para `Record<string, Record<string, SkillEntry | null>>`.

### `syncConfig` e `diffBoardConfig`

Assinaturas atualizadas para o novo tipo (`SkillEntry | null` no lugar de `string | null`); lógica interna não muda — ambos tratam a entrada como um valor opaco copiado por chave (`syncConfig`) ou comparado só pela existência da chave (`diffBoardConfig`). A única leitura de conteúdo é em `diffBoardConfig`'s `statusesRemoved`, que hoje reporta `skillPath: config.backlogLevels[level][status]`; passa a reportar `skillPath: config.backlogLevels[level][status]?.path ?? null`, mantendo o relatório focado no caminho do arquivo (não precisa expor label/cores no aviso de órfão).

## Tratamento de erros

- `textColor`/`buttonColor` ausente ou hex inválido: ignorado silenciosamente, botão usa a cor padrão do tema — mesmo comportamento já estabelecido para `typeColors` inválido.
- `label` ausente: cai no nome do arquivo, comportamento idêntico ao de hoje.

## Testes

- `src/config/resolveSkill.test.ts` (renomeado de `resolveSkillPath.test.ts`): casos atualizados para retornar/comparar o objeto `SkillEntry` inteiro em vez de uma string.
- `src/view/render.test.ts`: fixture de config atualizada pro novo formato; novos casos cobrindo rótulo customizado, `textColor`/`buttonColor` válidos aplicados como estilo inline, cor inválida ignorada (cai no padrão do tema).
- `src/skills/presetSkillFiles.test.ts`: assertions atualizadas de `.toBe('<path>')` para `.toEqual({ path: '<path>' })`.
- `src/config/syncConfig.test.ts`, `src/azureDevOps/checkBoardConfig.test.ts`, `src/config/config.test.ts`: fixtures de `backlogLevels` atualizadas pro formato objeto em todos os casos existentes.
