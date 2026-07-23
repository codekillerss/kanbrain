# Ação de diff via GitLens no painel de PR — Design (2/2)

## Contexto e motivação

Segunda e última spec da feature de visualização de PR (1/2: painel de detalhes, já implementado). O usuário usa o "Search & Compare" do GitLens (aba "GitLens Inspect") pra ver o diff entre duas branches, e quer que o Kanbrain dispare isso diretamente a partir do painel de PR, comparando a branch de origem com a de destino.

Pesquisa feita nesta sessão (engenharia reversa contra a versão instalada localmente, `eamodio.gitlens-18.3.0`, mesma técnica já usada pro `checkoutBranch`):
- O comando que abre o Search & Compare é `gitlens.compareWith`, que aceita `execute(editor, uri, { ref1, ref2 })` — quando as duas refs já vêm preenchidas, pula os pickers interativos e vai direto pro resultado.
- Não é uma API pública documentada — pode mudar numa atualização futura do GitLens sem aviso (mesmo risco já aceito pro `checkoutBranch`).
- GitLens expõe seu ícone oficial em `images/gitlens-icon.png`, dentro da própria pasta de instalação da extensão (resolvível via `vscode.extensions.getExtension('eamodio.gitlens')!.extensionPath`, sem depender do número de versão no nome da pasta).

## Escopo

**Dentro do escopo:**
- Novo comando `kanbrain.viewPullRequestDiff`, registrado em `src/commands/viewPullRequestDiff.ts`, recebendo `(sourceBranch: string, targetBranch: string)`:
  ```ts
  vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(workspaceRoot), { ref1: targetBranch, ref2: sourceBranch });
  ```
  (`repositoryId` não é necessário aqui — `gitlens.compareWith` resolve o repositório a partir da `Uri` do workspace, não recebe id de repositório. Se o workspace aberto não bater com o repo do PR, o próprio GitLens falha ao resolver as refs, com seu próprio erro — mesmo padrão de "deixa falhar de forma visível" já aceito em outros pontos.)
- `PullRequestDetailPanelManager.ts`: em `loadAndRender`, checa `vscode.extensions.getExtension('eamodio.gitlens')` (síncrono, sem I/O) pra decidir qual dos dois elementos mostrar no header:
  - **GitLens ausente:** link `💡 Install GitLens to view diffs inline`, via `command:workbench.extensions.search?["GitLens"]` — abre a aba Extensions já pesquisando "GitLens", sem instalar sozinho (usuário decide).
  - **GitLens presente:** botão `View Diff`, com o ícone oficial do GitLens (lido uma vez de `images/gitlens-icon.png` dentro do `extensionPath` da extensão instalada, cacheado em memória como `data:` URI em base64 — sem I/O repetido a cada poll), via `command:kanbrain.viewPullRequestDiff?[sourceBranch, targetBranch]`.
  - Os dois nunca aparecem juntos.
- `enableCommandUris` do painel de PR ganha `'kanbrain.viewPullRequestDiff'` e `'workbench.extensions.search'` (comando nativo do VS Code, mas ainda precisa estar na allowlist pra ser clicável dentro do webview).
- `renderPullRequestDetail.ts`: `PullRequestDetailInput` ganha `gitLensIconDataUri: string | null` (`null` = GitLens não instalado, controla qual dos dois elementos renderizar) e `sourceBranch`/`targetBranch` já existem via `pr`.

**Fora do escopo:**
- Fallback quando o comando `gitlens.compareWith` muda de assinatura numa versão futura do GitLens — sem tratamento especial além do que o próprio GitLens já faz ao falhar.
- Detectar/instalar o GitLens automaticamente sem interação do usuário.
- Qualquer outra ação do GitLens (blame, history, etc.) — só o diff entre as duas branches do PR.

## Design

### `PullRequestDetailPanelManager.ts`

```ts
private gitLensIconDataUriCache: string | null | undefined; // undefined = not resolved yet

private async resolveGitLensIcon(): Promise<string | null> {
  if (this.gitLensIconDataUriCache !== undefined) {
    return this.gitLensIconDataUriCache;
  }
  const gitlens = vscode.extensions.getExtension('eamodio.gitlens');
  if (!gitlens) {
    this.gitLensIconDataUriCache = null;
    return null;
  }
  try {
    const iconPath = path.join(gitlens.extensionPath, 'images', 'gitlens-icon.png');
    const bytes = await fs.promises.readFile(iconPath);
    this.gitLensIconDataUriCache = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    this.gitLensIconDataUriCache = null; // GitLens installed but icon unreadable — fall back to no icon (still show the button, just without the image, or treat as "not detected" — see rendering note below).
  }
  return this.gitLensIconDataUriCache;
}
```

Em `loadAndRender`, `const gitLensIconDataUri = await this.resolveGitLensIcon();`, passado pro render. Painel criado com `enableCommandUris: [..., 'kanbrain.viewPullRequestDiff', 'workbench.extensions.search']`.

Observação sobre o caso de erro ao ler o ícone (GitLens instalado, mas o arquivo não pôde ser lido — bem improvável, mas possível): `renderPullRequestDetail.ts` distingue "GitLens não instalado" (mostra sugestão de instalar) de "instalado mas sem ícone resolvido" só pelo dado `gitLensIconDataUri` sendo `null` nos dois casos — pra manter simples, os dois casos caem no mesmo estado "mostra sugestão de instalar". Um GitLens de fato instalado mas com ícone ilegível é uma falha tão rara que não justifica um terceiro estado na UI.

### `src/commands/viewPullRequestDiff.ts` (novo)

```ts
import * as vscode from 'vscode';

export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.viewPullRequestDiff', async (sourceBranch: string, targetBranch: string) => {
    await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(workspaceRoot), {
      ref1: targetBranch,
      ref2: sourceBranch,
    });
  });
}
```

### `renderPullRequestDetail.ts`

```ts
export interface PullRequestDetailInput {
  // ...campos existentes
  gitLensIconDataUri: string | null;
}

// no header, ao lado do link "Open in browser":
const diffAction = gitLensIconDataUri
  ? `<a class="kb-pr-diff-link" href="command:kanbrain.viewPullRequestDiff?${encodeURIComponent(JSON.stringify([pr.sourceBranch, pr.targetBranch]))}"><img class="kb-pr-gitlens-icon" src="${gitLensIconDataUri}" alt="" /> View Diff</a>`
  : `<a class="kb-pr-web-link" href="command:workbench.extensions.search?${encodeURIComponent(JSON.stringify(['GitLens']))}">💡 Install GitLens to view diffs inline</a>`;
```

### CSS (`detailPanelCss.ts`)

```css
.kb-pr-diff-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; margin-left: 12px; font-size: 12px; color: var(--vscode-textLink-foreground); text-decoration: none; }
.kb-pr-diff-link:hover { text-decoration: underline; }
.kb-pr-gitlens-icon { width: 14px; height: 14px; }
```

### `extension.ts`

```ts
import { registerViewPullRequestDiffCommand } from './commands/viewPullRequestDiff';
// ...
context.subscriptions.push(
  // ...
  registerViewPullRequestDiffCommand(workspaceRoot),
);
```

## Tratamento de erros

- GitLens não instalado: link de sugestão, sem tentativa de chamar `gitlens.compareWith` (evita erro "command not found").
- Leitura do ícone falha (raro): tratado como "não instalado" pra fins de UI, conforme observação acima.
- `gitlens.compareWith` falha em runtime (repo errado, refs inválidas, GitLens mudou a assinatura): sem tratamento especial — o próprio GitLens mostra seu erro nativo.

## Testes

- `renderPullRequestDetail.test.ts`: `gitLensIconDataUri` não-nulo mostra o botão "View Diff" com `command:kanbrain.viewPullRequestDiff?` contendo `[sourceBranch, targetBranch]` e a `<img src>` com o data URI passado; `gitLensIconDataUri: null` mostra o link de sugestão de instalação com `command:workbench.extensions.search?["GitLens"]`, sem o botão "View Diff".
- Sem teste automatizado pra `PullRequestDetailPanelManager.ts`/`viewPullRequestDiff.ts`/`extension.ts` (mesma observação de sempre — infraestrutura de comando/painel VS Code, verificado via F5, incluindo teste manual real: instalar/desinstalar o GitLens e confirmar que a UI alterna corretamente).
