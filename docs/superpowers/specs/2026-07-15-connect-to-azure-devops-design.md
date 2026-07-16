# Kanbrain: Connect to Azure DevOps — Design

## Contexto e motivação

`.kanbrain/config.json` é commitado e compartilhado pelo time — quando alguém roda `Kanbrain: Setup`, o organization/project ficam salvos pra todo mundo que clonar o repositório depois. O problema é a identidade: a sessão Microsoft/Azure de cada desenvolvedor é local à sua própria máquina, e hoje o Kanbrain não tem nenhum fluxo dedicado pra estabelecer/validar essa conexão quando o projeto já está configurado por outra pessoa — ele simplesmente tenta usar `vscode.authentication.getSession('microsoft', [scope], { createIfNone: true })` silenciosamente a cada chamada à API, reaproveitando qualquer sessão que o VS Code já tenha em cache (sem opção de escolher conta) e sem popup se já houver alguma sessão salva (mesmo que seja de uma conta sem acesso ao org/project configurado).

Pior: `KanbrainViewProvider.refresh()` — que roda a cada 5 segundos via polling — não tem nenhum `try/catch` ao redor das chamadas ao client. Se a autenticação falhar por qualquer motivo (conta errada, sem acesso, sessão revogada), a exceção vira uma promise rejeitada silenciosa: o painel trava sem nenhum feedback visual, sem erro, sem nada — só fica parado. É isso que explica o "às vezes ele não se conectou" relatado.

Esta mudança resolve os dois problemas juntos: um comando explícito e direcionado pra conectar com a conta certa quando o projeto já está configurado, e o fim do silêncio — toda falha de conexão vira um estado visível e acionável no painel.

## Escopo

**Dentro do escopo:**
- Uma nova tela de gate, entre "sem config" e a Home normal: quando `.kanbrain/config.json` existe mas a conexão com o org/project configurado ainda não foi validada nesta sessão do VS Code (ou uma tentativa real de acesso falhou), o painel mostra uma tela pedindo pra rodar **Kanbrain: Connect to Azure DevOps**, no mesmo padrão visual da tela "Run Setup" já existente.
- Detecção de conexão: uma checagem silenciosa (sem popup — `getSession({ createIfNone: false })`) seguida de uma chamada leve real (`getDefaultTeamName(org, project)`) pra confirmar acesso de fato ao projeto configurado, não só login em alguma conta Microsoft qualquer. Roda uma vez por sessão do VS Code (mesmo padrão do check de board config existente), não a cada poll de 5s.
- Comando novo `Kanbrain: Connect to Azure DevOps` (`kanbrain.connect`): força a escolha explícita de conta (`clearSessionPreference: true`, essencial pro caso "sessão já em cache é de uma conta sem acesso" — sem isso o VS Code reusaria essa sessão errada silenciosamente de novo), depois valida acesso real ao org/project configurado, com mensagem de sucesso/erro clara.
- Fim do silêncio em `refresh()`: `try/catch` ao redor da busca de dados do work item ativo; qualquer falha marca o estado como desconectado e mostra a tela de Connect em vez de travar sem feedback — vale tanto pra primeira checagem quanto pra uma sessão que expire no meio do uso.
- Botão na tela de "desconectado", igual ao padrão já existente do botão "Run Kanbrain: Setup".

**Fora do escopo:**
- Tratamento de erro em `searchWorkItems`/`runSkill` — já existe (busca) ou é uma lacuna pré-existente (skill) não relacionada a este pedido especificamente; não mexer.
- Persistir qual conta Microsoft foi usada (ex: salvar account id/label em algum estado local) — o VS Code já lembra a preferência de conta por extensão/escopo internamente; não precisamos duplicar isso.
- Qualquer mudança em como `Kanbrain: Setup` autentica — Setup já força login (`createIfNone: true`) na primeira vez que roda, isso não muda.
- Sniffing de código de status HTTP (401 vs 403 vs 404) pra decidir se uma falha é "de conexão" ou "outra coisa" — qualquer falha na busca de dados do work item ativo é tratada de forma uniforme como "desconectado", mantendo o fluxo simples.

## Design

### Extensão da camada de auth (`src/auth/ensureAzureSession.ts`)

```ts
export type GetSessionFn = (
  scopes: string[],
  options: { createIfNone: boolean; clearSessionPreference?: boolean },
) => Promise<{ accessToken: string } | undefined>;

export async function ensureAzureSession(getSession: GetSessionFn): Promise<string>
// (sem mudança de comportamento — continua createIfNone: true, sem clearSessionPreference)

export async function hasCachedAzureSession(getSession: GetSessionFn): Promise<boolean>
// getSession([AZURE_DEVOPS_SCOPE], { createIfNone: false }) — sem popup nunca; retorna se já existe sessão em cache

export async function connectAzureSession(getSession: GetSessionFn): Promise<string>
// getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true, clearSessionPreference: true })
// mesmo erro descritivo do ensureAzureSession se a sessão vier undefined
```

`src/auth/vscodeSession.ts`'s `getVscodeMicrosoftSession` não muda — já repassa `options` genericamente pro `vscode.authentication.getSession`, então aceita as novas opções sem alteração.

### Validação de acesso real (`src/azureDevOps/validateProjectAccess.ts`, novo)

```ts
export async function validateProjectAccess(client: AzureDevOpsClient, organization: string, project: string): Promise<boolean> {
  try {
    await client.getDefaultTeamName(organization, project);
    return true;
  } catch {
    return false;
  }
}
```
Tolerante — nunca lança, sempre retorna um booleano. Reaproveita `getDefaultTeamName`, que já existe e já é usado por `discoverBoardState` como uma chamada leve e específica ao projeto (não precisa listar todos os projetos da organização).

### Comando `Kanbrain: Connect to Azure DevOps` (`src/commands/connect.ts`, novo)

Fluxo:
1. Lê o config; se não existir, mensagem pedindo pra rodar Setup primeiro (mesmo padrão dos outros comandos).
2. Chama `connectAzureSession(getVscodeMicrosoftSession)` — força o seletor de conta. Se falhar/for cancelado, mensagem de erro inline, para aqui.
3. Chama `validateProjectAccess(client, config.organization, config.project)`.
4. Se `true`: mensagem de sucesso ("Connected to org/project.") e chama o callback `onConnected()` (mesmo padrão do `onSetupComplete` do comando Setup) — que marca a conexão como estabelecida no provider e força um refresh pra Home.
5. Se `false`: mensagem de erro explicando que a conta conectada não tem acesso ao org/project configurado, sugerindo rodar Connect de novo pra escolher outra conta.

Sem teste automatizado — mesmo padrão já estabelecido pra arquivos de comando VS Code-glue neste repositório.

### Tela de "desconectado" (`src/view/render.ts`)

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected'; // opcional — ausente/'connected' == comportamento atual
}
```
Campo **opcional** deliberadamente, com "ausente" tratado como conectado — evita quebrar as ~17 chamadas existentes em `render.test.ts` (e as de `renderHome.test.ts`/`renderConfig.test.ts`) que constroem `RenderState` sem esse campo.

Novo branch em `render()`, logo depois do gate de "sem config" e antes do dispatch por `screen`:
```ts
if (state.connectionStatus === 'disconnected') {
  return `
    <div class="kb-empty">
      This project is configured, but not connected to Azure DevOps yet. Run the <b>Kanbrain: Connect to Azure DevOps</b> command.
      <div><button id="kb-run-connect-btn" class="kb-action-btn">Run Kanbrain: Connect to Azure DevOps</button></div>
    </div>
  `;
}
```

### Orquestração (`src/view/KanbrainViewProvider.ts`)

- Novo campo: `private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';`
- Novo método privado `checkConnection(config): Promise<'connected' | 'disconnected'>`: se `!hasCachedAzureSession(...)` retorna `'disconnected'` direto (sem chamada de API, já que não há token pra tentar); senão chama `validateProjectAccess` e mapeia o booleano.
- `refresh()` passa a, quando `config` existe e `connectionStatus === 'unknown'`, `await` esse check antes de decidir o que fazer — guarda o resultado em `this.connectionStatus` (só roda essa checagem uma vez; polls seguintes pulam direto pro passo seguinte).
- Se `connectionStatus === 'disconnected'` depois do check: renderiza direto a tela de Connect (`render({ ..., connectionStatus: 'disconnected' })`) e retorna, sem tentar buscar work item.
- A busca de dados do work item ativo (`client.getWorkItems`/`getChildren`) passa a rodar dentro de um `try/catch`; qualquer erro marca `this.connectionStatus = 'disconnected'`, força `this.lastState = ''`, e a próxima renderização cai na tela de Connect.
- Novo método público `markConnected()`: `this.connectionStatus = 'connected'; this.lastState = ''; void this.refresh();` — chamado pelo callback `onConnected` do comando Connect (mesmo padrão de `setActiveWorkItem`/Setup).

### Wiring (`src/extension.ts`, `package.json`)

- `package.json`: novo comando `{ "command": "kanbrain.connect", "title": "Kanbrain: Connect to Azure DevOps" }`.
- `src/extension.ts`: `registerConnectCommand(client, workspaceRoot, () => provider.markConnected())`, adicionado ao `context.subscriptions.push(...)` junto dos outros comandos.
- `src/view/KanbrainViewProvider.ts`: handler de mensagem `run-connect` → `vscode.commands.executeCommand('kanbrain.connect')`; botão `kb-run-connect-btn` no script cliente, mesmo padrão do `kb-run-setup-btn` existente.

## Tratamento de erros

- Sem sessão Microsoft em cache nenhuma: `checkConnection` retorna `'disconnected'` sem tentar nenhuma chamada de API (evita popup de login não solicitado durante o polling em background).
- Sessão existe mas sem acesso ao org/project configurado (ex: conta pessoal vs conta de trabalho): `validateProjectAccess` retorna `false` via `getDefaultTeamName` falhando — mesmo resultado (`'disconnected'`), sem distinguir a causa exata.
- `Kanbrain: Connect to Azure DevOps` cancelado pelo usuário (fecha o navegador sem logar): mensagem de erro inline (reaproveitando o mesmo texto de erro de `ensureAzureSession`), sem exceção não tratada.
- Sessão expira/é revogada no meio do uso normal (poll em andamento): `refresh()` captura, marca desconectado, próxima renderização mostra a tela de Connect — sem mais travamentos silenciosos.

## Testes

- `src/auth/ensureAzureSession.test.ts` (existente): casos novos pra `hasCachedAzureSession` (chama com `createIfNone: false`, retorna `true`/`false` conforme a sessão) e `connectAzureSession` (chama com `createIfNone: true, clearSessionPreference: true`, mesmo erro descritivo que `ensureAzureSession` quando a sessão vem `undefined`).
- `src/azureDevOps/validateProjectAccess.test.ts` (novo): retorna `true` quando `getDefaultTeamName` resolve; retorna `false` (sem lançar) quando `getDefaultTeamName` rejeita.
- `src/view/render.test.ts` (existente): casos novos pra `connectionStatus: 'disconnected'` (mostra a tela de Connect, com o botão) e confirmação de que omitir o campo mantém o comportamento atual (todos os testes existentes continuam passando sem alteração).
- Sem teste automatizado pra `src/commands/connect.ts` — mesmo padrão já estabelecido pros outros comandos VS Code-glue; coberto pelo checklist manual do README.
- `KanbrainViewProvider.ts` continua sem teste dedicado (mesmo padrão já estabelecido nesse arquivo) — verificado via compile + suite completa + checklist manual.
