# Board configuration check & sync — Design

## Contexto e motivação

`.kanbrain/config.json` é escrito uma única vez, hoje, pelo comando `Kanbrain: Setup` — e sempre como um overwrite total (`writeConfig` substitui o objeto inteiro). Isso cria dois problemas:

1. **Sem detecção de divergência**: se o processo do projeto no Azure DevOps muda depois do Setup (um status é renomeado, um tipo de work item é adicionado/removido, um tipo muda de backlog level), nada avisa o usuário. Na prática hoje, um status que não bate mais silenciosamente para de mostrar o botão de ação (`resolveSkillPath` retorna `null`), sem nenhuma indicação de que é porque o board mudou, não porque o status não tem skill configurada de propósito.
2. **Sem preservação ao reconfigurar**: se o usuário roda `Kanbrain: Setup` de novo pra capturar a mudança do board, `backlogLevels` (o mapeamento status → skill) é regenerado do zero, descartando qualquer customização manual que o usuário tenha feito no `config.json` — incluindo reatribuir um status pra um arquivo de skill diferente do gerado automaticamente.
3. **Bug lateral descoberto durante a análise**: `readConfig()` faz `JSON.parse(raw) as KanbrainConfig` sem tratamento de erro. Um `config.json` mal formatado (erro de digitação numa edição manual) quebra silenciosamente em qualquer lugar que chama `readConfig` — painel principal, busca, execução de skill — em vez de mostrar uma mensagem clara.

Esta mudança adiciona uma forma de checar se o `config.json` ainda é compatível com o board real, e — quando não é — sincronizar preservando 100% das skills que o usuário já configurou.

## Escopo

**Dentro do escopo:**
- Corrigir `readConfig()` para nunca lançar exceção em JSON mal formatado (retorna `null`, mesmo comportamento hoje esperado de "sem config").
- Uma checagem de compatibilidade (config vs. board real) que roda automaticamente uma vez por sessão do VS Code quando o painel abre pela primeira vez, silenciosa se estiver tudo certo.
- Comando `Kanbrain: Check Board Configuration` — roda a mesma checagem sob demanda (útil depois de editar `config.json` à mão), sempre com feedback explícito (inclusive "está tudo certo").
- Comando `Kanbrain: Sync Board Configuration` — aplica a correção: atualiza campos derivados (`statusColors`, `typeColors`, `typeIcons`, `typeToBacklogLevel`) com os dados reais mais recentes; adiciona entradas novas de level/status (`backlogLevels`) com skill `null`; **nunca remove** uma entrada de `backlogLevels` que já existia, mesmo que o level/status correspondente não exista mais no board — essas entradas ficam sinalizadas no relatório, não apagadas.
- O aviso automático (quando a checagem encontra divergência) tem um botão "Sincronizar" que dispara o mesmo comando de sync.
- Mensagem clara e específica quando `config.json` está malformado, distinta da mensagem de "nenhum config ainda" (que sugere rodar `Setup`).

**Fora do escopo:**
- Detectar/reconciliar renomeações (ex: status "Committed" virou "In Progress"). A API do Azure DevOps não expõe um identificador estável de status entre renomeações — isso aparece pro sync como "Committed" removido + "In Progress" adicionado, dois eventos separados. O usuário reatribui manualmente se for o caso (a skill antiga continua no config, só órfã).
- Gerar arquivos de skill placeholder para entradas novas descobertas pelo sync (diferente do Setup inicial) — novas entradas de `backlogLevels` sempre entram como `null`; o usuário decide se quer configurar uma skill.
- Reconfigurar organização/projeto (trocar de projeto do zero) — isso é o comportamento já existente de `Kanbrain: Setup`, que continua um overwrite total intencional.
- Qualquer novo campo de config para o usuário editar manualmente além do que já existe.

## Design

### Correção do `readConfig`

Em `src/config/config.ts`, `readConfig` ganha um `try/catch` ao redor do `JSON.parse`, retornando `null` em caso de erro — mesmo contrato de retorno de hoje (`KanbrainConfig | null`), sem quebrar nenhum chamador existente. Isso por si só corrige o crash em qualquer lugar que já chama `readConfig` (painel, busca, execução de skill).

Para a checagem (que precisa saber *por que* não há config válido — ausente vs. malformado, pra mostrar a mensagem certa), um novo helper independente é necessário: `readConfigWithDiagnostics(workspaceRoot)` em `src/config/config.ts`, retornando um discriminated union: `{ status: 'ok'; config: KanbrainConfig } | { status: 'missing' } | { status: 'invalid'; error: string }` (`error` é a mensagem do `JSON.parse` capturada no catch). Só o fluxo de check usa essa versão; todos os outros chamadores continuam usando `readConfig()` sem mudança.

### Descoberta compartilhada do board real

Hoje, `src/commands/setup.ts` já contém a sequência "time padrão → backlog levels → status por tipo (com try/catch por tipo, seguindo sem ele em caso de falha) → cor/ícone por tipo (idem)". Essa sequência é extraída para uma função compartilhada:

```ts
// src/azureDevOps/discoverBoardState.ts
export interface BoardState {
  levels: BacklogLevel[];
  statesByType: Record<string, WorkItemTypeState[]>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState>
```

`setup.ts` passa a chamar essa função em vez de duplicar a lógica inline (refactor comportamentalmente neutro). O novo fluxo de check/sync usa a mesma função como fonte de verdade — garantindo que "o que o Setup considera o board real" e "o que o check compara" nunca divergem por acidente.

### Comparação (`diffBoardConfig`)

```ts
// src/azureDevOps/checkBoardConfig.ts
export interface BoardConfigDiff {
  typesRemoved: string[];
  typesAdded: string[];
  typesMoved: { type: string; from: string; to: string }[];
  levelsAdded: string[];
  levelsRemoved: string[];
  statusesAdded: { level: string; status: string }[];
  statusesRemoved: { level: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(config: KanbrainConfig, discovered: DiscoveredBacklogLevels, freshTypeToBacklogLevel: Record<string, string>): BoardConfigDiff
```

Função pura (sem I/O), fácil de testar: recebe o config atual e o resultado fresco de `discoverBacklogLevelStates`/`buildTypeToBacklogLevel` (as mesmas funções puras que `setup.ts` já usa, alimentadas pelo `BoardState` de `discoverBoardState`), e retorna as sete categorias acima. Um diff "vazio" (todos os arrays vazios) significa "compatível".

`statusesRemoved` carrega o `skillPath` atual pra a mensagem poder dizer exatamente o que está em risco de ficar órfão (ex: `"Committed" (Stories) — mapeado pra .kanbrain/skills/stories-inprogress.md — não encontrado mais no board`).

### Merge preservando skills (`syncConfig`)

```ts
// src/config/syncConfig.ts
export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
): KanbrainConfig
```

Função pura. Regras:
- `organization`, `project`: mantidos como estão (sync não muda org/projeto).
- `typeToBacklogLevel`, `statusColors`, `typeColors`, `typeIcons`: **sempre substituídos** pelos valores frescos — são dados derivados do board, nunca editados à mão pelo usuário.
- `backlogLevels`: reconstruído nível a nível a partir de `discovered` (que define quais levels/status existem agora), mas **cada status novo herda o valor exato já presente em `config.backlogLevels[level][status]` quando essa chave já existir** (path ou `null` — o que o usuário tinha); só usa `null` como default para combinações level/status genuinamente novas. Depois, **qualquer entrada que existia em `config.backlogLevels` mas não apareceu em `discovered` é copiada de volta inalterada** (nunca removida) — isso cobre tanto status quanto levels inteiros órfãos.

O comando `Kanbrain: Sync Board Configuration` chama `discoverBoardState` → `discoverBacklogLevelStates`/`buildTypeToBacklogLevel`/`discoverStatusColors` (mesmas funções puras de `backlogLevels.ts` já existentes) → `syncConfig` → `writeConfig`, e mostra uma mensagem resumindo o que mudou (baseada no mesmo `diffBoardConfig` rodado antes do sync, pra reportar exatamente o que foi adicionado/preservado como órfão).

### Comandos e checagem automática

- **`Kanbrain: Check Board Configuration`** (`src/commands/checkBoardConfig.ts`): lê o config via `readConfigWithDiagnostics`. Se `missing` → mensagem "Nenhum projeto configurado. Rode Kanbrain: Setup." Se `invalid` → mensagem de erro mostrando o motivo do JSON malformado. Se `ok` → roda `discoverBoardState` + `diffBoardConfig`; se o diff estiver vazio, mostra uma mensagem de sucesso ("A configuração do Kanbrain está em dia com o board."); senão, mostra um aviso resumindo o diff com um botão de ação **"Sincronizar"** que executa `Kanbrain: Sync Board Configuration`.
- **`Kanbrain: Sync Board Configuration`** (`src/commands/syncBoardConfig.ts`): executa o merge descrito acima e mostra uma mensagem de confirmação resumindo o que foi adicionado/preservado.
- **Checagem automática**: em `KanbrainViewProvider.resolveWebviewView`, depois da resolução inicial, dispara a mesma lógica de `Kanbrain: Check Board Configuration` uma única vez (guardada por uma flag de instância, já que `resolveWebviewView` normalmente só roda uma vez por sessão do VS Code para uma view persistente) — silenciosa se tudo estiver certo, mostra o aviso com botão "Sincronizar" caso contrário. Só roda se já existe um config válido (`ok`); não roda para `missing` (o painel já mostra o prompt de Setup) nem duas vezes seguidas por sessão.

## Tratamento de erros

- `config.json` malformado: nunca lança exceção; `readConfig()` retorna `null` (comportamento seguro em todos os chamadores existentes); `readConfigWithDiagnostics` dá a mensagem específica pro fluxo de check.
- Falha de rede/auth durante a descoberta do board (check ou sync): mesmo padrão já usado no Setup — mensagem de erro inline/`showErrorMessage`, sem exceção não tratada.
- Falha pontual ao buscar estados/ícone de um tipo específico durante `discoverBoardState`: mesma tolerância que o Setup já tem hoje (segue sem aquele tipo, não aborta a checagem inteira).

## Testes

- `src/config/config.test.ts`: novos casos para `readConfig` retornando `null` (em vez de lançar) com um JSON malformado; novos casos para `readConfigWithDiagnostics` cobrindo os três status (`ok`, `missing`, `invalid` com a mensagem de erro).
- `src/azureDevOps/discoverBoardState.test.ts` (novo): extrai a cobertura que hoje só existe indiretamente via `setup.ts` (sem teste próprio) — tolerância a falha por tipo ao buscar states/ícone.
- `src/azureDevOps/checkBoardConfig.test.ts` (novo): casos para `diffBoardConfig` — cada uma das sete categorias do diff, isoladamente e combinadas; diff vazio quando config e board batem.
- `src/config/syncConfig.test.ts` (novo): casos para `syncConfig` — campos derivados sempre substituídos; skill existente preservada quando o level/status ainda existe; entrada nova vira `null`; entrada órfã (status ou level inteiro) é mantida no resultado em vez de removida.
- `src/commands/setup.ts`: sem mudança de comportamento esperada após extrair `discoverBoardState` (refactor); a suíte de integração leve já existente cobre o comando ponta a ponta.
