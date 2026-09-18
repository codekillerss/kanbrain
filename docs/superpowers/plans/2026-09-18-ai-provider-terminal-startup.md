# Iniciar o provedor de IA ao abrir o terminal de uma skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir configurar um comando (preset conhecido ou custom) que o Kanbrain digita automaticamente num terminal **recém-criado**, antes de mandar a instrução de rodar uma skill/configuração — pra que o agente de IA já esteja de pé quando essa instrução chegar. Configuração de máquina, salva em `config.local.json`.

**Spec:** `docs/superpowers/specs/2026-09-18-ai-provider-terminal-startup-design.md`

## Global Constraints

- **Não implementar direto na `main`.** Criar worktree/branch antes da Task 1 (skill `superpowers:using-git-worktrees`).
- **Não commitar automaticamente.** Cada tarefa termina em "rode os testes, confirme que passam", não em commit. Só commitar se pedido explicitamente, depois, fora deste plano.
- `aiProviderCommand` é sempre local (`config.local.json`) — nunca deve aparecer em `config.json`.
- O comando só é enviado quando um terminal **novo** é criado, nunca num terminal reaproveitado.

---

## Task 1: Campo `aiProviderCommand` no config e no split local/compartilhado

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `KanbrainConfig.aiProviderCommand?: string`, lido/escrito exclusivamente em `config.local.json` — Task 2 (UI) e Task 4 (uso no terminal) dependem deste campo existir e já vir populado por `readConfig`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/config/config.test.ts`, dentro do `describe('machine-local config split', ...)`, ao lado dos testes de `selectedProfileId`:

```ts
  it('writes aiProviderCommand to config.local.json, not config.json', () => {
    writeConfig(workspaceRoot, { ...baseConfig, aiProviderCommand: 'claude' });

    const sharedRaw = JSON.parse(fs.readFileSync(getConfigPath(workspaceRoot), 'utf-8'));
    expect(sharedRaw.aiProviderCommand).toBeUndefined();

    const localRaw = JSON.parse(fs.readFileSync(getConfigLocalPath(workspaceRoot), 'utf-8'));
    expect(localRaw).toEqual({ aiProviderCommand: 'claude' });
  });

  it('round-trips aiProviderCommand through readConfig', () => {
    const config = { ...baseConfig, aiProviderCommand: 'codex' };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — `aiProviderCommand` ainda não existe no tipo nem no split local.

- [ ] **Step 3: Implementar**

Em `src/types.ts`, adicionar ao final de `KanbrainConfig`:

```ts
  aiProviderCommand?: string;
```

Em `src/config/config.ts`:

```ts
// LocalConfig
interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
  searchAssignedToMe?: boolean;
  selectedProfileId?: string;
  aiProviderCommand?: string;
}
```

```ts
// extractLocalFields, depois do bloco de selectedProfileId
  if (config.aiProviderCommand !== undefined) {
    local.aiProviderCommand = config.aiProviderCommand;
  }
```

```ts
// applyLocalOverlay, depois do bloco de selectedProfileId
  if ('aiProviderCommand' in local) {
    result.aiProviderCommand = local.aiProviderCommand;
  }
```

```ts
// writeConfig
  const { repositories, showAssignedTo, searchAssignedToMe, selectedProfileId, aiProviderCommand, ...shared } = config;
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos.

Do not commit — see Global Constraints.

---

## Task 2: UI — seção "Terminal" na tela Config

**Files:**
- Modify: `src/view/renderConfig.ts`
- Test: `src/view/renderConfig.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.aiProviderCommand` (Task 1).
- Produces: `#kb-ai-provider-select` (com `data-command` em cada `<option>`) e `#kb-ai-provider-custom-input` — Task 3 (JS/mensagens) depende desses ids e do atributo `data-command`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/view/renderConfig.test.ts`:

```ts
  it('shows a Terminal section with an AI provider select defaulting to "None"', () => {
    const html = renderConfig(state());
    expect(html).toContain('>Terminal<');
    expect(html).toContain('id="kb-ai-provider-select"');
    expect(html).toMatch(/<option value="none"[^>]*selected[^>]*>/);
  });

  it('selects the matching preset option when aiProviderCommand matches a known preset', () => {
    const html = renderConfig(state({ config: config({ aiProviderCommand: 'claude' }) }));
    expect(html).toMatch(/<option value="claude"[^>]*selected[^>]*>/);
  });

  it('falls back to "Custom" with the input visible and pre-filled when the command matches no preset', () => {
    const html = renderConfig(state({ config: config({ aiProviderCommand: 'my-agent --flag' }) }));
    expect(html).toMatch(/<option value="custom"[^>]*selected[^>]*>/);
    const inputStart = html.indexOf('id="kb-ai-provider-custom-input"');
    const inputTag = html.slice(html.lastIndexOf('<input', inputStart), html.indexOf('>', inputStart) + 1);
    expect(inputTag).not.toContain('kb-hidden');
    expect(inputTag).toContain('value="my-agent --flag"');
  });

  it('hides the custom input when a preset (or none) is selected', () => {
    const html = renderConfig(state({ config: config({ aiProviderCommand: 'claude' }) }));
    const inputStart = html.indexOf('id="kb-ai-provider-custom-input"');
    const inputTag = html.slice(html.lastIndexOf('<input', inputStart), html.indexOf('>', inputStart) + 1);
    expect(inputTag).toContain('kb-hidden');
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — a seção "Terminal" ainda não existe.

- [ ] **Step 3: Implementar**

Em `src/view/renderConfig.ts`, adicionar `escapeHtml` ao import (novo import — o arquivo não usa ainda), a constante `AI_PROVIDER_PRESETS`, a função `renderAiProviderSection` e chamá-la no fim do template de `renderConfig`, conforme a seção 2 do spec (`docs/superpowers/specs/2026-09-18-ai-provider-terminal-startup-design.md`).

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos.

Do not commit — see Global Constraints.

---

## Task 3: Mensagem e persistência — `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
  - `onDidReceiveMessage` if/else chain (ao lado do branch `set-show-assigned-to`)
  - Novo método privado (ao lado de `setShowAssignedTo`)
  - JS do webview: wiring do select/input (ao lado do wiring de `kb-show-assignee-toggle`)

**Interfaces:**
- Consumes: `#kb-ai-provider-select`/`#kb-ai-provider-custom-input` (Task 2).
- Produces: mensagem `set-ai-provider-command` e método `setAiProviderCommand` — usados só por esta tela; Task 4 não depende disso (lê `config.aiProviderCommand` diretamente via `readConfig`).

Sem teste automatizado — `KanbrainViewProvider.ts` não tem teste dedicado (gap já existente, documentado nos planos anteriores). Verificação manual na Task 5.

- [ ] **Step 1: Adicionar o branch da mensagem**

Ao lado de `set-show-assigned-to` (por volta da linha 172-173):

```ts
      } else if (message.type === 'set-ai-provider-command') {
        this.setAiProviderCommand(String(message.command ?? ''));
```

- [ ] **Step 2: Adicionar o método**

Ao lado de `setShowAssignedTo` (por volta da linha 552):

```ts
  private setAiProviderCommand(command: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.aiProviderCommand = command || undefined;
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 3: Wiring no JS do webview**

Ao lado do bloco de `kb-show-assignee-toggle` (por volta da linha 1334-1338), conforme a seção 3 do spec.

- [ ] **Step 4: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos.

Do not commit — see Global Constraints.

---

## Task 4: Enviar o comando ao abrir um terminal novo

**Files:**
- Modify: `src/terminal/kanbrainTerminal.ts`
- Modify: `src/terminal/tabTerminal.ts`
- Modify: `src/commands/configureWithAi.ts`
- Modify: `src/commands/configureSkillsWithAi.ts`
- Modify: `src/commands/configureWorkflowWithAi.ts`
- Modify: `src/commands/configureProfilesWithAi.ts`
- Modify: `src/commands/configureRepositoriesWithAi.ts`
- Modify: `src/view/KanbrainViewProvider.ts` (`executeSkill`)

**Interfaces:**
- Consumes: `KanbrainConfig.aiProviderCommand` (Task 1), já disponível via `config` em todos os 6 chamadores (cada um já faz `readConfig`/tem `config` em escopo antes de chamar `sendReadCommand`/`sendReadCommandForTab`).
- Produces: nada consumido por tarefa futura — última peça funcional da feature.

- [ ] **Step 1: `kanbrainTerminal.ts` — saber se o terminal é novo, mandar o comando só nesse caso**

```ts
function findOrCreateTerminal(): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  if (existing) {
    return { terminal: existing, isNew: false };
  }
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

- [ ] **Step 2: Mesma mudança em `tabTerminal.ts`**

```ts
function findOrCreateTerminalForTab(tabId: string): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = terminalsByTab.get(tabId);
  if (existing) {
    return { terminal: existing, isNew: false };
  }
  const terminal = vscode.window.createTerminal(`Kanbrain ${nextTerminalOrdinal++}`);
  terminalsByTab.set(tabId, terminal);
  return { terminal, isNew: true };
}

export function sendReadCommandForTab(tabId: string, relativeContextFilePath: string, aiProviderCommand?: string): void {
  const { terminal, isNew } = findOrCreateTerminalForTab(tabId);
  terminal.show();
  if (isNew && aiProviderCommand) {
    terminal.sendText(aiProviderCommand);
  }
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
```

- [ ] **Step 3: Passar `config.aiProviderCommand` nos 6 chamadores**

Em cada um dos 5 `src/commands/configureXWithAi.ts`, trocar a linha final:

```ts
// antes
  sendReadCommand(relativePath);
// depois
  sendReadCommand(relativePath, config.aiProviderCommand);
```

(`config` já está em escopo em todos — foi lido no topo de cada função.)

Em `src/view/KanbrainViewProvider.ts`, `executeSkill` (por volta da linha 852):

```ts
// antes
    sendReadCommandForTab(this.activeTabId, relativePath);
// depois
    sendReadCommandForTab(this.activeTabId, relativePath, config.aiProviderCommand);
```

- [ ] **Step 4: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p .` then `npx vitest run`
Expected: ambos limpos — nenhum teste existente cobre esses arquivos (sem regressão possível de testes automatizados; a verificação real é manual, na Task 5).

Do not commit — see Global Constraints.

---

## Task 5: Verificação manual end-to-end

**Files:** nenhum — só roda a extensão.

- [ ] **Step 1: Abrir a extensão (F5) contra um workspace Kanbrain real, com `claude` (ou outro agente) instalado no PATH.**

- [ ] **Step 2: Configurar o preset**

Ir na tela Config → seção Terminal. Selecionar "Claude Code". Confirmar que salva (recarregar a extensão e ver que a seleção persiste) e que `.kanbrain/config.local.json` tem `"aiProviderCommand": "claude"` — e que `.kanbrain/config.json` **não** tem esse campo.

- [ ] **Step 3: Terminal novo — comando é enviado**

Fechar qualquer terminal "Kanbrain"/"Kanbrain N" aberto. Rodar uma skill num work item. Confirmar que o terminal novo primeiro roda `claude` (ou o comando configurado) e só depois recebe a instrução de leitura do arquivo — não os dois ao mesmo tempo/fora de ordem.

- [ ] **Step 4: Terminal reaproveitado — comando não é reenviado**

Com o agente já rodando (do Step 3), rodar a mesma skill (ou outra) de novo, sem fechar o terminal. Confirmar que `claude` **não** é digitado de novo — só a nova instrução de leitura.

- [ ] **Step 5: Custom**

Selecionar "Custom command..." no dropdown, digitar um comando qualquer (ex: `echo hello`), sair do campo (blur). Confirmar que salva. Fechar o terminal, rodar uma skill de novo, confirmar que o comando custom é o que roda.

- [ ] **Step 6: None (comportamento atual preservado)**

Selecionar "None". Fechar o terminal, rodar uma skill. Confirmar que só a instrução de leitura é enviada, nenhum comando extra — igual ao comportamento de antes desta feature.

- [ ] **Step 7: Comandos "Configure with AI" (Setup/Skills/Workflow/Profiles/Repositories)**

Com um preset configurado, fechar o terminal "Kanbrain" (o compartilhado, não o de aba). Rodar qualquer um dos comandos "Configure with AI" pela paleta ou pelo botão na tela Brain/Config. Confirmar que o mesmo comportamento (comando do provedor só em terminal novo) se aplica aqui também.

- [ ] **Step 8: Reportar resultados**

Se tudo dos Steps 2-7 passar, a feature está pronta. Se algo falhar, corrigir como um follow-up pequeno da task específica que introduziu aquilo, depois rodar este checklist de novo desde o topo.

Do not commit — see Global Constraints. Wait for explicit instruction before committing or pushing anything from this plan.
