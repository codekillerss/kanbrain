# Always show assignee for Task-backlog work items — Design

## Contexto e motivação

Investigação extensa nesta sessão (conversa completa, com testes reais contra a organização do usuário) confirmou que `resolveShowAssignedTo` nunca consegue refletir a config real de "Show Assigned To" do Sprint Taskboard pros tipos do backlog level de Tasks:

- `cardSettingsByTeam` vem de `_apis/work/boards/{board}/cardsettings`, que só cobre boards Kanban retornados por `_apis/work/boards` — e esses são só os backlog levels de Portfolio/Requirement (Epic/Feature/Story/Issue/PBI, a depender do processo). O backlog level de Tasks nunca aparece nessa lista.
- A tela que configura os campos do card de Task (Sprints > Taskboard > Settings > Fields) é uma superfície totalmente separada, sem "board id" — confirmado na doc oficial: "the system creates a taskboard for every sprint you select for that team" (não é um recurso persistente como o board Kanban).
- `PUT .../_apis/work/taskboard/cardsettings` existe e escreve essa config, mas **não tem `GET` correspondente** — confirmado (a) na lista de operações do grupo `Cardsettings` da Work REST API pública, (b) no código-fonte do SDK oficial `microsoft/azure-devops-extension-api` (`WorkClient.ts`, só tem `updateTaskboardCardSettings`), e (c) empiricamente: um `GET` real nessa mesma URL, contra a organização do usuário, retornou `"The requested resource does not support http method 'GET'."`.
- A única leitura real que existe é via `_apis/Contribution/HierarchyQuery` (infraestrutura interna, não documentada, sem `api-version`, sem contrato de compatibilidade, atrelada ao conceito de "sprint/iteration atual" que o Kanbrain não modela) — usar isso numa extensão publicada é um risco de quebra silenciosa considerado alto demais pra esse ganho.

Dado que não há caminho de leitura sustentável, a saída é a mesma já usada pro campo Parent antes da faixa incondicional substituí-lo: sempre mostrar o assignee, incondicionalmente, pros tipos do backlog level de Tasks — trocando fidelidade ao board real (impossível de obter aqui) por uma UX consistente (o card sempre mostra quem está com aquele Task, que é informação de alto valor prático).

## Escopo

**Dentro do escopo:**
- Reintroduz a infraestrutura de `taskBacklogTypesByTeam` (removida no commit `ba3304c`, quando a feature equivalente pro Parent foi revertida — superseded pela faixa incondicional do parent banner), agora aplicada ao **assignedTo**, não ao parent:
  - `AzureDevOpsClient.getTaskBacklogWorkItemTypes(organization, project, team)`: `GET .../{team}/_apis/work/backlogconfiguration?api-version=7.1`, extrai `taskBacklog.workItemTypes[].name`.
  - `discoverTaskBacklogTypesByTeam(client, organization, project)` (novo `src/azureDevOps/discoverTaskBacklogTypes.ts`): por time, com try/catch individual (mesmo padrão de `discoverCardSettingsByTeam`).
  - `BoardState`/`KanbrainConfig` ganham `taskBacklogTypesByTeam: Record<string, string[]>` (opcional em `KanbrainConfig`, igual outros campos discovery-only).
  - `discoverBoardState.ts`, `setup.ts`, `syncConfig.ts`, `syncBoardConfig.ts`: wiring padrão, replace completo a cada sync (mesma política de `cardSettingsByTeam`).
- `resolveShowAssignedTo` (`src/config/resolveCardFieldVisibility.ts`) passa a checar `taskBacklogTypesByTeam` do time resolvido **antes** de `resolveCardField` — se o tipo estiver lá, retorna `true` incondicionalmente; senão, cai no comportamento atual (espelha `cardSettingsByTeam`, `false` se ausente).

**Fora do escopo:**
- `resolveShowParent` — já tem sua própria solução (faixa incondicional do parent banner na tela Flow), não precisa dessa infraestrutura de novo. A linha "Parent: #id" inline dentro do card (`renderParentRow`, via `resolveShowParent`) tecnicamente tem a mesma limitação de dados pro backlog de Tasks, mas isso não foi pedido nesta sessão — fica pra uma spec futura se fizer falta.
- Qualquer chamada a `_apis/Contribution/HierarchyQuery` ou outro endpoint não documentado — decisão explícita de não depender de infraestrutura interna sem contrato.
- Migração de configs existentes: mesmo padrão de qualquer campo discovery-only novo — `taskBacklogTypesByTeam` fica ausente até o próximo Setup/Sync, sem quebrar (`resolveShowAssignedTo` cai no comportamento atual quando ausente).

## Design

### `client.ts`

```ts
async getTaskBacklogWorkItemTypes(organization: string, project: string, team: string): Promise<string[]> {
  const data = await this.request<{ taskBacklog?: { workItemTypes?: { name: string }[] } }>(
    `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/backlogconfiguration?api-version=7.1`,
  );
  return (data.taskBacklog?.workItemTypes ?? []).map(t => t.name);
}
```

### `discoverTaskBacklogTypes.ts` (novo)

```ts
import type { AzureDevOpsClient } from './client';

export async function discoverTaskBacklogTypesByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, string[]>> {
  const teams = await client.listTeams(organization, project);
  const result: Record<string, string[]> = {};
  for (const team of teams) {
    try {
      result[team.name] = await client.getTaskBacklogWorkItemTypes(organization, project, team.name);
    } catch {
      // One-off failure for a team (e.g. no access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
```

### `discoverBoardState.ts`

`BoardState` ganha `taskBacklogTypesByTeam: Record<string, string[]>`; `discoverBoardState()` chama `discoverTaskBacklogTypesByTeam` ao lado de `discoverCardSettingsByTeam`.

### `types.ts`

```ts
export interface KanbrainConfig {
  // ...campos existentes
  taskBacklogTypesByTeam?: Record<string, string[]>;
}
```

### `setup.ts` / `syncConfig.ts` / `syncBoardConfig.ts`

Mesmo wiring que `cardSettingsByTeam` já tem hoje — `setup.ts` inclui `taskBacklogTypesByTeam` direto de `boardState` no `writeConfig`; `syncConfig.ts` ganha um novo parâmetro `freshTaskBacklogTypesByTeam` que sempre substitui; `syncBoardConfig.ts` passa `boardState.taskBacklogTypesByTeam`.

### `resolveCardFieldVisibility.ts`

```ts
export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  const taskBacklogTypes = (teamName && config.taskBacklogTypesByTeam?.[teamName]) ?? [];
  if (taskBacklogTypes.includes(workItemType)) {
    return true;
  }
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
```

`resolveShowParent` não muda.

## Tratamento de erros

- `getTaskBacklogWorkItemTypes` sem `taskBacklog`/`workItemTypes` na resposta: retorna `[]`, não lança.
- Falha de rede/permissão por time: `discoverTaskBacklogTypesByTeam` pula esse time, não aborta a descoberta inteira.
- `config.taskBacklogTypesByTeam` ausente ou vazio pro time resolvido: `resolveShowAssignedTo` cai no comportamento atual (`resolveCardField`), sem quebrar configs sincronizados antes desta feature.

## Testes

- `client.test.ts`: `getTaskBacklogWorkItemTypes` extrai os nomes; resposta sem `taskBacklog` retorna `[]`.
- `discoverTaskBacklogTypes.test.ts` (novo): coleta por time; pula time que falha; retorna `{}` sem times.
- `discoverBoardState.test.ts`: `taskBacklogTypesByTeam` populado ao lado de `cardSettingsByTeam`.
- `syncConfig.test.ts`: novo parâmetro sempre substitui o valor anterior.
- `resolveCardFieldVisibility.test.ts`: `resolveShowAssignedTo` retorna `true` quando o tipo está em `taskBacklogTypesByTeam` do time resolvido, mesmo que `cardSettingsByTeam` diga `assignedTo: false`; cai no comportamento atual quando ausente; `resolveShowParent` inalterado (regressão).
