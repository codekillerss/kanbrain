# Preset de skills por backlog level — Design

## Contexto e motivação

Hoje `Kanbrain: Setup` cria `.kanbrain/config.json` com um `statusSkills` vazio — o usuário precisa descobrir manualmente quais estados existem no processo do projeto e escrever o mapa status→skill à mão. Isso é lento e ignora que o Azure DevOps já expõe essa estrutura: cada processo (Scrum, Agile, CMMI, Basic ou customizado) organiza os work item types em **backlog levels** (Epics, Features, Stories/Backlog, Tasks) e cada estado de cada tipo pertence a uma **state category** normalizada (Proposed, InProgress, Resolved, Completed, Removed).

Este design adiciona, ao próprio `Kanbrain: Setup`, um passo que busca essa estrutura real do projeto Azure DevOps do usuário e usa para pré-popular `config.json` — opcionalmente já gerando arquivos de skill placeholder por categoria dentro de cada backlog level.

## Escopo

**Dentro do escopo:**
- Descoberta de backlog levels e work item types via API do Azure DevOps (`_apis/work/backlogs`).
- Descoberta de estados + categoria por work item type (`_apis/wit/workitemtypes/{type}/states`).
- Mudança do schema de `.kanbrain/config.json`: `statusSkills` (mapa único global) é substituído por `backlogLevels` (mapa por nível) + `typeToBacklogLevel` (mapa tipo→nível). Sem retrocompatibilidade — projeto pré-1.0, sem usuários em produção.
- `Kanbrain: Setup` passa a sempre descobrir e gravar `typeToBacklogLevel` + o esqueleto de `backlogLevels`, e a perguntar (QuickPick Sim/Não) se deve gerar arquivos de skill placeholder por categoria automaticamente.
- Runtime (`render.ts`, `KanbrainViewProvider.runSkill`) passa a resolver a skill de um work item por `typeToBacklogLevel[workItem.type]` → `backlogLevels[nível][workItem.status]`, via uma função pura compartilhada.

**Fora do escopo:**
- UI para o usuário reordenar/renomear backlog levels dentro da extensão — a nomenclatura vem direto do Azure DevOps.
- Edição do preset gerado via UI da webview — segue sendo edição manual do `config.json` e dos arquivos `.md`, como hoje.
- Suporte a organizações com múltiplos processos por projeto (não existe no Azure DevOps — 1 processo por projeto).

## Arquitetura

### Descoberta de backlog levels e categorias

Novo módulo `src/azureDevOps/backlogLevels.ts`:
- `AzureDevOpsClient` ganha dois métodos novos:
  - `listBacklogLevels(organization, project)` → `GET /_apis/work/backlogs?api-version=7.1`, retorna `{ name: string, workItemTypes: string[] }[]`. Níveis com `isHidden: true` ou `workItemTypes` vazio na resposta da API são descartados nesse método (não aparecem no retorno).
  - `listWorkItemTypeStates(organization, project, type)` → `GET /_apis/wit/workitemtypes/{type}/states?api-version=7.1`, retorna `{ name: string, category: string }[]`. `category` é um dos 5 valores fixos do Azure DevOps (`Proposed`, `InProgress`, `Resolved`, `Completed`, `Removed`) — não é customizável pelo usuário, só o nome do estado (`name`) é.
- Função pura `discoverBacklogLevelStates(levels, statesByType): DiscoveredBacklogLevels`, onde `DiscoveredBacklogLevels = Record<levelName, Record<statusName, category>>`, unindo os estados de todos os tipos de um mesmo nível. Recebe os dados já buscados (não faz I/O) — testável com fixtures, sem mock de rede.
- Função pura `buildTypeToBacklogLevel(levels): Record<typeName, levelName>`.

### Preset de skills (arquivos + valores do config)

Novo módulo `src/skills/presetSkillFiles.ts`:
- `buildPresetPlan(discovered: DiscoveredBacklogLevels, generateFiles: boolean): PresetPlan`, onde:
  ```ts
  interface PresetPlan {
    backlogLevels: Record<string, Record<string, string | null>>;
    filesToWrite: { relativePath: string; content: string }[];
  }
  ```
- Regra: para cada nível, para cada categoria presente nos estados desse nível:
  - `Completed` e `Removed` → todo status dessa categoria mapeia pra `null`, independente de `generateFiles`.
  - `Proposed`, `InProgress`, `Resolved` → se `generateFiles` for `true`, gera `skills/<nivel-slug>-<categoria-slug>.md` com um skeleton de template (mesmos placeholders documentados no README) e todo status daquela categoria aponta pro mesmo arquivo; se `false`, todo status daquela categoria mapeia pra `null` (usuário preenche depois).
  - Slug: nome do nível e nome da categoria em minúsculas, espaços removidos (ex: nível "Stories" → `stories`; categoria "InProgress" → `inprogress`). Arquivo final: `skills/stories-inprogress.md`.
- Função pura, sem `fs` — quem escreve os arquivos é o `setup.ts` (efeito colateral fica isolado ali, como já é hoje pra `writeConfig`/`ensureGitignoreEntry`).

### Setup command

`src/commands/setup.ts`, depois de escolher org/projeto (fluxo atual inalterado até aqui):
1. Busca backlog levels (`listBacklogLevels`) e, para cada work item type único encontrado, os estados (`listWorkItemTypeStates`).
2. `discoverBacklogLevelStates` + `buildTypeToBacklogLevel` montam a estrutura.
3. QuickPick: **"Gerar arquivos de skill placeholder automaticamente por categoria (Proposed/InProgress/Resolved)?"** (Sim/Não).
4. `buildPresetPlan(discovered, respostaFoiSim)` → grava os `filesToWrite` em `.kanbrain/skills/` (só os que ainda não existem, mesma lógica de não sobrescrever que hoje existe pro `example.md`) e usa `backlogLevels` resultante no `config.json`.
5. `writeConfig` grava `{ organization, project, backlogLevels, typeToBacklogLevel }`.

Resto do fluxo (mensagem de sucesso, `.gitignore`) inalterado.

### Runtime — resolução da skill

Novo módulo puro `src/config/resolveSkillPath.ts`:
```ts
function resolveSkillPath(config: KanbrainConfig, workItem: WorkItem): string | null {
  const level = config.typeToBacklogLevel[workItem.type];
  if (!level) return null;
  return config.backlogLevels[level]?.[workItem.status] ?? null;
}
```
Usado em:
- `src/view/render.ts` (`renderActionButton`), substituindo `config.statusSkills[workItem.status]`.
- `src/view/KanbrainViewProvider.ts` (`runSkill`), mesma substituição.

Work item de um tipo fora de qualquer backlog level (tipo customizado oculto, ex. "Impediment") simplesmente não tem `level` → sem botão de ação, mesmo comportamento de hoje para status sem skill mapeada.

### Schema final do `config.json`

```json
{
  "organization": "minha-org",
  "project": "MeuProjeto",
  "typeToBacklogLevel": {
    "Epic": "Epics",
    "User Story": "Stories",
    "Bug": "Stories",
    "Task": "Tasks"
  },
  "backlogLevels": {
    "Epics": { "New": "skills/epics-proposed.md", "In Progress": "skills/epics-inprogress.md", "Done": null },
    "Stories": { "New": "skills/stories-proposed.md", "Approved": "skills/stories-proposed.md", "Committed": "skills/stories-inprogress.md", "Done": null, "Removed": null },
    "Tasks": { "To Do": "skills/tasks-proposed.md", "In Progress": "skills/tasks-inprogress.md", "Done": null }
  }
}
```

## Tratamento de erros

- Chamada às APIs de backlog levels/states falha (permissão insuficiente, projeto sem processo configurado): Setup mostra `showErrorMessage` com o motivo e aborta antes de escrever `config.json` — não deixa um config parcialmente preenchido.
- Backlog level sem nenhum work item type visível (nível oculto no processo): ignorado na descoberta, não aparece em `backlogLevels`.
- Work item type que não retorna estados (erro pontual da API pra aquele tipo): esse tipo fica de fora do `typeToBacklogLevel` — melhor um tipo faltando do que abortar o Setup inteiro.

## Testes

- `src/azureDevOps/backlogLevels.test.ts`: `discoverBacklogLevelStates` e `buildTypeToBacklogLevel` com fixtures representando Scrum (Epics/Features/Stories/Tasks) e um caso com tipos customizados.
- `src/skills/presetSkillFiles.test.ts`: `buildPresetPlan` — categorias finais viram `null`, categorias intermediárias geram arquivo único compartilhado entre status da mesma categoria, comportamento com `generateFiles: false`.
- `src/config/resolveSkillPath.test.ts`: lookup por tipo+status, tipo fora de `typeToBacklogLevel`, nível sem entrada pro status.
- `src/view/render.test.ts`: atualizado pro novo schema de `RenderState`/`KanbrainConfig` (fixtures de config com `backlogLevels`/`typeToBacklogLevel` em vez de `statusSkills`).
- `src/commands/setup.ts` continua sem teste unitário direto (orquestração vscode-heavy, mesmo padrão já usado no projeto) — coberto pela checklist de verificação manual no README.

## Impacto em documentação

`README.md` é atualizado: seção "Setup" descreve o novo passo de preset automático, e o exemplo de `config.json` reflete o novo schema (`backlogLevels`/`typeToBacklogLevel` em vez de `statusSkills`). A checklist de verificação manual ganha itens novos para o passo de preset.
