# Skill por (tipo + status) e descoberta multi-time — Design

## Contexto e motivação

Esta spec nasceu de uma correção de escopo: ao investigar por que o seletor de board (da spec "Show Parent on Card") não tinha efeito visível no projeto real do usuário, ficou claro que o pedido original não era sobre múltiplos *boards* do mesmo time, e sim sobre múltiplos **times** — um projeto Azure DevOps real tem vários times, cada um com seus próprios boards por backlog level (Epics/Features/Backlog items), frequentemente com o mesmo nome entre times.

Investigando essa correção, surgiu um problema mais fundamental: hoje Kanbrain descobre "quais tipos de work item existem" via `client.listBacklogLevels(organization, project, team)` — mas **cada time pode esconder backlog levels diferentes** nas configurações dele (`isHidden` já é filtrado hoje, mas é por-time). Isso significa que o mapeamento de skill (`config.backlogLevels`), que hoje depende de quais níveis o time *padrão* enxerga, tem um ponto cego: um tipo escondido pelo time padrão nunca aparece no mapeamento, mesmo existindo no processo do projeto.

A correção de raiz, definida nesta conversa: **o mapeamento de skill não deveria depender de backlog level (que é uma visão por-time) — deveria mapear direto por (tipo de work item, status)**, que é uma visão de processo, verdadeiramente compartilhada entre todos os times do projeto. Isso elimina o ponto cego por completo para skills. A enumeração de tipos passa a vir de `GET .../_apis/wit/workitemtypes` (nível de processo, sem nenhum parâmetro de time), não mais de `listBacklogLevels`.

Já a config de exibição de campos do card (Parent/AssignedTo) é genuinamente por time (times diferentes configuram boards diferentes) — essa parte da spec anterior estava certa em ser "por board", só errada em escopar isso a um único time. A correção aqui é expandir a descoberta pra todos os times do projeto (`GET .../_apis/projects/{project}/teams`), e trocar o seletor "Board" por um seletor "Team" — dentro de um time, os boards continuam resolvidos automaticamente por tipo, sem desempate exposto ao usuário (decisão já tomada nesta conversa: times, não boards, é o eixo real de ambiguidade).

## Escopo

**Dentro do escopo:**
- Nova fonte de tipos: `GET .../_apis/wit/workitemtypes` (retorna `name`, `color`, `icon.url`, `isDisabled` num só call — já elimina uma chamada por tipo que hoje fazemos separadamente pra cor).
- `KanbrainConfig.backlogLevels`/`typeToBacklogLevel` removidos. Novo campo `skills: Record<workItemType, Record<status, SkillEntry | null>>`.
- `resolveSkill.ts` simplifica (sem indireção de nível).
- Tela Config (`renderConfigEditor.ts`): grupos colapsáveis por **tipo de work item**, não por backlog level.
- Abas do dialog de busca (`renderSearchResults.ts`): por **tipo de work item**, não por backlog level.
- `Kanbrain: Setup`: gera skill placeholder por (tipo, status).
- `checkBoardConfig.ts`/`diffBoardConfig`: diff simplifica pra `typesAdded`/`typesRemoved` e, por tipo, `statusesAdded`/`statusesRemoved` — sem `typesMoved`, `levelsAdded`, `levelsRemoved` (conceitos que deixam de existir).
- Novo `client.listTeams(organization, project)` — descobre todos os times do projeto.
- `cardSettingsByBoard` vira `cardSettingsByTeam: Record<team, Record<board, Record<tipo, CardFieldSettings>>>` — descoberta expande pra todos os times (reaproveitando `listBoards`/`getCardSettings` já existentes, por time).
- Novo campo `defaultTeam: string` no config — capturado no Setup, usado como fallback quando o usuário não escolheu um time.
- `resolveShowParent`/`resolveShowAssignedTo` (em `resolveCardFieldVisibility.ts`) passam a receber `selectedTeam` em vez de `selectedBoard` — resolvem o tipo dentro dos boards do time selecionado, caindo no primeiro board encontrado silenciosamente se o tipo aparecer em mais de um board do mesmo time (raro).
- Tela Config: dropdown "Team" substitui o dropdown "Board (desempate de campos)" — mesma regra de exibição (só aparece com 2+ times), mesmo mecanismo de persistência local (`workspaceState`, chave renomeada).

**Fora do escopo (v1):**
- `Kanbrain: Configure with AI` (`buildSetupAssistantFile.ts`/`discoverBoardColumns.ts`) continua usando só o time padrão pra listar boards/colunas como referência — é um fluxo manual/interativo (humano + agente reconciliando), não a engine automática de skill/campo. Só o texto gerado é ajustado pra não falar mais em "backlog level" como conceito de mapeamento.
- Paginação de `listTeams`/`listBoards` — aceita o tamanho de página padrão da API, sem `$top`/`$skip` explícitos, consistente com o resto do código.
- Qualquer UI para editar `cardSettingsByTeam` manualmente — continua só sincronizado via Setup/Sync, igual `typeColors`/`typeIcons` hoje.

**Riscos técnicos a declarar:**
1. `GET .../_apis/wit/workitemtypes` e `GET .../_apis/projects/{project}/teams` foram confirmados via documentação oficial (exemplos completos de request/response), mas **não foram testados contra uma chamada real nesta sessão** — mesmo tipo de risco que o `cardsettings` teve inicialmente (que só foi descoberto errado depois de um teste manual real). Recomenda-se validar os dois contra o projeto real do usuário antes de considerar essa feature pronta.
2. Projetos com muitos times multiplicam chamadas de descoberta (times × boards por time × 1 chamada de cardsettings cada) — pode ficar lento em projetos com dezenas de times. Não otimizado nesta v1 (mesma filosofia "descobre tudo" já usada em outras partes do Setup).
3. Esta é uma mudança de arquitetura grande — toca ~30 arquivos de produção/teste que hoje referenciam `backlogLevels`/`typeToBacklogLevel`. A lista completa de arquivos afetados está na seção Design abaixo; nenhum deveria escapar da migração (senão o build quebra, já que os campos somem do tipo `KanbrainConfig`).

## Design

### 1. Tipos e config (`src/types.ts`)

```ts
export interface KanbrainConfig {
  organization: string;
  project: string;
  defaultTeam: string;
  skills: Record<string, Record<string, SkillEntry | null>>; // [tipo][status] => skill
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>; // [time][board][tipo]
  showAssignedTo?: boolean;
}
```

`typeToBacklogLevel` e `backlogLevels` são removidos por completo. `cardSettingsByBoard` (achatado, um nível) vira `cardSettingsByTeam` (um nível a mais: time → board → tipo).

### 2. Descoberta de tipos (`src/azureDevOps/discoverWorkItemTypes.ts`, novo arquivo, substitui o papel de `backlogLevels.ts`)

`backlogLevels.ts` é removido por completo; `discoverBacklogLevelStates`/`discoverStatusColors`/`buildTypeToBacklogLevel` somem, substituídos pelas funções livres de nível abaixo:

```ts
// src/azureDevOps/discoverWorkItemTypes.ts, novo arquivo
import type { AzureDevOpsClient } from './client';
import { sanitizeSvg } from '../view/sanitizeSvg';

export interface DiscoveredWorkItemType {
  name: string;
  color: string;
  iconSvg: string;
  states: { name: string; category: string; color: string }[];
}

export async function discoverWorkItemTypes(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<DiscoveredWorkItemType[]> {
  const types = await client.listWorkItemTypes(organization, project);
  const result: DiscoveredWorkItemType[] = [];

  for (const type of types) {
    try {
      const [states, iconSvgRaw] = await Promise.all([
        client.listWorkItemTypeStates(organization, project, type.name),
        client.getIconSvg(type.iconUrl),
      ]);
      result.push({ name: type.name, color: type.color, iconSvg: sanitizeSvg(iconSvgRaw), states });
    } catch {
      // One-off failure for a type: continue without it instead of aborting the whole discovery.
    }
  }

  return result;
}

export function discoverStatusesByType(types: DiscoveredWorkItemType[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const type of types) {
    const statuses: Record<string, string> = {};
    for (const state of type.states) {
      statuses[state.name] = state.category;
    }
    if (Object.keys(statuses).length > 0) {
      result[type.name] = statuses;
    }
  }
  return result;
}

export function discoverStatusColors(types: DiscoveredWorkItemType[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const type of types) {
    for (const state of type.states) {
      if (!(state.name in colors)) {
        colors[state.name] = state.color;
      }
    }
  }
  return colors;
}
```

`discoverStatusesByType` substitui `DiscoveredBacklogLevels` (que era `Record<level, Record<status, category>>`) por `Record<type, Record<status, category>>` — mesma forma, chave diferente.

### 3. Cliente (`src/azureDevOps/client.ts`)

Dois novos métodos, dois removidos (`listBacklogLevels` sai; `listWorkItemTypeStates` e `getWorkItemTypeIcon` — este último é substituído por `listWorkItemTypes` + `getIconSvg`, já que o novo endpoint já traz `color`/`icon.url` inline):

```ts
async listWorkItemTypes(organization: string, project: string): Promise<{ name: string; color: string; iconUrl: string }[]> {
  const data = await this.request<{ value: { name: string; color: string; icon?: { url: string }; isDisabled: boolean }[] }>(
    `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes?api-version=7.1`,
  );
  return data.value.filter(t => !t.isDisabled && t.icon?.url).map(t => ({ name: t.name, color: t.color, iconUrl: t.icon!.url }));
}

async getIconSvg(iconUrl: string): Promise<string> {
  return this.requestText(iconUrl);
}

async listTeams(organization: string, project: string): Promise<{ id: string; name: string }[]> {
  const data = await this.request<{ value: { id: string; name: string }[] }>(
    `https://dev.azure.com/${organization}/_apis/projects/${project}/teams?api-version=7.1`,
  );
  return data.value.map(t => ({ id: t.id, name: t.name }));
}
```

`listWorkItemTypeStates` (já existente, já independente de time) permanece sem mudanças. `getDefaultTeamName` permanece (ainda usado como fallback de `defaultTeam` e pelo fluxo `Configure with AI`). `listBacklogLevels`/`getWorkItemTypeIcon` são removidos — nada mais os chama.

### 4. `resolveSkill.ts`

```ts
import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  return config.skills[workItem.type]?.[workItem.status] ?? null;
}
```

### 5. `presetSkillFiles.ts`

Troca "levelName" por "typeName" em toda a função — mesmo formato de arquivo (`{tipo-slug}-{status-slug}.md`), mesmo esqueleto de skill, só o parâmetro de agrupamento muda de nome/significado:

```ts
export interface PresetPlan {
  skills: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

export function buildPresetPlan(
  discovered: Record<string, Record<string, string>>, // [tipo][status] => category
  generateFiles: boolean,
  statusColors: Record<string, string>,
): PresetPlan {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [typeName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, SkillEntry | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${typeName}::${statusName}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(typeName)}-${slugify(statusName)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(typeName, statusName) });
      }
      statusSkills[statusName] = buildStatusSkillEntry(relativePath, statusName, statusColors);
    }

    skills[typeName] = statusSkills;
  }

  return { skills, filesToWrite };
}
```

`skillSkeleton(typeName, statusName)` — mesmo corpo, só o cabeçalho `# Skill: ${typeName} — ${statusName}`.

### 6. `renderConfigEditor.ts`

Troca `config.backlogLevels`/`level` por `config.skills`/`type` — mesma estrutura visual (grupos colapsáveis), só reagrupada por tipo:

```ts
export function renderConfigEditor(config: KanbrainConfig): string {
  const types = Object.keys(config.skills);
  if (types.length === 0) {
    return '<div class="kb-empty">No work item types configured yet.</div>';
  }

  return types
    .map(type => {
      const statuses = config.skills[type];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(type, status, statuses[status], config.statusColors ?? {}))
        .join('');
      return `
        <div class="kb-config-level">
          <button type="button" class="kb-config-level-header" data-action="toggle-group">
            <span class="kb-chevron">▾</span>${escapeHtml(type)}
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

`renderSkillEntryRow(type, status, ...)` — o `data-level="${type}"` no `.kb-config-row` só troca de nome do parâmetro (`level` → `type`), o atributo HTML continua se chamando `data-level` (evita renomear o wiring de mensagens no `KanbrainViewProvider.ts`, que já usa `row.dataset.level`/`message.level` de forma genérica — internamente agora carrega o nome do tipo, não do nível, mas a stack de save/load não precisa saber disso).

### 7. `renderSearchResults.ts`

```ts
export function renderSearchResults(
  items: WorkItem[],
  config: KanbrainConfig,
  typeCounts: Record<string, number>,
  avatars: Record<string, string> = {},
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  const types = Object.keys(config.skills);
  if (types.length === 0) {
    return renderStatusGroups(items, config, avatars);
  }

  const tabs = [
    { id: 'all', label: 'All', count: items.length, items },
    ...types.map(type => ({
      id: type,
      label: type,
      count: typeCounts[type] ?? 0,
      items: items.filter(item => item.type === type),
    })),
  ];

  // ...tabBar/panels iguais, só filtrando por item.type diretamente em vez de config.typeToBacklogLevel[item.type] === level
}
```

`KanbrainViewProvider.fetchBacklogLevelCounts` (renomeado `fetchTypeCounts`) simplifica — não precisa mais agrupar tipos por nível antes de contar, conta direto por tipo:

```ts
private async fetchTypeCounts(client: AzureDevOpsClient, config: KanbrainConfig): Promise<Record<string, number>> {
  const types = Object.keys(config.skills);
  const entries = await Promise.all(
    types.map(async type => [type, await client.countWorkItemsByType(config.organization, config.project, [type])] as const),
  );
  return Object.fromEntries(entries);
}
```

### 8. `checkBoardConfig.ts` (diff simplificado)

```ts
export interface BoardConfigDiff {
  typesAdded: string[];
  typesRemoved: string[];
  statusesAdded: { type: string; status: string }[];
  statusesRemoved: { type: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(config: KanbrainConfig, discovered: Record<string, Record<string, string>>): BoardConfigDiff {
  const typesAdded: string[] = [];
  const typesRemoved: string[] = [];
  const statusesAdded: { type: string; status: string }[] = [];
  const statusesRemoved: { type: string; status: string; skillPath: string | null }[] = [];

  for (const type of Object.keys(config.skills)) {
    if (!(type in discovered)) {
      typesRemoved.push(type);
      continue;
    }
    for (const status of Object.keys(config.skills[type])) {
      if (!(status in discovered[type])) {
        statusesRemoved.push({ type, status, skillPath: config.skills[type][status]?.path ?? null });
      }
    }
  }
  for (const [type, statuses] of Object.entries(discovered)) {
    if (!(type in config.skills)) {
      typesAdded.push(type);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.skills[type])) {
        statusesAdded.push({ type, status });
      }
    }
  }

  return { typesAdded, typesRemoved, statusesAdded, statusesRemoved };
}
```

`isDiffEmpty`/`summarizeDiff` perdem as referências a `typesMoved`/`levelsAdded`/`levelsRemoved`, mantendo o resto igual. `diffBoardConfig` não recebe mais `freshTypeToBacklogLevel` (parâmetro removido — não existe mais).

### 9. `syncConfig.ts`

```ts
export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
): KanbrainConfig {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};

  for (const [type, statuses] of Object.entries(discoveredStatusesByType)) {
    const existingType = config.skills[type] ?? {};
    const merged: Record<string, SkillEntry | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingType ? existingType[status] : null;
    }
    skills[type] = merged;
  }

  for (const [type, statuses] of Object.entries(config.skills)) {
    if (!(type in skills)) {
      skills[type] = { ...statuses };
      continue;
    }
    for (const [status, skill] of Object.entries(statuses)) {
      if (!(status in skills[type])) {
        skills[type][status] = skill;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    showAssignedTo: config.showAssignedTo,
  };
}
```

A lógica de merge é idêntica à anterior (preserva mapeamentos existentes, órfãos incluídos), só trocando "level" por "type" como a chave externa.

### 10. Descoberta multi-time (`src/azureDevOps/discoverCardSettings.ts`)

```ts
export async function discoverCardSettingsByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, Record<string, Record<string, CardFieldSettings>>>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, Record<string, Record<string, CardFieldSettings>>> = {};
  for (const team of teams) {
    try {
      const boards = await client.listBoards(organization, project, team.name);
      const byBoard: Record<string, Record<string, CardFieldSettings>> = {};
      for (const board of boards) {
        try {
          byBoard[board.name] = await client.getCardSettings(organization, project, team.name, board.id);
        } catch {
          // One-off failure for a board: continue without it.
        }
      }
      result[team.name] = byBoard;
    } catch {
      // One-off failure for a team (e.g. no board access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
```

`discoverCardSettingsByBoard` (a versão de um time só) é removida — `discoverCardSettingsByTeam` a substitui por completo, chamando `listTeams` internamente em vez de receber um `team` já resolvido.

### 11. `discoverBoardState.ts` → passa a incluir times e usar a nova descoberta de tipos

```ts
export interface BoardState {
  discoveredStatusesByType: Record<string, Record<string, string>>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  defaultTeam: string;
  cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const defaultTeam = await client.getDefaultTeamName(organization, project);
  const types = await discoverWorkItemTypes(client, organization, project);

  const discoveredStatusesByType = discoverStatusesByType(types);
  const typeColors: Record<string, string> = {};
  const typeIcons: Record<string, string> = {};
  for (const type of types) {
    typeColors[type.name] = type.color;
    typeIcons[type.name] = type.iconSvg;
  }

  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);

  return { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam };
}
```

### 12. `resolveCardFieldVisibility.ts`

```ts
function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedTeam: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const teams = config.cardSettingsByTeam ?? {};
  const team = teams[selectedTeam ?? config.defaultTeam] ?? Object.values(teams)[0];
  if (!team) {
    return false;
  }
  const matches = Object.values(team).filter(byType => workItemType in byType);
  if (matches.length === 0) {
    return false;
  }
  return matches[0][workItemType][field];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}

export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
```

Resolução em duas etapas: primeiro acha o **time** (selecionado, ou `config.defaultTeam`, ou o primeiro time encontrado se nem isso existir — config antigo/incompleto); dentro do time, acha o **board** que tem aquele tipo (primeiro achado, sem desempate exposto). Nunca lança erro — sempre cai em `false` no pior caso.

### 13. Tela Config (`renderConfig.ts`) — dropdown "Team"

```ts
export function renderConfig(state: RenderState): string {
  const config = state.config!;
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  const teamSelectHtml =
    teamNames.length > 1
      ? `
    <label class="kb-select-row">
      Team
      <select id="kb-team-select">
        ${teamNames
          .map(name => `<option value="${escapeHtml(name)}"${name === (state.selectedTeam ?? config.defaultTeam) ? ' selected' : ''}>${escapeHtml(name)}</option>`)
          .join('')}
      </select>
    </label>
  `
      : '';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee in search results
    </label>
    ${teamSelectHtml}
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

`RenderState.selectedBoard` → `RenderState.selectedTeam`. A label do dropdown some de "Board (desempate de campos)" pra simplesmente "Team".

### 14. `KanbrainViewProvider.ts` / `extension.ts`

- `SELECTED_BOARD_KEY` → `SELECTED_TEAM_KEY = 'kanbrain.selectedTeam'`.
- `persistSelectedBoard`/`setSelectedBoard`/`this.selectedBoard` → `persistSelectedTeam`/`setSelectedTeam`/`this.selectedTeam` (mesmo formato, mesmo fluxo, só renomeado).
- Mensagem `set-selected-board`/`kb-board-select` → `set-selected-team`/`kb-team-select`.
- `resolveShowParent(config, workItem.type, this.selectedBoard)` → `resolveShowParent(config, workItem.type, this.selectedTeam)` (idem em `render.ts`/`renderWorkItemCard.ts`, que só trocam o nome do parâmetro que já recebiam).
- `fetchBacklogLevelCounts` → `fetchTypeCounts` (seção 7).

### 15. `setup.ts` / `syncBoardConfig.ts` / `checkBoardConfig.ts` (comandos)

Todos os três passam a chamar a nova forma de `discoverBoardState` (seção 11) e usam `boardState.discoveredStatusesByType`/`boardState.defaultTeam`/`boardState.cardSettingsByTeam` no lugar dos campos antigos. `setup.ts`'s `writeConfig(...)` grava `defaultTeam: boardState.defaultTeam` e `skills: preset.skills` (em vez de `typeToBacklogLevel`/`backlogLevels`). O texto da mensagem de prompt de geração de skills ("Automatically generate placeholder skill files per category...") não muda de comportamento, só o dado subjacente.

### 16. `buildSetupAssistantFile.ts` (Configure with AI — fora do escopo funcional, ajuste de texto)

`renderLevels` é renomeada `renderTypes`, removendo o wrapper `### {level.name}` — cada tipo vira uma seção própria (`### {type.name}`) direto, sem agrupamento de nível. O texto de `buildSetupAssistantContent` que fala em "`backlogLevels` map" passa a falar em "`skills` map (por tipo de work item + status)". O restante (seção de boards/colunas, instruções ao agente) não muda.

## Tratamento de erros

- `discoverWorkItemTypes`: falha isolada por tipo (states ou ícone) não aborta os demais — mesmo padrão try/catch já usado.
- `discoverCardSettingsByTeam`: falha isolada por time (ex: sem acesso a um time específico) não aborta os demais times; falha isolada por board dentro de um time não aborta os demais boards daquele time.
- `resolveShowParent`/`resolveShowAssignedTo`: nunca lançam — cascata de fallback (time selecionado → `defaultTeam` → primeiro time encontrado → `false`) sempre resolve pra um booleano.
- `.kanbrain/config.json` de uma versão anterior (com `backlogLevels`/`typeToBacklogLevel`/`cardSettingsByBoard` antigos): não há migração automática — rodar `Kanbrain: Sync Board Configuration` sobrescreve com a nova forma (`skills`/`cardSettingsByTeam`), igual já acontece hoje pra outros campos "sempre frescos" (`typeColors`/`typeIcons`). Configs muito antigos podem precisar de um `Kanbrain: Setup` completo se o arquivo ficar com um shape misto/inconsistente — não crítico, mas vale mencionar no checklist manual.

## Testes

- `src/azureDevOps/discoverWorkItemTypes.test.ts` (novo, substitui `backlogLevels.test.ts`): `discoverWorkItemTypes` monta um `DiscoveredWorkItemType[]` a partir de tipos+estados+ícone mockados, tolerando falha isolada por tipo; `discoverStatusesByType`/`discoverStatusColors` fazem o mesmo agrupamento que os testes antigos faziam por nível, agora por tipo.
- `src/azureDevOps/client.test.ts`: novos casos para `listWorkItemTypes` (filtra `isDisabled`, mapeia `color`/`icon.url`), `getIconSvg`, `listTeams`. Remove os casos de `listBacklogLevels`/`getWorkItemTypeIcon`.
- `src/config/resolveSkill.test.ts`: reescrito pra `config.skills[type][status]`, sem nível.
- `src/skills/presetSkillFiles.test.ts`: reescrito trocando "level" por "type" nos nomes/asserts, mesma cobertura de casos (categoria final vira `null`, `generateFiles: false` vira tudo `null`, path reaproveitado pro mesmo tipo+status).
- `src/view/renderConfigEditor.test.ts`: reescrito pra `config.skills`, grupos por tipo.
- `src/view/renderSearchResults.test.ts`: abas por tipo em vez de nível.
- `src/azureDevOps/checkBoardConfig.test.ts`: reescrito pro diff simplificado (sem `typesMoved`/`levelsAdded`/`levelsRemoved`).
- `src/config/syncConfig.test.ts`: reescrito pra `skills`, incluindo os novos parâmetros `freshDefaultTeam`/`freshCardSettingsByTeam`.
- `src/azureDevOps/discoverCardSettings.test.ts`: reescrito pra `discoverCardSettingsByTeam`, cobrindo múltiplos times, time que falha isolado, time sem boards.
- `src/azureDevOps/discoverBoardState.test.ts`: reescrito pro novo `BoardState` (sem `levels`/`statesByType`, com `discoveredStatusesByType`/`defaultTeam`/`cardSettingsByTeam`).
- `src/config/resolveCardFieldVisibility.test.ts`: reescrito pra `selectedTeam`, cobrindo fallback pra `defaultTeam` e pro primeiro time quando nem isso existe.
- `src/view/renderConfig.test.ts`: dropdown "Team" (ausente com 0/1 time, presente com 2+), opção marcada batendo com `state.selectedTeam ?? config.defaultTeam`.
- Todos os fixtures de `KanbrainConfig` usados em testes (11+ arquivos, ver seção "Riscos técnicos") precisam trocar `typeToBacklogLevel`/`backlogLevels` por `skills`/`defaultTeam` — sem isso o build quebra (`tsc` cobre `src/**/*.ts` fora de `*.test.ts`, mas os `.test.ts` também precisam compilar via vitest/esbuild em runtime, que não tipa mas falha se o objeto não tiver os campos que o código sob teste efetivamente lê).
- Sem teste dedicado pra `KanbrainViewProvider.ts`/`extension.ts` (mesmo padrão de sempre, acoplado à API do VS Code) — verificado via `npm run compile` + suíte completa + checklist manual.
- **Reforçando o risco técnico:** validar manualmente (F5) contra um projeto Azure DevOps real com múltiplos times antes de considerar pronto — `listWorkItemTypes`/`listTeams` nunca foram chamados de verdade nesta sessão.
