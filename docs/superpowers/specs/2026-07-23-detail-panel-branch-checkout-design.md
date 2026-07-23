# Checkout de branch a partir do Development — Design (3/3)

## Contexto e motivação

Terceira e última das três specs pra tornar o painel de detalhes interativo sem `enableScripts` (1/3: polling, 2/3: navegação no Related Work, ambas já implementadas). Também é o item 3 da lista de todo original do usuário: "Links para branches e PR's, como verificar se o repo aberto é o mesmo repo do card, e fazer checkout localmente na branch exibida no card."

Hoje `renderDevelopment.ts` lista branches/PRs como texto estático. O usuário quer clicar num item de branch e fazer checkout local dela — com confirmação prévia (modal) e, se possível, um aviso quando a branch pertence a um repositório diferente do workspace aberto.

## Escopo

**Dentro do escopo:**
- Novo método `AzureDevOpsClient.getRepository(organization, project, repositoryId): Promise<{ name: string } | null>` — `GET .../_apis/git/repositories/{repositoryId}?api-version=7.1`, extrai só `name` (suficiente pra comparação; demais campos do payload não são usados). Retorna `null` em qualquer falha (repo deletado, sem acesso, etc.) — tratado como "não deu pra determinar", sem lançar.
- Novo `src/git/getRemoteUrl.ts`: `getRemoteUrl(workspaceRoot): Promise<string | null>` — roda `git config --get remote.origin.url`, mesmo padrão de `execFile`/`promisify` já usado em `getCurrentBranch.ts`. Retorna `null` se não for um repo git ou não tiver remote `origin`.
- Novo `src/git/checkoutBranch.ts`: `checkoutBranch(workspaceRoot, branchName): Promise<void>` — roda `git fetch` e, se bem-sucedido, `git checkout <branchName>` (dois `execFile` sequenciais — sem shell, sem `&&`). Deixa a exceção propagar em caso de falha (mensagem do git disponível em `error.stderr`/`error.message`), sem tratamento especial — quem chama decide o que fazer com o erro.
- Nova função pura `isSameRepository(repoName: string, localRemoteUrl: string | null): boolean | null`, em `src/git/isSameRepository.ts` (módulo próprio, testável isoladamente): normaliza o último segmento de path da URL local (decodifica `%20`, remove `.git`/barra final, lowercase) e compara com `repoName.toLowerCase()`. Retorna `null` quando `localRemoteUrl` é `null` (não dá pra comparar).
- Novo comando `kanbrain.checkoutBranch`, registrado em `src/commands/checkoutBranch.ts` (`registerCheckoutBranchCommand`), recebendo `(repositoryId: string, branchName: string)`:
  1. Lê a config; sem config, não faz nada.
  2. Busca `client.getRepository(...)` (com `.catch(() => null)`) e `getRemoteUrl(workspaceRoot)` em paralelo.
  3. Monta a mensagem do modal: se `isSameRepository(...)` for `false`, inclui o aviso de repositório diferente; se `true` ou `null`, mensagem simples de confirmação.
  4. `vscode.window.showWarningMessage(message, { modal: true }, 'Checkout')` — se o usuário não escolher "Checkout" (cancelar/fechar), retorna sem fazer nada.
  5. Confirmado: `await checkoutBranch(workspaceRoot, branchName)`; sucesso → `vscode.window.showInformationMessage('Switched to branch "<branch>".')`; falha (catch) → `vscode.window.showErrorMessage('Checkout failed: <mensagem do erro>')`.
- `WorkItemDetailPanelManager.open()`: `enableCommandUris` ganha o novo comando, virando `['kanbrain.openWorkItemDetail', 'kanbrain.checkoutBranch']`.
- `extension.ts`: registra `registerCheckoutBranchCommand(client, workspaceRoot)` junto aos demais.
- `renderDevelopment.ts`: `renderDevelopmentItem` passa a envolver **só os itens de branch** (não PR) num `<a href="command:kanbrain.checkoutBranch?${encodeURIComponent(JSON.stringify([link.repositoryId, link.branchName]))}">` em vez de `<div>`. Itens de PR continuam como `<div>` estático (sem mudança) — fora de escopo interatividade de PR nesta spec.
- CSS: seletor `a.kb-dev-item` (só o `<a>` do branch, não o `div.kb-dev-item` do PR) ganha `cursor: pointer; text-decoration: none; color: inherit;` e `:hover { color: var(--vscode-textLink-foreground); }`.

**Fora do escopo:**
- Qualquer interatividade nos itens de Pull Request (abrir no navegador, etc.) — fica pra uma spec futura, se for pedido.
- Bloquear/impedir o checkout quando o repositório for diferente — só avisa no modal, não impede (decisão explícita: a detecção é heurística por nome, não uma garantia).
- Terminal visível / streaming de progresso do `git fetch`/`checkout` — execução silenciosa via `execFile`, só notificação final de sucesso/erro.
- Resolver conflitos de merge ou qualquer outro cenário de falha do git programaticamente — a mensagem de erro do git é só repassada pro usuário via notificação; ele resolve manualmente (abrindo um terminal, se precisar).
- Múltiplos remotes / remote com nome diferente de `origin` — `getRemoteUrl` e `git fetch` assumem `origin`, igual ao resto do projeto (`getCurrentBranch.ts` já assume um único fluxo de repo simples, sem suporte a múltiplos remotes).

## Design

### `client.ts`

```ts
async getRepository(organization: string, project: string, repositoryId: string): Promise<{ name: string } | null> {
  try {
    const data = await this.request<{ name: string }>(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}?api-version=7.1`,
    );
    return { name: data.name };
  } catch {
    return null;
  }
}
```

### `src/git/getRemoteUrl.ts` (novo)

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getRemoteUrl(workspaceRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], { cwd: workspaceRoot });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
```

### `src/git/isSameRepository.ts` (novo)

```ts
export function isSameRepository(repoName: string, localRemoteUrl: string | null): boolean | null {
  if (!localRemoteUrl) {
    return null;
  }
  const lastSegment = decodeURIComponent(localRemoteUrl.trim())
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .split(/[/:]/)
    .pop();
  return (lastSegment ?? '').toLowerCase() === repoName.toLowerCase();
}
```

### `src/git/checkoutBranch.ts` (novo)

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function checkoutBranch(workspaceRoot: string, branchName: string): Promise<void> {
  await execFileAsync('git', ['fetch'], { cwd: workspaceRoot });
  await execFileAsync('git', ['checkout', branchName], { cwd: workspaceRoot });
}
```

### `src/commands/checkoutBranch.ts` (novo)

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { readConfig } from '../config/config';
import { getRemoteUrl } from '../git/getRemoteUrl';
import { checkoutBranch } from '../git/checkoutBranch';
import { isSameRepository } from '../git/isSameRepository';

export function registerCheckoutBranchCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkoutBranch', async (repositoryId: string, branchName: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const [repository, localRemoteUrl] = await Promise.all([
      client.getRepository(config.organization, config.project, repositoryId).catch(() => null),
      getRemoteUrl(workspaceRoot),
    ]);

    const sameRepo = repository ? isSameRepository(repository.name, localRemoteUrl) : null;
    const message =
      sameRepo === false
        ? `This branch belongs to repository "${repository!.name}", which doesn't look like the currently open workspace. Check out "${branchName}" anyway?`
        : `Check out branch "${branchName}"?`;

    const choice = await vscode.window.showWarningMessage(message, { modal: true }, 'Checkout');
    if (choice !== 'Checkout') {
      return;
    }

    try {
      await checkoutBranch(workspaceRoot, branchName);
      vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
    }
  });
}
```

### `WorkItemDetailPanelManager.ts`

```ts
enableCommandUris: ['kanbrain.openWorkItemDetail', 'kanbrain.checkoutBranch'],
```

### `extension.ts`

```ts
import { registerCheckoutBranchCommand } from './commands/checkoutBranch';
// ...
context.subscriptions.push(
  // ...demais comandos...
  registerOpenWorkItemDetailCommand(detailPanelManager),
  registerCheckoutBranchCommand(client, workspaceRoot),
);
```

### `renderDevelopment.ts`

```ts
function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    const name = escapeHtml(link.branchName);
    const commandArgs = encodeURIComponent(JSON.stringify([link.repositoryId, link.branchName]));
    return `<a class="kb-dev-item" href="command:kanbrain.checkoutBranch?${commandArgs}" title="${name}">${BRANCH_FORK_ICON}<span class="kb-dev-item-text">${name}</span></a>`;
  }
  // ...PR branch inalterado (continua <div>)...
}
```

### CSS (`WorkItemDetailPanelManager.css()`)

```css
a.kb-dev-item { cursor: pointer; text-decoration: none; color: inherit; }
a.kb-dev-item:hover { color: var(--vscode-textLink-foreground); }
```

## Tratamento de erros

- `getRepository` falha (rede, repo deletado, sem acesso): retorna `null` → `sameRepo` fica `null` → modal simples, sem aviso de repo diferente (não bloqueia por causa de uma falha de rede lateral).
- `getRemoteUrl` falha (não é repo git, sem remote `origin`): retorna `null` → mesmo tratamento acima.
- `checkoutBranch` falha (`git fetch` ou `git checkout` retornam erro — rede, branch inexistente, mudanças locais não commitadas, etc.): mensagem de erro do git repassada via `showErrorMessage`, sem tentar recuperação automática.
- Usuário cancela o modal: nada acontece, sem mensagem adicional.

## Testes

- `client.test.ts`: `getRepository` extrai `name` da resposta; retorna `null` em erro de rede (mock de fetch rejeitando).
- `checkoutBranch.ts`/`getRemoteUrl.ts`: fora de escopo de teste automatizado — mesma observação de `getCurrentBranch.ts` (que também não tem teste, por rodar `execFile` real contra o sistema; verificado manualmente).
- `isSameRepository.test.ts` (novo, puro, sem I/O): compara nome do repo contra URL local em formatos HTTPS/SSH, com espaço codificado (`%20`), com/sem `.git`, com/sem barra final, case-insensitive; retorna `null` quando a URL local é `null`.
- `renderDevelopment.test.ts`: item de branch agora é um `<a>` com `href="command:kanbrain.checkoutBranch?..."` contendo `repositoryId`/`branchName` corretos; item de PR continua sendo `<div>`, sem link.
