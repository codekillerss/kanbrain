# Página "Brain" com Configure with AI por segmento — Design

## Contexto e motivação

Hoje a tela "Configuration" (`renderConfig.ts`) acumula Project, Display, Profiles e Skill Configuration, e "Repositories" é uma tela separada (`renderRepositories.ts`). O único "Configure with AI" existente (`kanbrain.configureWithAi`) é genérico: descobre tipos/board/estatísticas e gera um único markdown cobrindo tudo de uma vez (`setup-assistant-*.md`), que o usuário manda um agente ler no terminal Kanbrain.

O usuário quer poder acionar a IA de forma **escopada por área** — configurar só os repositórios, só as skills, ou só os profiles — e quer essas três áreas reunidas numa página só, com nome próprio: **Brain**.

## Escopo

**Dentro do escopo:**
- Nova tela `screen: 'brain'`, substituindo a tela `'repositories'` isolada e absorvendo as seções Profiles e Skill Configuration que saem de "Configuration".
- "Configuration" (`renderConfig.ts`) fica só com "Project" (mantém Setup + o "Configure with AI" genérico existente) e "Display".
- Três segmentos colapsáveis em "Brain": Repositories, Skills, Profiles — mesmo conteúdo de hoje (`renderRepositories`, `renderConfigEditor`, `renderProfilesEditor`), cada um com um botão "✨ Configure with AI" próprio no cabeçalho, ao lado do chevron de colapsar.
- Três comandos novos (`kanbrain.configureRepositoriesWithAi`, `kanbrain.configureSkillsWithAi`, `kanbrain.configureProfilesWithAi`), cada um gerando seu próprio markdown de instruções e mandando ler no terminal — mesmo mecanismo do `configureWithAi` atual (`writeGeneratedFile` + `sendReadCommand`).
- Repos: a extensão roda a mesma descoberta determinística do Sync (`listRepositories` + `discoverLocalRepositories` + `matchRepositoriesToLocalPaths`) e gera um relatório; a instrução pede pro agente **só** gravar os paths já encontrados localmente e **sugerir** (não executar) o clone dos que faltam.
- Skills: reaproveita a descoberta de tipos/board do assistant genérico; a instrução manda o **agente** rodar `Kanbrain: Sync Board Configuration` como primeiro passo, e ao escrever cada skill file pensar numa Definition of Done por status (só no raciocínio do agente, nada persistido em `config.json`).
- Profiles: descobre tipos de trabalho + time; mostra os profiles já configurados; instrui o agente a propor ajustes/novos profiles alinhados ao time real, confirmar com o usuário, e só então gravar em `config.profiles`.
- Rodapé: botão 📁 (`kb-show-repositories-btn`) vira 🧠 (`kb-show-brain-btn`, título "Brain"), ativo quando `screen === 'brain'`.
- `KanbrainViewProvider.showRepositoriesScreen()` renomeado para `showBrainScreen()`; `resolveRepositoryTag.ts` atualizado para chamar o novo nome.
- Extração de `renderTypes`/`renderBoards` de `buildSetupAssistantFile.ts` para um módulo compartilhado `src/skills/renderDiscoveredBoardInfo.ts` (reaproveitado pelo novo builder de Skills).

**Fora do escopo:**
- Persistir estado de colapsado dos 3 segmentos entre sessões (diferente do Parent/Children do Flow) — não foi pedido aqui, cada segmento nasce expandido a cada render.
- Qualquer campo estruturado de "Definition of Done" no schema do config — fica só como raciocínio do agente.
- Clone automático de repositórios pela IA — sempre só sugestão, o clone continua manual (botão existente ou terminal do próprio usuário).
- Registrar os 3 novos comandos com atalhos de teclado ou mudar o comando genérico `kanbrain.configureWithAi` existente.
- Testes automatizados para os 3 novos arquivos de comando (`src/commands/configure*WithAi.ts`) — mesmo precedente do `configureWithAi.ts` atual, que também não tem teste (é cola de `vscode`/`fs`, verificado manualmente).

## Design

### `src/view/render.ts`

`RenderState.screen` passa de `'home' | 'flow' | 'config' | 'repositories'` para `'home' | 'flow' | 'config' | 'brain'`. O branch `if (state.screen === 'repositories')` vira `if (state.screen === 'brain') return \`${renderBrain(state)}${renderSearchDialog()}${renderFooter(state)}\`;`.

### `src/view/renderBrain.ts` (novo)

```ts
import type { RenderState } from './render';
import { renderRepositoriesBody } from './renderRepositories';
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';

function renderSegment(title: string, segment: string, body: string): string {
  return `
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">
        <button type="button" class="kb-parent-header-toggle" data-action="toggle-group">
          <span><span class="kb-chevron">▾</span>${title}</span>
        </button>
        <button type="button" class="kb-secondary-btn" data-action="run-segment-ai" data-segment="${segment}">✨ Configure with AI</button>
      </div>
      <div class="kb-collapsible-body">
        ${body}
      </div>
    </div>
  `;
}

export function renderBrain(state: RenderState): string {
  const config = state.config!;
  return [
    renderSegment('Repositories', 'repositories', renderRepositoriesBody(config)),
    renderSegment('Skills', 'skills', renderConfigEditor(config)),
    renderSegment('Profiles', 'profiles', renderProfilesEditor(config.profiles ?? {})),
  ].join('');
}
```

(Segue o mesmo formato `<span><span class="kb-chevron">…</span>título</span>` já usado no Flow, pra não reproduzir o bug de `justify-content: space-between` separando chevron e texto que já corrigimos lá.)

### `src/view/renderRepositories.ts`

Passa a exportar só o corpo (sem o `kb-config-parent-section`/`kb-config-parent-header` que hoje ele mesmo desenha — isso vira responsabilidade de `renderBrain.ts`):

```ts
export function renderRepositoriesBody(config: KanbrainConfig): string {
  const entries = Object.entries(config.repositories ?? {});
  // ...mesmo corpo de hoje (mapeamento de linhas / mensagem vazia), sem o wrapper externo
}
```

### `src/view/renderConfig.ts`

Remove as seções "Profiles" e "Skill Configuration" (e os imports de `renderConfigEditor`/`renderProfilesEditor`). Fica só com Project + Display.

### `src/view/renderFooter.ts`

```ts
<button id="kb-show-brain-btn" class="${footerBtnClass(state.screen === 'brain')}" title="Brain">🧠</button>
```//no lugar do atual botão `kb-show-repositories-btn`/📁, mesma posição.

### `src/view/KanbrainViewProvider.ts`

- `currentScreen` type: `'home' | 'flow' | 'config' | 'brain'`.
- `showRepositoriesScreen()` renomeado para `showBrainScreen()` (só troca `this.currentScreen = 'repositories'` por `'brain'`).
- Mensagem `'show-repositories'` renomeada para `'show-brain'`; branch chama `this.showBrainScreen()`.
- No clique delegado do webview: `target.id === 'kb-show-repositories-btn'` vira `target.id === 'kb-show-brain-btn'`, posta `{ type: 'show-brain' }`.
- Handler do `toggle-group` ganha um fallback: hoje faz `toggle.nextElementSibling`; passa a fazer `const container = toggle.closest('.kb-config-parent-header') || toggle; const items = container.nextElementSibling;` — necessário porque agora o botão de toggle e o botão "Configure with AI" são irmãos dentro do mesmo cabeçalho (o toggle não é mais direto irmão do corpo colapsável). Não quebra o uso existente (Flow, Config Editor) porque `closest('.kb-config-parent-header')` retorna `null` nesses casos, caindo no `|| toggle` de sempre.
- Novo branch de mensagem:
  ```ts
  } else if (message.type === 'run-segment-ai') {
    await this.runSegmentAi(String(message.segment ?? ''));
  }
  ```
- Novo método:
  ```ts
  private async runSegmentAi(segment: string): Promise<void> {
    const commandBySegment: Record<string, string> = {
      repositories: 'kanbrain.configureRepositoriesWithAi',
      skills: 'kanbrain.configureSkillsWithAi',
      profiles: 'kanbrain.configureProfilesWithAi',
    };
    const command = commandBySegment[segment];
    if (!command) return;
    await vscode.commands.executeCommand(command);
    this.notifyCommandFinished();
  }
  ```
- Novo branch de clique no JS inline do webview:
  ```js
  } else if (target.dataset && target.dataset.action === 'run-segment-ai') {
    vscode.postMessage({ type: 'run-segment-ai', segment: target.dataset.segment });
  }
  ```

### CSS (`KanbrainViewProvider.ts`)

```css
.kb-config-parent-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kb-parent-header-toggle { appearance: none; -webkit-appearance: none; border: none; background: transparent; padding: 0; cursor: pointer; display: flex; align-items: center; font: inherit; color: inherit; }
.kb-config-parent-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
```

(`justify-content: space-between` num `.kb-config-parent-header` com um único filho de texto, como em "Project"/"Display", continua idêntico visualmente — só afeta os casos com dois filhos.)

### `src/commands/resolveRepositoryTag.ts`

`provider.showRepositoriesScreen()` → `provider.showBrainScreen()`.

### `src/skills/renderDiscoveredBoardInfo.ts` (novo, extraído de `buildSetupAssistantFile.ts`)

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

export function renderDiscoveredTypes(types: DiscoveredWorkItemType[]): string { /* mesmo corpo de renderTypes hoje */ }
export function renderDiscoveredBoards(boards: DiscoveredBoard[]): string { /* mesmo corpo de renderBoards hoje */ }
```

`buildSetupAssistantFile.ts` passa a importar essas duas funções em vez de defini-las localmente (comportamento idêntico, só remove duplicação).

### `src/skills/buildRepositoriesAssistantFile.ts` (novo)

```ts
import type { RepositoryPathEntry } from '../types';

export function buildRepositoriesAssistantContent(
  organization: string,
  project: string,
  repositories: Record<string, RepositoryPathEntry>,
): string {
  // Lista "Repositories found locally" (entry.path truthy) e "Repositories NOT found locally" (entry.path === '').
  // "What to do": (1) gravar os paths encontrados em config.repositories; (2) para os não encontrados, avisar o
  // usuário e sugerir clone (botão existente na página Brain ou manual) sem rodar git clone; (3) não criar/renomear/
  // remover entradas — a lista vem do Azure DevOps real, via Kanbrain: Sync Board Configuration.
}
```

### `src/commands/configureRepositoriesWithAi.ts` (novo)

Mesmo esqueleto do `configureWithAi.ts` atual: lê config, chama `client.listRepositories` + `discoverLocalRepositories` (usando `config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH`) + `matchRepositoriesToLocalPaths`, monta o conteúdo com `buildRepositoriesAssistantContent`, escreve `repositories-assistant-<timestamp>.md` via `writeGeneratedFile`, chama `sendReadCommand`. Registra `kanbrain.configureRepositoriesWithAi`.

### `src/skills/buildSkillsAssistantFile.ts` (novo)

Estrutura próxima de `buildSetupAssistantFile.ts`, mas:
- Seção "Scope" no topo avisando que é só sobre skills (não mexe em `repositories`/`profiles`).
- Um passo 0 explícito: "Run **Kanbrain: Sync Board Configuration** yourself before anything else" (o agente decide/executa, a extensão não roda o sync sozinha).
- Reaproveita `renderDiscoveredTypes`/`renderDiscoveredBoards` pra mostrar tipos/status/boards.
- Nos passos de "What to do", mantém a proposta de mapeamento status → skill (igual ao assistant genérico), mas acrescenta: antes de escrever cada skill file, pensar numa Definition of Done concreta pro status daquele tipo (o que significa "pronto" nessa etapa) e usar isso pra decidir o conteúdo real das instruções — sem persistir a DoD em nenhum campo do config.

### `src/commands/configureSkillsWithAi.ts` (novo)

Mesmo esqueleto do `configureWithAi.ts` atual (mesma descoberta de team/types/boards), chamando `buildSkillsAssistantContent` em vez de `buildSetupAssistantContent`, escrevendo `skills-assistant-<timestamp>.md`. Registra `kanbrain.configureSkillsWithAi`.

### `src/skills/buildProfilesAssistantFile.ts` (novo)

Recebe organization, project, team, tipos descobertos e os profiles já configurados (`config.profiles ?? {}`). Conteúdo:
- Explica o que é um profile (label + description prependada ao contexto de skill, conforme já documentado em `generateContextFile.ts`).
- Lista os profiles já configurados (id/label/description).
- Lista os tipos de trabalho reais do projeto.
- "What to do": olhar tipos/time reais, decidir se os profiles atuais cobrem os papéis do time ou se falta algum, propor ao usuário (com raciocínio) antes de gravar, e só então atualizar `.kanbrain/config.json`'s `profiles` — sem remover profiles existentes a menos que o usuário peça.

### `src/commands/configureProfilesWithAi.ts` (novo)

Mesmo esqueleto: lê config, descobre team + types, chama `buildProfilesAssistantContent`, escreve `profiles-assistant-<timestamp>.md`, `sendReadCommand`. Registra `kanbrain.configureProfilesWithAi`.

### `src/extension.ts`

Três novos imports + três novas linhas em `context.subscriptions.push(...)`, ao lado de `registerConfigureWithAiCommand`:

```ts
registerConfigureRepositoriesWithAiCommand(client, workspaceRoot),
registerConfigureSkillsWithAiCommand(client, workspaceRoot),
registerConfigureProfilesWithAiCommand(client, workspaceRoot),
```

### `package.json`

Três entradas novas em `contributes.commands`:

```json
{ "command": "kanbrain.configureRepositoriesWithAi", "title": "Kanbrain: Configure Repositories with AI" },
{ "command": "kanbrain.configureSkillsWithAi", "title": "Kanbrain: Configure Skills with AI" },
{ "command": "kanbrain.configureProfilesWithAi", "title": "Kanbrain: Configure Profiles with AI" }
```

## Tratamento de erros

- Sem `config` (workspace não configurado): mesmo padrão dos comandos existentes — `showErrorMessage` e retorna, sem gerar arquivo.
- Falha na chamada à API do Azure DevOps (rede, permissão): `showErrorMessage` com a mensagem do erro, sem gerar arquivo parcial — mesmo padrão de `configureWithAi.ts`.
- Segmento desconhecido em `runSegmentAi` (não deveria acontecer, já que os 3 botões só existem com `data-segment` fixo): não faz nada, sem lançar erro.

## Testes

- `renderBrain.test.ts` (novo): as 3 seções aparecem com título, chevron e botão "Configure with AI" com `data-segment` correto; conteúdo de cada segmento é delegado corretamente (spot-check, não duplica a suíte de cada editor); corpo de cada segmento fica dentro de `.kb-collapsible-body`, próximo irmão do cabeçalho.
- `renderRepositories.test.ts`: atualizado para testar `renderRepositoriesBody` isolado (sem o wrapper `kb-config-parent-section`).
- `renderConfig.test.ts`: remove asserções sobre Profiles/Skill Configuration; garante que a tela 'config' não contém mais `kb-config-level`/perfis.
- `renderFooter.test.ts`: `kb-show-repositories-btn` → `kb-show-brain-btn`; título "Brain"; ativo quando `screen === 'brain'`.
- `render.test.ts`: união de `screen` atualizada (`'repositories'` → `'brain'`) em todos os testes parametrizados; delega pra `renderBrain`.
- `buildRepositoriesAssistantFile.test.ts` (novo): organization/project aparecem; repositório com path aparece em "found locally"; repositório sem path aparece em "NOT found locally"; instrução de não rodar clone automaticamente está presente.
- `buildSkillsAssistantFile.test.ts` (novo): organization/project/tipos/boards aparecem (mesmas asserções de `buildSetupAssistantFile.test.ts`); menciona "Sync Board Configuration" como primeiro passo; menciona "Definition of Done".
- `buildProfilesAssistantFile.test.ts` (novo): organization/project/team aparecem; profiles já configurados aparecem (id/label/description); tipos de trabalho aparecem; instrução de confirmar com o usuário antes de gravar está presente.
- Sem teste para os 3 novos `src/commands/configure*WithAi.ts` nem para `runSegmentAi`/JS inline do webview — mesmo precedente de `configureWithAi.ts` (cola de `vscode`, verificado manualmente via F5).
