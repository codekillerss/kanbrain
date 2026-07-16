# AI Setup Assistant — Design

## Contexto e motivação

Hoje, `.kanbrain/config.json` mapeia skills por **status** (`System.State`), um mapa por backlog level. Isso é uma escolha de design deliberada e correta pro que o Kanbrain observa via API — mas muitos times, na prática, pensam e trabalham por **coluna do board Kanban**, não por status diretamente. Uma coluna pode agrupar vários status, ou ter um nome que não bate com nenhum status. Isso é comum e legítimo, e o usuário recém-instalado pode não saber que existe essa diferença nem como isso afeta a forma de configurar o Kanbrain.

Esta mudança adiciona um comando que gera um arquivo de contexto rico — reaproveitando o mesmo mecanismo já usado pelos botões de skill (escrever um arquivo em `.kanbrain/generated/` e mandar um agente no terminal lê-lo) — explicando essa diferença, apresentando os dados reais do projeto (processo **e**, pela primeira vez, as colunas do board), e instruindo o agente a perguntar ao usuário como ele quer que funcione, e então ajudá-lo a configurar a extensão (e, se quiser, o próprio board da Azure DevOps, usando as ferramentas do próprio agente).

## Escopo

**Dentro do escopo:**
- Dois métodos novos, só leitura, em `AzureDevOpsClient`: `listBoards` e `listBoardColumns` (API `_apis/work/boards` / `_apis/work/boards/{id}/columns`), este último já retornando `stateMappings` (status → coluna, por tipo de work item) diretamente da API.
- Uma função de descoberta tolerante a falha (`discoverBoardColumns`, mesmo padrão de `discoverBoardState`) que lista os boards do time e suas colunas.
- Uma função pura que monta o conteúdo markdown do arquivo de contexto (`buildSetupAssistantContent`), incluindo: explicação da filosofia do Kanbrain, o dado real do processo (backlog levels/tipos/status/categorias) e dos boards/colunas descobertos, e instruções pro agente.
- Um helper genérico `writeGeneratedFile` pra escrever em `.kanbrain/generated/` (`generateContextFile.ts` é refatorado pra reaproveitá-lo, sem mudar seu comportamento público).
- Comando novo `Kanbrain: Configure with AI`, com um botão correspondente na seção Comandos da Home, que gera o arquivo e dispara o mesmo `sendReadCommand` já usado pelas skills.

**Fora do escopo:**
- Qualquer chamada de **escrita** na API do Azure DevOps (reconfigurar colunas, mover status entre colunas, etc.) — o Kanbrain continua só leitura, como é hoje. Se o usuário pedir pra reorganizar o board real, isso fica a cargo do agente no terminal, usando as ferramentas/credenciais que ele já tiver — não é código novo no Kanbrain.
- Qualquer lógica no Kanbrain que decida sozinha como agrupar status por coluna — quem decide é a conversa entre o agente e o usuário; o Kanbrain só fornece o dado e a instrução de perguntar.
- Disparo automático desse comando ao final do `Kanbrain: Setup` — só roda manualmente (comando ou botão na Home), inclusive depois de o Setup normal já ter rodado antes.
- Qualquer novo campo em `.kanbrain/config.json` — o agente edita `backlogLevels`/arquivos de skill exatamente como um usuário editaria à mão hoje.

## Design

### Descoberta de board columns (`src/azureDevOps/client.ts`, `src/azureDevOps/discoverBoardColumns.ts`)

```ts
// client.ts — dois métodos novos
async listBoards(organization: string, project: string, team: string): Promise<{ id: string; name: string }[]>
async listBoardColumns(organization: string, project: string, team: string, boardId: string): Promise<BoardColumn[]>
```
`BoardColumn = { name: string; columnType: string; stateMappings: Record<string, string> }` (`stateMappings` mapeia work item type → nome do status atribuído àquela coluna, exatamente como a API retorna).

```ts
// discoverBoardColumns.ts
export interface DiscoveredBoard {
  name: string;
  columns: BoardColumn[];
}

export async function discoverBoardColumns(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<DiscoveredBoard[]>
```
Lista os boards do time e, pra cada um, busca as colunas — tolerante a falha por board individual (continua sem ele em vez de abortar tudo), mesmo padrão já usado em `discoverBoardState`.

### Conteúdo do arquivo (`src/skills/buildSetupAssistantFile.ts`)

Função pura `buildSetupAssistantContent(organization, project, discovered, boards)` monta um markdown com quatro seções:

1. **Como o Kanbrain funciona**: explica que o mecanismo que gerou esse próprio arquivo é o mesmo usado pelas skills; que `backlogLevels` liga status → skill; que o resultado esperado é uma skill por etapa real do fluxo do time.
2. **A ressalva importante**: muitos times trabalham por coluna do board, não por status — isso é comum e válido; uma coluna pode agrupar vários status ou ter nome próprio; o Kanbrain hoje só entende status.
3. **A configuração real do projeto**: backlog levels → tipos → status (com categoria), e boards → colunas (com `stateMappings` por tipo), tudo lido nesse momento.
4. **O que fazer**: instrui o agente a — ler e entender os dados; explicar a diferença status/coluna ao usuário; perguntar como ele quer que funcione; com base na resposta, editar `.kanbrain/config.json` e os arquivos em `.kanbrain/skills/` diretamente (arquivos comuns do workspace); e, só se o usuário pedir pra reorganizar o board real da Azure DevOps, fazer isso com as próprias ferramentas do agente — nunca via Kanbrain.

### Escrita do arquivo (`src/skills/writeGeneratedFile.ts`)

```ts
export function writeGeneratedFile(workspaceRoot: string, fileName: string, content: string): string
```
Cria `.kanbrain/generated/` se preciso, escreve o conteúdo, retorna o caminho relativo — exatamente a parte de I/O que `generateContextFile.ts` já faz hoje (extraída pra reuso, sem mudar o comportamento público de `generateContextFile`).

### Comando (`src/commands/configureWithAi.ts`)

Fluxo: garante que existe config (senão, mensagem pedindo pra rodar Setup primeiro) → `discoverBoardState` (backlog levels/tipos/status, já existente) + `discoverBoardColumns` (novo) → `buildSetupAssistantContent` → `writeGeneratedFile` com nome `setup-assistant-<timestamp>.md` → `sendReadCommand`. Mesmo padrão de tratamento de erro de rede/auth já usado em `checkBoardConfig.ts`/`syncBoardConfig.ts` (try/catch, mensagem inline, nunca exceção não tratada).

Home ganha um botão `🤖 Configure with AI` na seção Comandos, mandando uma mensagem `run-configure-with-ai` nova — mesmo padrão dos outros três botões de comando já existentes.

## Tratamento de erros

- Sem config ainda: mensagem pedindo pra rodar `Kanbrain: Setup` primeiro (mesmo padrão dos outros comandos).
- Falha ao descobrir boards/colunas (rede, auth, time sem boards visíveis): mensagem de erro inline, sem exceção não tratada — mesmo padrão de `discoverBoardState`.
- Board individual sem colunas acessíveis: `discoverBoardColumns` segue sem ele (tolerante), não aborta o comando inteiro.

## Testes

- `src/azureDevOps/client.test.ts`: casos novos pra `listBoards`/`listBoardColumns` (fetch mockado).
- `src/azureDevOps/discoverBoardColumns.test.ts` (novo): descoberta feliz; tolerância a falha de um board individual.
- `src/skills/buildSetupAssistantFile.test.ts` (novo): conteúdo inclui organization/project, cada backlog level/tipo/status, cada board/coluna/state-mapping, e as quatro seções de instrução.
- `src/skills/writeGeneratedFile.test.ts` (novo): cria o diretório, escreve o conteúdo, retorna o caminho relativo correto.
- `src/skills/generateContextFile.test.ts` (existente): sem mudança de comportamento esperada após a refatoração pra usar `writeGeneratedFile` — mesmos testes devem continuar passando.
- Sem teste automatizado pra `commands/configureWithAi.ts` (glue de VS Code) — mesmo padrão já estabelecido pros outros comandos; coberto pelo checklist manual do README.
