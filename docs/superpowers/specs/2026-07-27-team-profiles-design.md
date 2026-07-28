# Perfis de equipe (persona do solicitante) — Design

## Contexto e motivação

Hoje uma skill (status ou global) só recebe contexto sobre o work item (`{{title}}`, `{{status}}`, `{{subtasks}}`, etc.) — nunca sobre quem está pedindo a ação. Times que compartilham o mesmo `.kanbrain/config.json` têm papéis diferentes (desenvolvedor, QA, ...), e o usuário quer que o agente que lê o arquivo gerado saiba qual é o papel de quem apertou o botão, sem precisar reconfigurar nada por pessoa.

Requisito adicional do usuário: cada pessoa do time deve poder ter seu próprio perfil selecionado localmente, mesmo compartilhando o mesmo `.kanbrain/config.json` com o resto do time.

## Escopo

**Dentro do escopo:**
- Novo campo `profiles` em `.kanbrain/config.json`: mapa `id → { label, description }` (mesmo padrão de `globalSkills`/`repositories` — mapa por id, não array).
- Dois perfis default (`developer`, `qa`) criados via backfill idempotente (mesmo mecanismo já usado pro `explain-card` skill e `USAGE.md`): rodam tanto no `Kanbrain: Setup` quanto no `Kanbrain: Sync Board Configuration`, sem sobrescrever perfis já customizados pelo time.
- Novo campo `selectedProfileId` em `.kanbrain/config.local.json` (arquivo por workspace, gitignored) — qual perfil é o de cada pessoa, no mesmo mecanismo já usado por `repositories[].path` e `showAssignedTo`.
- Novo dropdown "Profile" na tela Home, ao lado do dropdown de Team, pra escolher/trocar o próprio perfil. Pode ficar sem nenhum selecionado indefinidamente.
- Ao rodar uma skill (status ou global), se houver perfil selecionado, o conteúdo gerado ganha um bloco `## Requester profile` no topo, antes do conteúdo resolvido do template.

**Fora do escopo:**
- Perguntar interativamente "qual é o seu perfil?" durante o `Setup` ou o `Sync` — nenhum dos dois comandos pergunta isso; a escolha é sempre feita depois, pelo dropdown na Home.
- Campos estruturados no perfil (competências, senioridade, etc.) — cada perfil é só `label` + um texto livre (`description`).
- Placeholder `{{profile}}` opt-in por template — o bloco é injetado automaticamente em toda skill, o autor do template não escolhe se/onde ele aparece.
- Perfis por projeto/organização — essa spec assume o cenário atual de um `config.json` por workspace (ver spec separada de multi-projeto, ainda não fechada).

## Design

### Tipos (`src/types.ts`)

```ts
export interface ProfileEntry {
  label: string;
  description: string;
}

// em KanbrainConfig:
profiles?: Record<string, ProfileEntry>;
selectedProfileId?: string; // mesclado de config.local.json via applyLocalOverlay, igual showAssignedTo
```

### Perfis default (`src/skills/bootstrapContent.ts`)

```ts
export const DEFAULT_PROFILES: Record<string, ProfileEntry> = {
  developer: {
    label: 'Desenvolvedor',
    description:
      'Sou um desenvolvedor de software. Foco em qualidade de código, testes automatizados e arquitetura. ' +
      'Priorize instruções técnicas claras, com contexto de código e trade-offs de implementação.',
  },
  qa: {
    label: 'QA',
    description:
      'Sou responsável por qualidade e testes. Priorize cenários de teste, casos de borda e critérios de aceite claros.',
  },
};

export function ensureDefaultProfiles(existing: Record<string, ProfileEntry> | undefined): Record<string, ProfileEntry> {
  const merged = { ...(existing ?? {}) };
  for (const [id, entry] of Object.entries(DEFAULT_PROFILES)) {
    if (!(id in merged)) {
      merged[id] = entry;
    }
  }
  return merged;
}
```

Chamado em `setup.ts` (junto com `ensureExplainCardGlobalSkill`, ao montar o config inicial) e em `syncBoardConfig.ts` (junto com o resto do backfill, ao regravar `updated`). Idempotente: nunca sobrescreve uma entrada já existente (customizada ou não) — só adiciona `developer`/`qa` se estiverem ausentes.

`isBootstrapContentMissing` (mesmo arquivo) passa a checar também os perfis default, pro mesmo sinal que já alimenta a mensagem do `Kanbrain: Sync Board Configuration` (`diffBoardConfig`/`summarizeDiff`) cobrir esse backfill — quem já tinha o Kanbrain configurado vê "perfis default adicionados" no resumo do sync, igual já acontece hoje com o `explain-card`/`USAGE.md`:

```ts
export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const explainCardEntryMissing = !config.globalSkills?.[EXPLAIN_CARD_SKILL_ID];
  const defaultProfilesMissing = Object.keys(DEFAULT_PROFILES).some(id => !config.profiles?.[id]);
  return usageGuideMissing || explainCardEntryMissing || defaultProfilesMissing;
}
```

### Armazenamento local (`src/config/config.ts`)

`LocalConfig`, `extractLocalFields`, `writeLocalConfig`, `applyLocalOverlay` passam a tratar `selectedProfileId` exatamente como já tratam `showAssignedTo`:

```ts
interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
  selectedProfileId?: string; // novo
}
```

`writeConfig` inclui `selectedProfileId` no destructure que separa campos locais dos compartilhados. Sem migração: campo novo e opcional, ausência = "sem perfil selecionado". Se o id salvo não existir mais em `config.profiles` (perfil removido/renomeado pelo time), é tratado como não selecionado — sem erro, sem popup.

### Resolução do perfil ativo (`src/config/resolveActiveProfile.ts`, novo)

```ts
export function resolveActiveProfile(config: KanbrainConfig): ProfileEntry | null {
  if (!config.selectedProfileId) return null;
  return config.profiles?.[config.selectedProfileId] ?? null;
}
```

### Injeção no conteúdo gerado (`src/skills/generateContextFile.ts`)

`resolvePlaceholders` continua responsável só pelos tokens `{{...}}` do template. Um novo passo, separado, prepend o bloco de perfil:

```ts
function prependProfileBlock(content: string, profile: ProfileEntry | null): string {
  if (!profile) return content;
  return `## Requester profile\n**${profile.label}** — ${profile.description}\n\n---\n\n${content}`;
}

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  profile: ProfileEntry | null,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);
  const withProfile = prependProfileBlock(resolved, profile);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;

  return writeGeneratedFile(workspaceRoot, fileName, withProfile);
}
```

`KanbrainViewProvider.executeSkill` (único ponto de execução, usado tanto por status skills quanto global skills) resolve o perfil e repassa:

```ts
const profile = resolveActiveProfile(config);
const relativePath = generateContextFile(this.workspaceRoot, skill.path, { workItem, parent, subtasks, branch }, profile);
```

Exemplo de saída, com perfil selecionado:

```
## Requester profile
**Desenvolvedor** — Sou um desenvolvedor de software. Foco em qualidade de código...

---

# Skill: Explain Card
Work item: ...
```

Sem perfil selecionado, a saída é idêntica à de hoje (sem o bloco).

### UI (`src/view/renderHome.ts`)

```ts
function renderHomeProfileSection(state: RenderState): string {
  const config = state.config!;
  const profileIds = Object.keys(config.profiles ?? {});
  if (profileIds.length === 0) return '';
  const selected = config.selectedProfileId ?? '';
  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Profile</div>
      <div class="kb-team-card">
        <select id="kb-profile-select">
          <option value=""${selected === '' ? ' selected' : ''}>— None —</option>
          ${profileIds
            .map(id => `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>${escapeHtml(config.profiles![id].label)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  `;
}
```

Renderizada logo abaixo de `renderHomeTeamSection` em `renderHome`. Reaproveita a classe `.kb-team-card` (mesmo visual do dropdown de Team).

### `KanbrainViewProvider.ts`

Listener no webview, ao lado do de `kb-team-select`:
```ts
const profileSelect = document.getElementById('kb-profile-select');
if (profileSelect) {
  profileSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'set-selected-profile', profileId: profileSelect.value });
  });
}
```

Handler da mensagem, seguindo o padrão de `setShowAssignedTo` (lê o config mesclado, muta o campo, `writeConfig` — não o padrão de `setSelectedTeam`, que é `workspaceState`):
```ts
} else if (message.type === 'set-selected-profile') {
  this.setSelectedProfile(message.profileId || undefined);
}

private setSelectedProfile(profileId: string | undefined): void {
  if (!this.workspaceRoot) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  config.selectedProfileId = profileId;
  writeConfig(this.workspaceRoot, config);
  this.lastState = '';
  void this.refresh();
}
```

## Tratamento de erros

- `config.profiles` vazio ou ausente: seção do dropdown não aparece (mesmo comportamento do dropdown de Team quando não há times).
- `selectedProfileId` aponta pra um id inexistente em `config.profiles`: `resolveActiveProfile` retorna `null` — bloco de perfil não aparece no arquivo gerado; o `<select>` recai visualmente em "— None —" na próxima renderização (nenhuma `<option>` bate com o valor salvo).
- `workspaceRoot`/`config` ausentes em `setSelectedProfile`: mesma guarda cedo (`return`) já usada em `setShowAssignedTo`.

## Testes

- `resolveActiveProfile.test.ts` (novo): sem `selectedProfileId` → `null`; id presente em `profiles` → retorna a entrada; id ausente de `profiles` → `null`.
- `generateContextFile.test.ts` (estende o existente): com perfil → bloco `## Requester profile` no topo do arquivo gerado, com `label`/`description` corretos, seguido do `---` e do conteúdo resolvido; sem perfil (`null`) → saída idêntica à atual, sem o bloco.
- `bootstrapContent.test.ts` (estende o existente): `ensureDefaultProfiles(undefined)` cria `developer`+`qa`; `ensureDefaultProfiles({ developer: {...customizado} })` preserva a customização e só adiciona `qa`; chamada com os dois já presentes não muda nada.
- `config.test.ts` (estende o existente): `writeConfig` com `selectedProfileId` grava em `config.local.json`, não em `config.json`; `readConfig` aplica o overlay e devolve `selectedProfileId` mesclado; ausência do campo no local não quebra a leitura.
- `renderHome.test.ts` (estende o existente): sem `profiles` → seção ausente; com `profiles` e nenhum `selectedProfileId` → "— None —" selecionado; com `selectedProfileId` válido → opção correspondente selecionada; `label` com HTML é escapado.
- Sem teste automatizado para o listener do webview / handler de mensagem em `KanbrainViewProvider.ts` (mesma observação já aceita nos outros pontos de glue de vscode/webview do projeto — verificado manualmente via F5).
