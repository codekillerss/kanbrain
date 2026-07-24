# Mapeamento repositoryId → path local — Design

## Contexto e motivação

Um projeto Azure DevOps pode ter vários repositórios git, e o workspace aberto no VS Code nem sempre é o clone exato de um deles — muitos usuários (o autor incluso) abrem o VS Code numa pasta pai que contém vários repos clonados lado a lado. Hoje `checkoutBranch`, `getRemoteUrl` e `kanbrain.viewPullRequestDiff` (`gitlens.compareWith`) assumem cegamente que `workspaceRoot` É o repositório certo; `isSameRepository` só compara contra essa raiz (sem procurar em outro lugar) e, mesmo quando detecta um descompasso, deixa o usuário prosseguir mesmo assim.

Direção validada: descoberta automática por varredura de subpastas (Setup/Sync), guardada como **configuração persistida e editável** em `.kanbrain/config.json` — mesma filosofia já usada por `skills`/`cardSettingsByTeam` (Setup/Sync populam, o usuário ajusta manualmente depois numa tela própria).

## Escopo

**Dentro do escopo:**
- Novo campo `KanbrainConfig.repositories?: Record<string, { name: string; path: string }>`, chaveado pelo `repositoryId` (GUID, estável mesmo se o repo for renomeado).
- `AzureDevOpsClient.listRepositories(organization, project)` — novo método.
- `discoverLocalRepositories(workspaceRoot)` — varre `workspaceRoot` + suas subpastas de primeiro nível atrás de `.git`, lê o remote de cada uma.
- `extractRepoNameFromRemoteUrl(url)` — extraída da lógica hoje dentro de `isSameRepository` (que é removida — sua única responsabilidade é substituída por esta comparação exata via config).
- `matchRepositoriesToLocalPaths(azureRepos, localRepos)` — função pura que casa os dois.
- Nova pergunta no `Kanbrain: Setup`: *"Do you want to map the repositories of this project?"*.
- `Kanbrain: Sync Board Configuration` passa a também descobrir/mesclar `repositories` (nunca sobrescrevendo um `path` já setado manualmente).
- `checkoutBranch`/`viewPullRequestDiff` passam a ler `config.repositories[repositoryId].path` em vez de assumir `workspaceRoot`.
- Nova tela "Repositories" (acessível por um botão na Home), com um campo de path editável por repositório e um seletor de pasta.

**Fora do escopo:**
- Qualquer varredura/rescan disparado a partir da própria tela Repositories (só Setup/Sync populam — decisão explícita, mantém a tela simples).
- Remover do config entradas de repositórios que somem do projeto Azure DevOps (mesma política de "nunca deleta" já usada pra `skills`).
- Suporte a múltiplos workspace folders (`vscode.workspace.workspaceFolders` com mais de um item) — a varredura continua olhando só pro primeiro folder, como já é hoje em todo o resto do código.

## Design

### Tipos (`src/types.ts`)

```ts
export interface RepositoryPathEntry {
  name: string;
  path: string;
}

export interface KanbrainConfig {
  // ...campos existentes
  repositories?: Record<string, RepositoryPathEntry>;
}
```

### `AzureDevOpsClient.listRepositories` (`src/azureDevOps/client.ts`)

```ts
async listRepositories(organization: string, project: string): Promise<{ id: string; name: string }[]> {
  try {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1`,
    );
    return data.value.map(r => ({ id: r.id, name: r.name }));
  } catch {
    return [];
  }
}
```

### `extractRepoNameFromRemoteUrl` (`src/git/extractRepoNameFromRemoteUrl.ts`, novo — substitui `isSameRepository.ts`)

```ts
export function extractRepoNameFromRemoteUrl(remoteUrl: string): string | null {
  const lastSegment = decodeURIComponent(remoteUrl.trim())
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .split(/[/:]/)
    .pop();
  return lastSegment || null;
}
```

`isSameRepository.ts` e `isSameRepository.test.ts` são removidos (única responsabilidade migrada pra cá; nenhum outro call site depende deles fora de `checkoutBranch.ts`, que deixa de precisar dessa checagem).

### `discoverLocalRepositories` (`src/git/discoverLocalRepositories.ts`, novo)

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRemoteUrl } from './getRemoteUrl';
import { extractRepoNameFromRemoteUrl } from './extractRepoNameFromRemoteUrl';

export async function discoverLocalRepositories(workspaceRoot: string): Promise<Map<string, string>> {
  const candidates = [workspaceRoot];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(path.join(workspaceRoot, entry.name));
    }
  }

  const result = new Map<string, string>();
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, '.git'))) {
      continue;
    }
    const remoteUrl = await getRemoteUrl(candidate);
    const repoName = remoteUrl ? extractRepoNameFromRemoteUrl(remoteUrl) : null;
    if (repoName && !result.has(repoName.toLowerCase())) {
      result.set(repoName.toLowerCase(), candidate);
    }
  }
  return result;
}
```

### `matchRepositoriesToLocalPaths` (`src/config/matchRepositoriesToLocalPaths.ts`, novo)

```ts
export function matchRepositoriesToLocalPaths(
  azureRepos: { id: string; name: string }[],
  localRepos: Map<string, string>,
): Record<string, { name: string; path: string }> {
  const result: Record<string, { name: string; path: string }> = {};
  for (const repo of azureRepos) {
    result[repo.id] = { name: repo.name, path: localRepos.get(repo.name.toLowerCase()) ?? '' };
  }
  return result;
}
```

### `Kanbrain: Setup` (`src/commands/setup.ts`)

Depois da pergunta existente sobre gerar skill files:

```ts
const mapReposPick = await vscode.window.showQuickPick(
  [
    { label: 'Yes', map: true },
    { label: 'No', map: false },
  ],
  { placeHolder: 'Do you want to map the repositories of this project?' },
);
if (!mapReposPick) {
  return;
}

const azureRepos = await client.listRepositories(orgPick.org.name, projectPick.project.name);
const localRepos = mapReposPick.map ? await discoverLocalRepositories(workspaceRoot) : new Map<string, string>();
const repositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
```

`repositories` entra no objeto passado pra `writeConfig(...)` junto dos outros campos. Isso garante que a tela Repositories nunca fica vazia por falta de rodar Setup — só o preenchimento automático de `path` é condicional ao Yes/No.

### `Kanbrain: Sync Board Configuration` (`src/commands/syncBoardConfig.ts` + `src/config/syncConfig.ts`)

Em `syncBoardConfig.ts`, ao lado das outras descobertas:

```ts
const azureRepos = await client.listRepositories(result.config.organization, result.config.project);
const localRepos = await discoverLocalRepositories(workspaceRoot);
const freshRepositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
```

`syncConfig` ganha um parâmetro `freshRepositories` e mescla preservando qualquer `path` já existente:

```ts
function mergeRepositories(
  existing: Record<string, RepositoryPathEntry> | undefined,
  fresh: Record<string, RepositoryPathEntry>,
): Record<string, RepositoryPathEntry> {
  const merged: Record<string, RepositoryPathEntry> = {};
  for (const [id, freshEntry] of Object.entries(fresh)) {
    const existingEntry = existing?.[id];
    merged[id] = { name: freshEntry.name, path: existingEntry?.path || freshEntry.path };
  }
  for (const [id, existingEntry] of Object.entries(existing ?? {})) {
    if (!(id in merged)) {
      merged[id] = existingEntry;
    }
  }
  return merged;
}
```

(`existingEntry?.path || freshEntry.path` — se o usuário já setou um path manualmente, ele vence; se nunca setou (`''`), aceita um novo match automático da varredura fresca.)

### `checkoutBranch.ts`

```ts
export function registerCheckoutBranchCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkoutBranch', async (repositoryId: string, branchName: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const repoEntry = config.repositories?.[repositoryId];
    if (!repoEntry?.path) {
      const label = repoEntry?.name ?? 'this repository';
      vscode.window.showErrorMessage(`No local path configured for "${label}". Set it on the Repositories page (Home → Repositories).`);
      return;
    }

    const choice = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
    if (choice !== 'Checkout') {
      return;
    }

    try {
      await checkoutBranch(repoEntry.path, branchName);
      vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
    }
  });
}
```

`client` sai da assinatura (não é mais necessário — nem `getRemoteUrl`/`isSameRepository`). `extension.ts` atualiza a chamada de `registerCheckoutBranchCommand(client, workspaceRoot)` para `registerCheckoutBranchCommand(workspaceRoot)`.

### `viewPullRequestDiff.ts`

```ts
export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand(
    'kanbrain.viewPullRequestDiff',
    async (repositoryId: string, sourceBranch: string, targetBranch: string) => {
      const config = readConfig(workspaceRoot);
      if (!config) {
        return;
      }

      const repoEntry = config.repositories?.[repositoryId];
      if (!repoEntry?.path) {
        const label = repoEntry?.name ?? 'this repository';
        vscode.window.showErrorMessage(`No local path configured for "${label}". Set it on the Repositories page (Home → Repositories).`);
        return;
      }

      await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoEntry.path), {
        ref1: targetBranch,
        ref2: sourceBranch,
      });
    },
  );
}
```

`renderPullRequestDetail.ts`'s `renderDiffAction` passa a incluir `pr.repositoryId` nos args do command URI: `[pr.repositoryId, pr.sourceBranch, pr.targetBranch]`.

### Tela "Repositories"

**`render.ts`**: `RenderState.screen` ganha `'repositories'`; dispatch `if (state.screen === 'repositories') return renderRepositories(state);`.

**`renderHome.ts`**: novo section-card, ao lado de "Configuration":

```ts
<div class="kb-section-card">
  <div class="kb-section-label">Repositories</div>
  <div class="kb-home-commands">
    <button id="kb-show-repositories-btn" class="kb-secondary-btn">📁 Repositories</button>
  </div>
</div>
```

**`renderRepositories.ts`** (novo, espelha `renderConfig.ts`/`renderConfigEditor.ts`):

```ts
import type { RenderState } from './render';
import { escapeHtml } from './escapeHtml';

export function renderRepositories(state: RenderState): string {
  const config = state.config!;
  const entries = Object.entries(config.repositories ?? {});

  const body = entries.length
    ? entries
        .map(
          ([id, entry]) => `
      <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
        <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
        <div class="kb-config-field-path">
          <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
          <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
        </div>
      </div>
    `,
        )
        .join('')
    : '<div class="kb-empty">No repositories mapped yet. Run Kanbrain: Setup or Kanbrain: Sync Board Configuration to discover them.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Repository Paths</div>
      ${body}
    </div>
  `;
}
```

CSS: reaproveita `.kb-config-field-path`/`.kb-input`/`.kb-config-parent-section` já existentes; adiciona só `.kb-repo-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }` e `.kb-repo-name { font-weight: 600; margin-bottom: 4px; font-size: 12px; }`.

**`KanbrainViewProvider.ts`**:
- `showRepositoriesScreen()` — mesmo padrão de `showConfigScreen()` (`this.currentScreen = 'repositories'; this.lastState = ''; void this.refresh();`).
- Mensagens novas em `onDidReceiveMessage`: `'show-repositories'` → `showRepositoriesScreen()`; `'save-repository-path'` → `saveRepositoryPath(repositoryId, path)`; `'pick-repository-folder'` → `pickRepositoryFolder(repositoryId)`.
- `saveRepositoryPath(repositoryId: string, newPath: string)`: lê config, `if (!config.repositories?.[repositoryId]) return;`, seta `.path = newPath.trim()`, `writeConfig`.
- `pickRepositoryFolder(repositoryId: string)`: `vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false })`; se escolher algo, `postMessage({ type: 'repository-folder-picked', repositoryId, path: picked.fsPath })` (path **absoluto**, ao contrário do skill-file-picker que usa relativo).
- Script inline em `wrapHtml()`: botão Home → `postMessage({type:'show-repositories'})`; blur no `.kb-repo-row input[data-field="path"]` → `postMessage({type:'save-repository-path', repositoryId: row.dataset.repositoryId, path: input.value})`; clique em `[data-action="pick-repository-folder"]` → `postMessage({type:'pick-repository-folder', repositoryId: row.dataset.repositoryId})`; listener de `'repository-folder-picked'` → preenche o input correspondente e dispara o save, mesma mecânica de `'skill-file-picked'`.

## Tratamento de erros

- `checkoutBranch`/`viewPullRequestDiff` sem `path` configurado (ou repositoryId desconhecido): mensagem de erro direta, aponta pra tela Repositories, nenhum comando git é executado.
- `listRepositories`/`discoverLocalRepositories` falhando durante Setup/Sync: mesma política já usada pras outras descobertas em `syncBoardConfig.ts` (falha do Sync inteiro com `showErrorMessage`, nada é escrito) — não é uma etapa isolada com fallback silencioso.
- Path salvo manualmente que não existe mais em disco ou não é git: sem validação no salvamento (mantém simples); `checkoutBranch`/`gitlens.compareWith` vão simplesmente falhar com seus próprios erros nativos ao tentar usar o path errado — mesmo padrão de "deixa falhar de forma visível" já aceito no resto do projeto.

## Testes

- `extractRepoNameFromRemoteUrl.test.ts` (migra os casos de `isSameRepository.test.ts`: https, ssh, barra final, sufixo `.git`, segmento url-encoded).
- `discoverLocalRepositories.test.ts`: usa diretórios reais em `tmpdir()` (mesmo padrão de `getCurrentBranch.test.ts`) — encontra repo na própria raiz, encontra repos em subpastas de primeiro nível, ignora subpastas sem `.git`, ignora repos aninhados 2 níveis abaixo.
- `matchRepositoriesToLocalPaths.test.ts`: match encontrado, sem match (path vazio), comparação case-insensitive.
- `client.test.ts`: casos novos para `listRepositories` (sucesso, lista vazia, erro → `[]`), mesmo estilo dos testes de `getRepository`.
- `syncConfig.test.ts`: casos novos — repo novo com match automático, repo novo sem match (`path: ''`), path já setado manualmente é preservado mesmo se a varredura fresca achar outro caminho, `name` é atualizado se o repo foi renomeado no Azure DevOps.
- `renderRepositories.test.ts` (novo): linha por repositório com nome escapado e valor do path; mensagem de vazio quando `config.repositories` é `undefined`/`{}`; botão de pasta com o `data-repository-id` correto.
- `renderPullRequestDetail.test.ts`: atualizar o teste do botão "View Diff" pra checar `repositoryId` nos args do command URI.
- Sem teste automatizado pra `setup.ts`/`syncBoardConfig.ts`/`KanbrainViewProvider.ts`/`checkoutBranch.ts`/`viewPullRequestDiff.ts`/`extension.ts` (mesmo padrão já estabelecido — glue do VS Code, verificado manualmente via F5).
