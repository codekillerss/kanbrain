# Botão de Clone na tela Repositories — Design

## Contexto e motivação

A tela Repositories (`renderRepositories.ts`) já lista os repositórios mapeados no projeto Azure DevOps e permite configurar o `path` local de cada um manualmente (digitando ou usando "Browse for a folder"). Quando o repositório ainda não está clonado em lugar nenhum, o usuário precisa clonar manualmente fora do VS Code e depois voltar pra apontar o path.

O fluxo de clone já existe — `kanbrain.resolveRepositoryTag` (`src/commands/resolveRepositoryTag.ts`), disparado a partir de um link de PR/skill que referencia um repositório sem path configurado, oferece "Clone repository" num QuickPick e usa `cloneRepository()` (`src/git/cloneRepository.ts`) com uma URL montada como `https://dev.azure.com/{org}/{project}/_git/{repoName}`. Essa mesma capacidade deve ficar acessível diretamente na tela Repositories, sem precisar passar por um link de PR primeiro.

## Escopo

**Dentro do escopo:**
- Botão "Clone" em cada linha da tela Repositories cujo `path` esteja vazio (repositório ainda não mapeado localmente).
- Ao clicar: pede pasta destino (pai) via `showOpenDialog`, roda `git clone` reaproveitando `cloneRepository()`, salva o `path` resultante no config e atualiza a tela.
- Mensagens de sucesso/erro via `vscode.window.showInformationMessage`/`showErrorMessage`, mesmo padrão de `resolveRepositoryTag.ts`.

**Fora do escopo:**
- Repositórios que já têm `path` configurado não ganham botão de Clone (só o fluxo de path/browse já existente).
- Progresso/streaming do `git clone` (mesmo comportamento silencioso-até-terminar já usado em `resolveRepositoryTag.ts`).
- Alterar `resolveRepositoryTag.ts` — continua existindo como está, para o fluxo via link de PR.

## Design

### `renderRepositories.ts`

Quando `entry.path` está vazio, a linha ganha um botão "Clone" ao lado do input/browse existente:

```ts
const body = entries.length
  ? entries
      .map(([id, entry]) => `
    <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
      <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
        <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
        ${!entry.path ? `<button type="button" class="kb-secondary-btn" data-action="clone-repository" title="Clone this repository">Clone</button>` : ''}
      </div>
    </div>
  `)
      .join('')
  : '<div class="kb-empty">...</div>';
```

### `KanbrainViewProvider.ts`

- Nova mensagem em `onDidReceiveMessage`: `'clone-repository'` → `await this.cloneRepositoryFromView(String(message.repositoryId ?? ''))`.
- Novo método `cloneRepositoryFromView(repositoryId: string)`, espelhando o branch "clone" de `resolveRepositoryTag.ts`:

```ts
private async cloneRepositoryFromView(repositoryId: string): Promise<void> {
  if (!this.workspaceRoot || !this.view) {
    return;
  }
  const config = readConfig(this.workspaceRoot);
  const entry = config?.repositories?.[repositoryId];
  if (!config || !entry) {
    return;
  }

  const parentUris = await vscode.window.showOpenDialog({
    defaultUri: vscode.Uri.file(this.workspaceRoot),
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select destination folder',
  });
  const parentDir = parentUris?.[0]?.fsPath;
  if (!parentDir) {
    return;
  }

  const cloneUrl = `https://dev.azure.com/${config.organization}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(entry.name)}`;

  try {
    const clonedPath = await cloneRepository(parentDir, cloneUrl, entry.name);
    const freshConfig = readConfig(this.workspaceRoot);
    if (freshConfig?.repositories?.[repositoryId]) {
      freshConfig.repositories[repositoryId].path = clonedPath;
      writeConfig(this.workspaceRoot, freshConfig);
    }
    vscode.window.showInformationMessage(`Cloned "${entry.name}" to ${clonedPath}.`);
    this.lastState = '';
    void this.refresh();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Clone failed: ${detail}`);
  }
}
```

- Import novo: `import { cloneRepository } from '../git/cloneRepository';`.
- Script inline em `wrapHtml()`: listener no clique de `[data-action="clone-repository"]`, mesmo padrão do listener de `pick-repository-folder` (linha ~701) — pega `row.dataset.repositoryId` e faz `vscode.postMessage({ type: 'clone-repository', repositoryId })`.

### CSS

Reaproveita `.kb-secondary-btn` já existente — nenhuma classe nova necessária.

## Tratamento de erros

- `repositoryId` desconhecido ou config ausente: método retorna sem fazer nada (mesmo padrão silencioso de `pickRepositoryFolder`/`saveRepositoryPath`).
- Usuário cancela o `showOpenDialog`: retorna sem fazer nada.
- `git clone` falha (URL inválida, sem permissão, pasta já existe, etc.): `showErrorMessage` com o detalhe do erro; config não é alterado.

## Testes

- `renderRepositories.test.ts`: novo caso — linha com `path: ''` inclui `data-action="clone-repository"`; linha com `path` preenchido não inclui.
- Sem teste automatizado para `KanbrainViewProvider.ts` (mesmo padrão já estabelecido no projeto — glue do VS Code, verificado manualmente via F5).
