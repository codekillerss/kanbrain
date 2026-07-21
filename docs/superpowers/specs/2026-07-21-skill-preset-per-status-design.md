# Preset de skills por status individual — Design

## Contexto e motivação

`buildPresetPlan` (`src/skills/presetSkillFiles.ts`), usado por `Kanbrain: Setup` e `Kanbrain: Sync Board Config`, hoje agrupa os estados de cada backlog level pela **state category** normalizada do Azure DevOps (`Proposed`/`InProgress`/`Resolved`) — múltiplos estados literais que compartilham a mesma categoria (ex.: "Prototype", "Ready for dev", "Doing" todos em `InProgress`) acabam apontando pro mesmo arquivo `.md` e pro mesmo label de botão (`"{level} — {category}"`).

Na prática isso obriga o usuário a editar manualmente o `config.json` depois do preset pra separar o comportamento de cada estado, já que states diferentes de um mesmo fluxo quase sempre pedem instruções de skill diferentes. Este design muda o preset pra gerar uma skill por status desde o início.

## Escopo

**Dentro do escopo:**
- `buildPresetPlan` passa a agrupar por `level + status` em vez de `level + category`: cada status vira seu próprio arquivo `.md`, sua própria entrada de `config.json` e seu próprio label de botão.
- `category` continua sendo usado — só que exclusivamente pra decidir se o status é final (`Completed`/`Removed` → `null`, sem arquivo, mesmo comportamento de hoje).
- Novo formato de label: `"Execute {status} skill"` (ex.: "Execute Prototype skill", "Execute Doing skill") — sem o nome do backlog level nem da categoria.
- Novo path: `.kanbrain/skills/{slugify(level)}-{slugify(status)}.md` (ex.: `stories-prototype.md`, `stories-doing.md`).
- Novo cabeçalho do skeleton gerado: `# Skill: {level} — {status}` (mantém o level só como contexto dentro do conteúdo do arquivo — útil quando dois levels têm um status de mesmo nome, ex. "New" em Stories e em Tasks — mas não aparece no botão).
- `buttonColor` continua vindo de `statusColors[status]`, sem mudança (já era por status individual).

**Fora do escopo:**
- Mudança em `resolveSkill.ts`/runtime — já resolve por status literal, não muda.
- Migração automática de `config.json` já existentes (ex.: o deste próprio repositório, que tem status agrupados por categoria) — quem já rodou Setup antes mantém o que já tem; o novo agrupamento vale só pra próximas execuções de Setup/Sync que gerem preset novo.
- UI de edição do preset — segue sendo edição manual do `config.json`/arquivos `.md`, como hoje.

## Arquitetura

### `src/skills/presetSkillFiles.ts`

- `skillSkeleton(levelName, category)` → renomeia o segundo parâmetro pra `statusName` e ajusta o cabeçalho: `# Skill: ${levelName} — ${statusName}`.
- `buildStatusSkillEntry(relativePath, levelName, category, statusName, statusColors)` → o `label` deixa de ser `` `${levelName} — ${category}` `` e passa a ser `` `Execute ${statusName} skill` ``. Os parâmetros `levelName`/`category` deixam de ser necessários pro label (mas `category` segue necessário no chamador, `buildPresetPlan`, pra checar `FINAL_CATEGORIES`).
- `buildPresetPlan`: a chave de agrupamento (`pathByKey`) muda de `` `${levelName}::${category}` `` pra `` `${levelName}::${statusName}` ``, e o path gerado muda de `` `${slugify(levelName)}-${slugify(category)}.md` `` pra `` `${slugify(levelName)}-${slugify(statusName)}.md` ``. Como a chave agora já é única por status dentro de um level, `pathByKey` continua existindo (evita path duplicado se, por algum motivo, dois status normalizarem pro mesmo slug) mas na prática cada status gera seu próprio arquivo.
- Resto da função (checagem de `FINAL_CATEGORIES`, `generateFiles`) inalterado.

### Sem mudança em

- `resolveSkill.ts`, `mapWorkItem.ts`, `renderWorkItemCard.ts` — já resolvem/exibem por status literal.
- `syncConfig.ts` — já mescla por chave de status, independente de como o preset agrupou.
- `discoverBacklogLevelStates`/`backlogLevels.ts` — a descoberta de states+categoria continua igual; só o consumo em `presetSkillFiles.ts` muda.

## Tratamento de erros

Nenhuma mudança de tratamento de erro — `buildPresetPlan` continua uma função pura sem I/O, mesmas garantias de hoje (states em categoria final sempre `null`; `generateFiles: false` sempre `null` sem escrever arquivo).

## Testes

`src/skills/presetSkillFiles.test.ts` — atualiza os casos existentes que hoje esperam agrupamento por categoria:
- Dois status na mesma categoria (ex. "New" e "Approved", ambos `Proposed`) passam a gerar **dois arquivos distintos** (`stories-new.md`, `stories-approved.md`), não mais um único compartilhado.
- Label passa a ser `"Execute {status} skill"` (ex.: `"Execute New skill"`, `"Execute In Progress skill"`), substituindo as asserções atuais de `"{level} — {category}"`.
- Mantém: `Completed`/`Removed` → `null` independente de `generateFiles`; `generateFiles: false` → tudo `null`, nenhum arquivo escrito; `buttonColor`/`textColor` por status (já coberto, sem mudança).

## Impacto em documentação

`README.md`:
- Linha ~13 (fluxo de Setup): troca "generate placeholder skill files automatically for each category (Proposed/InProgress/Resolved)" por "...for each individual status", e "one skill file per backlog level + category" por "...per backlog level + status".
- Linha ~57-58 (checklist manual): mesma troca de "categoria" por "status individual"; exemplo de contagem de arquivos gerados deixa de citar categorias.
- Linha ~86 (checklist manual, Config screen): label de exemplo troca de `"{backlog level} — {category}"` pra `"Execute {status} skill"`.
