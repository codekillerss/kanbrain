# Always show parent for Task-backlog work items — Design

## Contexto e motivação

Hoje, se um card do backlog level de Tasks deve exibir o parent é decidido só por `resolveShowParent` (`src/config/resolveCardFieldVisibility.ts`), que espelha o toggle "Parent" configurado em **Board Settings > Fields** do board correspondente (`cardSettingsByTeam`, discovery via `_apis/work/boards`/`cardsettings`). Só que esse toggle é o mesmo usado para qualquer board (Stories/Features/Epics) — não existe hoje um conceito de "isto é o backlog level de Tasks" independente disso, e nem sempre o time configurou esse toggle como ligado para Tasks.

O usuário quer que, especificamente para o backlog level de Tasks, o parent **sempre** apareça, incondicionalmente — porque no Sprint/Taskboard real do Azure, os itens desse nível já vêm organizados em lanes separadas por parent; sem essa informação no card do Kanbrain, o contexto "de qual User Story/Issue/PBI/Requirement esta Task faz parte" se perde.

**Pesquisa feita nesta sessão** (ver mensagens anteriores, com fontes da documentação oficial da Microsoft):
- O board "Tasks" via `_apis/work/boards` **não existe em nenhum processo** — esse endpoint só retorna boards de Portfolio (Epics/Features) e do Requirement backlog (Stories/Issues/PBI/Requirement). O backlog level de Tasks é o **Iteration/Sprint backlog**, exposto por um endpoint totalmente diferente.
- O endpoint correto é `GET https://dev.azure.com/{organization}/{project}/{team}/_apis/work/backlogconfiguration?api-version=7.1`, cujo campo `taskBacklog.workItemTypes[]` lista exatamente os tipos de work item daquele backlog level, para aquele time — **dinamicamente resolvido**, não hardcoded.
- Confirmado pela tabela oficial de comparação de processos: em Basic, Agile, Scrum e CMMI, o tipo do Task backlog é sempre **"Task"** (mais **"Bug"**, opcionalmente, se o time configurou "bugs behavior" = `asTasks`). Os níveis acima (Epic/Feature/Requirement) variam em quantidade e nome do tipo por processo, mas o nível de Task não.
- Ler `taskBacklog.workItemTypes[].name` em vez de hardcodar `"Task"` cobre tanto esse caso do Bug-as-task quanto processos customizados que renomeiam o backlog ou adicionam um tipo extra ali (ex: um "Ticket" customizado) — sem precisar assumir nada sobre a estrutura de níveis acima.

## Escopo

**Dentro do escopo:**
- Novo método no client (`AzureDevOpsClient.getTaskBacklogWorkItemTypes`) chamando o endpoint `backlogconfiguration`.
- Novo módulo de discovery (`discoverTaskBacklogTypesByTeam`), mesmo padrão de `discoverCardSettingsByTeam` (por time, com try/catch individual).
- Novo campo `taskBacklogTypesByTeam` em `BoardState` e em `KanbrainConfig`, salvo em `.kanbrain/config.json` pelo Setup e sempre atualizado pelo Sync Board Configuration — mesmo tratamento de `cardSettingsByTeam`.
- `resolveShowParent` passa a retornar `true` incondicionalmente quando o tipo do work item está nesse backlog level de Task para o time resolvido, antes de sequer olhar `cardSettingsByTeam`.
- Afeta todos os cards renderizados por `renderWorkItemCard` (Flow: card principal e filhos; Home), já que todos passam por `resolveShowParent`.

**Fora do escopo:**
- `resolveShowAssignedTo` — sem mudança, continua só espelhando o board.
- Qualquer UI nova para configurar isso manualmente — é sempre incondicional quando o tipo está no task backlog, sem toggle.
- Migração de configs já existentes: `taskBacklogTypesByTeam` fica opcional (`?`) em `KanbrainConfig`; configs antigas sem esse campo simplesmente não têm o override até rodar Setup ou Sync novamente (mesmo padrão que qualquer novo campo discovery-only já tem hoje, sem necessidade de um migration script).

**Risco técnico a declarar:** o formato exato da resposta de `backlogconfiguration` foi confirmado via documentação oficial (exemplo de resposta real da Microsoft, com `taskBacklog.workItemTypes[].name`), mas não via uma chamada real nesta sessão contra um projeto Azure DevOps de verdade — vale validar com F5 contra um projeto real (idealmente testando em mais de um tipo de processo, se disponível) antes de considerar pronto.

## Design

### 1. Cliente (`src/azureDevOps/client.ts`)

```ts
async getTaskBacklogWorkItemTypes(organization: string, project: string, team: string): Promise<string[]> {
  const data = await this.request<{ taskBacklog?: { workItemTypes?: { name: string }[] } }>(
    `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/backlogconfiguration?api-version=7.1`,
  );
  return (data.taskBacklog?.workItemTypes ?? []).map(t => t.name);
}
```

### 2. Discovery (`src/azureDevOps/discoverTaskBacklogTypes.ts`, novo arquivo)

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

### 3. `discoverBoardState.ts`

`BoardState` ganha `taskBacklogTypesByTeam: Record<string, string[]>`; `discoverBoardState()` chama `discoverTaskBacklogTypesByTeam` ao lado de `discoverCardSettingsByTeam` e inclui no objeto retornado.

### 4. `types.ts`

```ts
export interface KanbrainConfig {
  // ...campos existentes
  taskBacklogTypesByTeam?: Record<string, string[]>;
}
```

### 5. `setup.ts` e `syncConfig.ts`/`syncBoardConfig.ts`

`setup.ts`: destructura `taskBacklogTypesByTeam` de `boardState` e inclui no objeto passado para `writeConfig(...)`.

`syncConfig.ts`: novo parâmetro `freshTaskBacklogTypesByTeam: Record<string, string[]>`, sempre substitui (mesma política de "always replace" que `cardSettingsByTeam` já tem — comentário existente "always replaces derived fields with the fresh values" se aplica aqui também):

```ts
export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
  freshTaskBacklogTypesByTeam: Record<string, string[]>,
): KanbrainConfig {
  // ...
  return {
    // ...campos existentes
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
  };
}
```

`syncBoardConfig.ts`: passa `boardState.taskBacklogTypesByTeam` como novo argumento na chamada de `syncConfig(...)`.

### 6. `resolveCardFieldVisibility.ts`

Extrai a resolução de time (hoje inline em `resolveCardField`) para uma função compartilhada, e `resolveShowParent` verifica o task backlog antes de tudo:

```ts
function resolveTeamName(config: KanbrainConfig, selectedTeam: string | undefined): string | undefined {
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  if (teamNames.length === 0) {
    return undefined;
  }
  return selectedTeam && teamNames.includes(selectedTeam) ? selectedTeam : teamNames.includes(config.defaultTeam) ? config.defaultTeam : teamNames[0];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  const taskBacklogTypes = (teamName && config.taskBacklogTypesByTeam?.[teamName]) ?? [];
  if (taskBacklogTypes.includes(workItemType)) {
    return true;
  }
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}
```

`resolveCardField` continua como está (usada por `resolveShowAssignedTo` também) — a única mudança nele é que sua própria resolução de time interna passa a reaproveitar `resolveTeamName` em vez de repetir a lógica inline, para não ter duas cópias da mesma cadeia de fallback.

## Tratamento de erros

- `getTaskBacklogWorkItemTypes` sem `taskBacklog` ou `workItemTypes` na resposta: retorna `[]` (não lança).
- Falha de rede/permissão para um time específico: `discoverTaskBacklogTypesByTeam` pula esse time (try/catch), mesmo padrão de `discoverCardSettingsByTeam` — não aborta a descoberta inteira.
- `config.taskBacklogTypesByTeam` ausente (config sincronizado antes desta feature) ou vazio para o time resolvido: `resolveShowParent` cai no comportamento atual (`resolveCardField`), sem quebrar.

## Testes

- `client.test.ts`: `getTaskBacklogWorkItemTypes` — extrai os nomes de `taskBacklog.workItemTypes`; resposta sem `taskBacklog` retorna `[]`.
- `discoverTaskBacklogTypes.test.ts` (novo): coleta por time; pula time que falha, mantendo os outros; retorna `{}` quando não há times.
- `discoverBoardState.test.ts`: `taskBacklogTypesByTeam` populado a partir da nova descoberta, ao lado de `cardSettingsByTeam`.
- `syncConfig.test.ts`: novo parâmetro sempre substitui o valor anterior (mesmo padrão do teste existente para `cardSettingsByTeam`).
- `resolveCardFieldVisibility.test.ts`: `resolveShowParent` retorna `true` quando o tipo está em `taskBacklogTypesByTeam` do time resolvido, **mesmo que** `cardSettingsByTeam` diga `parent: false` para esse tipo/board; retorna o valor de `cardSettingsByTeam` quando o tipo não está no task backlog; cai no comportamento atual quando `taskBacklogTypesByTeam` está ausente; resolução de time (selected > default > primeiro) continua idêntica para esse novo caminho.
- Sem teste dedicado para `setup.ts`/`syncBoardConfig.ts` (comandos VS Code, sem suíte de teste hoje — consistente com o resto do arquivo) — verificado via `npm run compile` + F5.
