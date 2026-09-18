# Iniciar o provedor de IA ao abrir o terminal de uma skill — Design

## Contexto e motivação

Hoje, ao clicar no botão de rodar uma skill (ou em qualquer um dos comandos "Configure with AI"), o Kanbrain abre/reaproveita um terminal integrado e digita nele uma instrução do tipo "Read the file X and follow the instructions in it" (`buildReadCommand`, `sendReadCommand`/`sendReadCommandForTab`). Isso presume que já existe um agente de IA rodando naquele terminal (Claude Code, Codex CLI, etc.) — se o terminal acabou de ser criado, a instrução cai num shell comum, sem nenhum agente pra interpretá-la.

O usuário quer poder configurar **qual comando iniciar automaticamente** quando um terminal novo é aberto por essas ações — com uma lista de provedores conhecidos (presets) e uma opção "Custom" onde ele digita o comando exato (ex: `claude`).

## Escopo

**Dentro do escopo:**
- Novo campo de configuração `aiProviderCommand` (string, vazio/ausente = comportamento atual, sem mudança).
- UI: um `<select>` com presets (Claude Code → `claude`, Codex CLI → `codex`) + "None" (desliga a feature) + "Custom" (revela um campo de texto).
- Salvar em `config.local.json` (não em `config.json`) — é uma preferência de máquina/pessoa, não do projeto, mesmo padrão já usado por `repositories`, `showAssignedTo`, `searchAssignedToMe` e `selectedProfileId`.
- Enviar o comando pro terminal **só quando ele é criado**, nunca quando um terminal já existente é reaproveitado (evita reiniciar o agente no meio de uma sessão em andamento).
- Aplicar em todos os pontos que hoje abrem um terminal e mandam `buildReadCommand`: os 5 comandos `configureXWithAi` (Setup, Skills, Workflow, Profiles, Repositories) e a execução de skill por aba (`KanbrainViewProvider.executeSkill`).

**Fora do escopo:**
- Detectar automaticamente se o agente já terminou de inicializar antes de mandar a instrução (`sendText` já manda tudo em sequência hoje; não muda).
- Permitir um comando diferente por profile ou por skill — é uma única preferência global por máquina, decisão já discutida e descartada (profile é sobre contexto de trabalho, não sobre qual CLI de agente rodar).
- Detectar se o comando configurado (`claude`, `codex`, custom) está de fato instalado no PATH — se não estiver, o terminal só mostra o erro normal do shell ("comando não encontrado"), sem tratamento especial.

## Design

### 1. Config — `src/types.ts` + `src/config/config.ts`

```ts
// types.ts
export interface KanbrainConfig {
  ...
  aiProviderCommand?: string;
}
```

`aiProviderCommand` entra na mesma lista de campos locais que `selectedProfileId` já usa — em `config.ts`:

```ts
interface LocalConfig {
  ...
  aiProviderCommand?: string;
}

function extractLocalFields(config: KanbrainConfig): LocalConfig {
  ...
  if (config.aiProviderCommand !== undefined) {
    local.aiProviderCommand = config.aiProviderCommand;
  }
  return local;
}

function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
  ...
  if ('aiProviderCommand' in local) {
    result.aiProviderCommand = local.aiProviderCommand;
  }
  return result;
}

export function writeConfig(workspaceRoot: string, config: KanbrainConfig): void {
  ...
  const { repositories, showAssignedTo, searchAssignedToMe, selectedProfileId, aiProviderCommand, ...shared } = config;
  ...
}
```

### 2. UI — `src/view/renderConfig.ts`

Vive na tela **Config**, seção "Display" já existe pra preferências locais simples (`showAssignedTo`) — adiciona uma nova seção "Terminal" logo abaixo, não na tela Brain (Brain é pra conteúdo gerado por IA — Skills/Workflow/Profiles/Repositories —, e essa configuração não tem nada a ver com isso; colocá-la lá também herdaria de graça um botão "Configure with AI" que não faz sentido aqui).

```ts
const AI_PROVIDER_PRESETS = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
];

function renderAiProviderSection(config: KanbrainConfig): string {
  const current = config.aiProviderCommand ?? '';
  const matchedPreset = AI_PROVIDER_PRESETS.find(p => p.command === current);
  const selectedValue = current === '' ? 'none' : matchedPreset ? matchedPreset.id : 'custom';
  const customValue = selectedValue === 'custom' ? current : '';

  const options = [
    `<option value="none" data-command=""${selectedValue === 'none' ? ' selected' : ''}>None — just open a plain terminal</option>`,
    ...AI_PROVIDER_PRESETS.map(
      p => `<option value="${p.id}" data-command="${escapeHtml(p.command)}"${selectedValue === p.id ? ' selected' : ''}>${escapeHtml(p.label)}</option>`,
    ),
    `<option value="custom"${selectedValue === 'custom' ? ' selected' : ''}>Custom command...</option>`,
  ].join('');

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Terminal</div>
      <p class="kb-field-hint">When a skill opens a terminal, Kanbrain can start this command first, before sending the skill's instructions. Only applies to newly opened terminals.</p>
      <select id="kb-ai-provider-select">${options}</select>
      <input type="text" id="kb-ai-provider-custom-input" class="kb-input${selectedValue === 'custom' ? '' : ' kb-hidden'}" placeholder="Command to run, e.g. claude" value="${escapeHtml(customValue)}">
    </div>
  `;
}
```

Chamada no fim de `renderConfig`, depois da seção "Display".

### 3. Mensagens e persistência — `src/view/KanbrainViewProvider.ts`

Nova mensagem, mesmo padrão de `set-show-assigned-to`:

```ts
} else if (message.type === 'set-ai-provider-command') {
  this.setAiProviderCommand(String(message.command ?? ''));
}
```

```ts
private setAiProviderCommand(command: string): void {
  if (!this.workspaceRoot) return;
  const config = readConfig(this.workspaceRoot);
  if (!config) return;
  config.aiProviderCommand = command || undefined;
  writeConfig(this.workspaceRoot, config);
  this.lastState = '';
  void this.refresh();
}
```

JS do webview, ao lado do wiring de `kb-show-assignee-toggle`:

```js
const aiProviderSelect = document.getElementById('kb-ai-provider-select');
const aiProviderCustomInput = document.getElementById('kb-ai-provider-custom-input');
if (aiProviderSelect) {
  aiProviderSelect.addEventListener('change', () => {
    if (aiProviderSelect.value === 'custom') {
      if (aiProviderCustomInput) {
        aiProviderCustomInput.classList.remove('kb-hidden');
        aiProviderCustomInput.focus();
      }
      return; // espera o blur do campo custom pra salvar
    }
    if (aiProviderCustomInput) aiProviderCustomInput.classList.add('kb-hidden');
    const command = aiProviderSelect.selectedOptions[0].dataset.command || '';
    vscode.postMessage({ type: 'set-ai-provider-command', command });
  });
}
if (aiProviderCustomInput) {
  aiProviderCustomInput.addEventListener('blur', () => {
    vscode.postMessage({ type: 'set-ai-provider-command', command: aiProviderCustomInput.value });
  });
}
```

Trocar pra "Custom" sem digitar nada ainda não salva (só ao perder o foco do campo) — mesmo padrão de "salva no blur" já usado pelos campos de texto de skill/repositório.

### 4. Usar o comando ao abrir um terminal novo — `src/terminal/kanbrainTerminal.ts` + `tabTerminal.ts`

Os dois módulos precisam saber se o terminal que devolveram é **novo** ou **reaproveitado**, pra só mandar o comando de start uma vez:

```ts
// kanbrainTerminal.ts
function findOrCreateTerminal(): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  if (existing) return { terminal: existing, isNew: false };
  return { terminal: vscode.window.createTerminal(TERMINAL_NAME), isNew: true };
}

export function sendReadCommand(relativeContextFilePath: string, aiProviderCommand?: string): void {
  const { terminal, isNew } = findOrCreateTerminal();
  terminal.show();
  if (isNew && aiProviderCommand) {
    terminal.sendText(aiProviderCommand);
  }
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
```

Mesma mudança em `tabTerminal.ts`'s `findOrCreateTerminalForTab`/`sendReadCommandForTab`.

Os 6 chamadores (5 `configureXWithAi.ts` + `KanbrainViewProvider.executeSkill`) já leem `config` antes de chamar `sendReadCommand`/`sendReadCommandForTab` — só passam `config.aiProviderCommand` como segundo argumento.

## Tratamento de erros

- Comando configurado não existe no PATH: sem tratamento especial — o terminal mostra o erro padrão do shell, igual mostraria se o usuário tivesse digitado manualmente.
- Nenhum comando configurado (`aiProviderCommand` ausente/vazio): comportamento idêntico ao de hoje, nada muda.

## Testes

- `src/config/config.test.ts`: `aiProviderCommand` é escrito em `config.local.json`, não em `config.json`; faz round-trip por `readConfig`.
- `src/view/renderConfig.test.ts`: seção "Terminal" aparece; select mostra "None" por padrão; mostra o preset certo selecionado quando `aiProviderCommand` bate com um preset; cai em "Custom" com o campo de texto visível e preenchido quando o comando não bate com nenhum preset; campo de texto fica escondido quando não é "Custom".
- Sem teste automatizado pra `kanbrainTerminal.ts`/`tabTerminal.ts` (já não tinham — só usam a API do `vscode.window.createTerminal`/`sendText`, não testável em unit test) nem pro JS inline novo — verificação manual na tarefa final, mesmo padrão já estabelecido no resto do projeto.
