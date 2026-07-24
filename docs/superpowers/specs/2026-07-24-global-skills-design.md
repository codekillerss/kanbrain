# Skills globais (não vinculadas a status)

## Contexto e motivação

Hoje uma skill só existe amarrada a um `(tipo, status)` em `config.skills` (`src/config/resolveSkill.ts:3-5`: `config.skills[workItem.type]?.[workItem.status]`). O botão `▶ <label>` no card do "current work item" (tela Flow, `render.ts:97`) roda exatamente essa skill — não há como rodar outra.

Caso de uso real: um líder técnico pede para avaliar todos os PBIs do Backlog e preencher o campo Effort. Isso é uma skill que faz sentido rodar em qualquer PBI, independente do status em que ele está — inclusive em status que hoje nem têm skill configurada (Backlog normalmente não tem). Precisamos de um jeito de definir skills "avulsas", não vinculadas a status, e rodá-las a partir do card do current work item.

## Escopo

**Dentro do escopo:**
- Novo conceito de "global skill": uma `SkillEntry` sem tipo/status associado, configurável numa lista própria.
- Nova seção "Global Skills" na tela de Skill Configuration, com CRUD completo (adicionar, editar campos, remover).
- No card do current work item: uma seta `▾` ao lado do botão de skill de status, abrindo uma lista das global skills configuradas. Escolher uma roda na hora (ação avulsa, não substitui o botão principal).
- Quando não há skill de status pro card mas existem global skills: a seta aparece sozinha (sem o botão `▶`).
- Quando não há nenhuma global skill configurada: nenhuma seta aparece — sem mudança visual em relação a hoje.
- Reaproveitar toda a infraestrutura de execução existente (`generateContextFile` + `sendReadCommand`).

**Fora do escopo:**
- Múltiplas skills por status (isso resolveria um problema diferente — ambiguidade de qual rodar automaticamente — não o caso de uso descrito).
- Rodar uma global skill em qualquer card do board (não só no current work item) — fica pra um pedido futuro, se houver.
- Reaproveitar skills já atribuídas a outros tipos/status como se fossem globais — a lista de global skills é uma categoria separada, sempre (decisão já tomada: evita um dropdown poluído com dezenas de skills de status fora de contexto).
- Migração de configs existentes — `globalSkills` é um campo novo e opcional; configs sem ele funcionam normalmente (lista vazia).

## Design

### Modelo de dados (`src/types.ts`)

```ts
export interface KanbrainConfig {
  // ...campos existentes...
  globalSkills?: Record<string, SkillEntry>;
}
```

Mesmo formato de `repositories?: Record<string, RepositoryPathEntry>` — mapa por `id` estável, não array. Isso evita rodar a skill errada se a lista mudar entre o render do card e o clique (índice de array desalinharia; um `id` gerado uma vez não).

`id`: slug do `label` no momento da criação (ex. "Avaliar Effort do backlog" → `avaliar-effort-do-backlog`), com sufixo numérico se colidir com um `id` existente. Gerado uma única vez, ao adicionar a entrada — não muda se o label for editado depois.

`syncConfig()` (`src/config/syncConfig.ts`) não mexe em `globalSkills` — não é descoberto do Azure DevOps, é 100% definido pelo usuário. A função só precisa repassar `config.globalSkills` inalterado no objeto retornado (mesmo tratamento de campos não descobertos como `showAssignedTo`).

### Tela de Skill Configuration (`src/view/renderConfigEditor.ts`)

Nova seção "Global Skills", renderizada depois dos grupos por tipo, sempre visível (não colapsável, já que não tem sub-hierarquia de status):

```ts
function renderGlobalSkillRow(id: string, entry: SkillEntry): string {
  const { path, label = '', textColor = '', buttonColor = '' } = entry;
  return `
    <div class="kb-config-row" data-global-skill-id="${escapeHtml(id)}">
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
        <button type="button" data-action="pick-global-skill-file" data-global-skill-id="${escapeHtml(id)}" title="Browse for a file">…</button>
      </div>
      <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
      ${renderColorField('textColor', textColor, 'Text color hex')}
      ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
      <button type="button" class="kb-icon-btn" data-action="remove-global-skill" data-global-skill-id="${escapeHtml(id)}" title="Remove">✕</button>
    </div>
  `;
}

function renderGlobalSkillsSection(globalSkills: Record<string, SkillEntry>): string {
  const rows = Object.entries(globalSkills)
    .map(([id, entry]) => renderGlobalSkillRow(id, entry))
    .join('');
  return `
    <div class="kb-config-level">
      <div class="kb-config-level-header kb-config-level-header-static">Global Skills</div>
      <div class="kb-config-level-body">
        ${rows}
        <button type="button" class="kb-secondary-btn" data-action="add-global-skill">+ Add global skill</button>
      </div>
    </div>
  `;
}
```

(`kb-secondary-btn` já existe — mesma classe do botão "🏠 Home" — usada aqui por ser uma ação de gerenciamento de lista, não uma skill em si; `.kb-action-btn` fica reservado pro botão colorido que roda uma skill de verdade, tanto na Config quanto no card.)

Chamada no fim de `renderConfigEditor`: `... + renderGlobalSkillsSection(config.globalSkills ?? {})`.

Sem campo de status na linha (diferença central em relação a `renderSkillEntryRow`) e com botão de remover, que as linhas de status não têm (status vem do board, sempre presente).

### Mensagens novas (`src/view/KanbrainViewProvider.ts`)

Espelhando o tratamento existente de `save-skill-entry`/`pick-skill-file`:

```ts
} else if (message.type === 'add-global-skill') {
  this.addGlobalSkill();
} else if (message.type === 'save-global-skill-entry') {
  this.saveGlobalSkillEntry(
    String(message.id ?? ''),
    String(message.path ?? ''),
    String(message.label ?? ''),
    String(message.textColor ?? ''),
    String(message.buttonColor ?? ''),
  );
} else if (message.type === 'remove-global-skill') {
  this.removeGlobalSkill(String(message.id ?? ''));
} else if (message.type === 'pick-global-skill-file') {
  await this.pickGlobalSkillFile(String(message.id ?? ''));
} else if (message.type === 'run-global-skill') {
  await this.runGlobalSkill(Number(message.workItemId ?? 0), String(message.skillId ?? ''));
}
```

`addGlobalSkill()`: gera um novo `id` único (`global-skill-${Date.now()}` é suficiente — não precisa ser bonito, só único; o slug legível vem do label quando o usuário preenche e salva), grava uma `SkillEntry` vazia (`{ path: '' }`) em `config.globalSkills[id]`, persiste e re-renderiza.

`saveGlobalSkillEntry`/`removeGlobalSkill`/`pickGlobalSkillFile` seguem exatamente o padrão de `saveSkillEntry`/`pickSkillFile` já existentes, só operando em `config.globalSkills[id]` em vez de `config.skills[level][status]`.

### Execução compartilhada

`runSkill` (`KanbrainViewProvider.ts:312-345`) é dividido:

```ts
private async runSkill(id: number): Promise<void> {
  const workItem = await this.loadWorkItemForSkill(id);
  if (!workItem) return;
  const config = readConfig(this.workspaceRoot!)!;
  const skill = resolveSkill(config, workItem);
  if (!skill) return;
  await this.executeSkill(workItem, skill);
}

private async runGlobalSkill(id: number, skillId: string): Promise<void> {
  const workItem = await this.loadWorkItemForSkill(id);
  if (!workItem) return;
  const config = readConfig(this.workspaceRoot!)!;
  const skill = config.globalSkills?.[skillId];
  if (!skill) return;
  await this.executeSkill(workItem, skill);
}

private async executeSkill(workItem: WorkItem, skill: SkillEntry): Promise<void> {
  // corpo atual de runSkill a partir da resolução do parent/subtasks/branch
  // até o sendReadCommand(relativePath) — inalterado, só parametrizado por `skill`.
}
```

`loadWorkItemForSkill(id)` extrai a parte inicial de `runSkill` (guard clauses de `workspaceRoot`/`client`/`config`, fetch do work item) — reaproveitada pelas duas entradas. Nenhuma mudança de comportamento pra quem já usa skill de status.

### Card do current work item

`src/view/renderWorkItemCard.ts`:

```ts
function renderGlobalSkillSelect(id: number, globalSkills: Record<string, SkillEntry>): string {
  const entries = Object.entries(globalSkills);
  if (entries.length === 0) return '';
  const options = entries
    .map(([skillId, entry]) => {
      const label = entry.label ?? entry.path.split('/').pop() ?? entry.path;
      return `<option value="${escapeHtml(skillId)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  return `
    <select class="kb-global-skill-select" data-action="run-global-skill" data-id="${id}">
      <option value="" selected disabled>▾</option>
      ${options}
    </select>
  `;
}
```

`renderActionButton` passa a retornar o botão de status (se houver) concatenado com `renderGlobalSkillSelect(workItem.id, config.globalSkills ?? {})` — os dois lado a lado. Se não houver skill de status, só o select aparece (quando há global skills); se não houver global skills, só o botão (comportamento de hoje).

CSS: `.kb-global-skill-select` estilizado como um botão pequeno (`width: auto`, sem borda pesada), próximo do `.kb-action-btn`, mesma linha.

### Wiring no webview host (`KanbrainViewProvider.ts`, script inline)

Novo listener delegado, ao lado do `document.addEventListener('click', ...)` já existente (linha 545):

```ts
document.addEventListener('change', (e) => {
  const target = e.target;
  if (target && target.dataset && target.dataset.action === 'run-global-skill' && target.value) {
    vscode.postMessage({ type: 'run-global-skill', workItemId: target.dataset.id, skillId: target.value });
    target.value = '';
  }
});
```

Resetar `target.value = ''` depois do post garante que o select volta pro placeholder `▾` — é uma ação avulsa, não um estado persistente.

## Testes

`src/view/renderWorkItemCard.test.ts`: card com `globalSkills` configurado mostra o `<select>`; sem `globalSkills`, não mostra; sem skill de status mas com `globalSkills`, mostra só o select (sem `kb-action-btn`).

`src/view/renderConfigEditor.test.ts`: seção "Global Skills" renderiza uma linha por entrada de `config.globalSkills`; sem `globalSkills`, a seção aparece vazia (só o botão "+ Add").

`src/config/syncConfig.test.ts`: caso novo — `syncConfig` preserva `config.globalSkills` existente inalterado após um sync.

`KanbrainViewProvider.ts` não tem suíte de testes automatizados hoje (mesmo padrão documentado em specs anteriores de painéis/terminal) — `addGlobalSkill`/`saveGlobalSkillEntry`/`removeGlobalSkill`/`pickGlobalSkillFile`/`runGlobalSkill` são verificados manualmente via F5: adicionar uma global skill, rodar num card sem skill de status (ex. um item em Backlog), confirmar que o terminal recebe o comando certo; remover a skill, confirmar que ela some do select.
