# Kanbrain — Design

## Contexto e motivação

O backoffice do projeto mix-battle tem um "flow mode" com uma coluna direita que mostra o card (PBI) ativo e suas subtasks, com botões de ação por status (Brainstorm/Refine/Review) e por subtask (Implement). Cada botão escreve um arquivo de contexto `.md` com os dados do card e manda um comando pro terminal integrado pedindo pra ler esse arquivo e seguir as instruções — instruções essas que apontam pra uma skill (ex: `/fix`).

Esse padrão é valioso, mas está preso a dois acoplamentos: (1) os cards vivem só num `kanban.json` local do mix-battle, e (2) as skills disponíveis por status são hardcoded no código do backoffice.

Kanbrain generaliza esse padrão como uma extensão VS Code standalone, instalável em qualquer repositório:
- Os cards vêm de um projeto Azure DevOps real (Boards/work items), autenticado via Azure AD, em vez de um arquivo local.
- As skills por status são definidas pelo próprio usuário (arquivos de template) e mapeadas via um arquivo de configuração da extensão.

## Escopo

**Dentro do escopo:**
- Autenticação Azure AD nativa do VS Code (sem depender de `az` CLI).
- Setup por workspace: escolher organização + projeto Azure DevOps, salvo em config versionado no repo.
- Seleção manual do work item ativo (busca por título/#id).
- Webview View replicando a coluna direita: work item ativo, subtasks (via hierarquia nativa Parent/Child), botões de ação configuráveis por status.
- Skills como templates markdown com placeholders, resolvidos e escritos como arquivo de contexto, disparando um comando no terminal integrado.
- Auto-refresh por polling comparando estado serializado (sem piscar a UI).

**Fora do escopo (não faz parte desta v1):**
- Edição de work items pelo VS Code (mudar status, título, descrição) — mudanças continuam sendo feitas direto no Azure DevOps Boards.
- Mapeamento configurável de "quais Work Item Types contam como card principal vs subtask" — v1 usa sempre a relação de hierarquia nativa (Parent/Child), independente do tipo.
- Qualquer coisa relacionada ao mix-battle/backoffice em si — Kanbrain é um projeto novo e independente.

## Arquitetura

**Stack:** TypeScript + VS Code Extension API, scaffold padrão via `yo code` (generator-code). Sem frameworks de UI adicionais — a Webview usa HTML/CSS/JS vanilla, como o backoffice já faz.

**Módulos principais:**
- `src/auth/` — wrapper sobre `vscode.authentication.getSession('microsoft', ...)` pra obter o token AAD com o resource scope do Azure DevOps (`499b84ac-1321-427f-aa17-267ca6975798/.default`).
- `src/azureDevOps/` — cliente REST fino sobre a API do Azure DevOps: listar accounts/orgs (`app.vssps.visualstudio.com/_apis/accounts`), listar projetos (`dev.azure.com/{org}/_apis/projects`), buscar work items (WIQL + `_apis/wit/workitems`), resolver hierarquia Parent/Child.
- `src/config/` — leitura/escrita de `.kanbrain/config.json` (organização, projeto, mapa status→skill).
- `src/skills/` — carrega o arquivo de skill markdown do status atual, resolve os placeholders com os dados do work item, escreve o arquivo final em `.kanbrain/generated/`.
- `src/terminal/` — garante um terminal integrado nomeado "Kanbrain" e envia o comando de leitura do arquivo gerado.
- `src/view/` — `WebviewViewProvider` que monta o HTML da coluna (header do work item + lista de subtasks + botões), residente num view container próprio que o usuário posiciona onde quiser (inclusive a secondary/right sidebar).

**Fluxo de dados:** Webview não fala direto com a API do Azure DevOps — toda chamada passa pela extension host (`src/azureDevOps`), que manda mensagens pro webview via `postMessage`. Isso mantém o token fora do contexto da webview.

## Configuração por workspace

Comando `Kanbrain: Setup`:
1. Garante sessão de login (dispara o fluxo AAD nativo se necessário).
2. Lista as organizações Azure DevOps acessíveis pro usuário logado → Quick Pick.
3. Lista os projetos da organização escolhida → Quick Pick.
4. Escreve `.kanbrain/config.json` na raiz do workspace, versionado:

```json
{
  "organization": "minha-org",
  "project": "MeuProjeto",
  "statusSkills": {
    "New": "skills/brainstorm.md",
    "Active": null,
    "Resolved": "skills/review.md"
  }
}
```

`statusSkills` mapeia o **nome do estado do work item** (exatamente como configurado no processo do projeto Azure DevOps — varia por template: Basic/Agile/Scrum) para um caminho de arquivo de skill relativo à raiz do workspace. Um valor `null` ou ausente significa "nenhuma ação disponível nesse status".

5. Cria `.kanbrain/skills/` com um template de exemplo comentado, e garante que `.kanbrain/generated/` está no `.gitignore` do workspace (adiciona a linha se não existir).

Cada work item (principal ou subtask) resolve sua própria skill olhando o próprio `status` no `statusSkills` — não há distinção de tratamento entre card principal e subtask nesse ponto.

## Seleção do work item ativo

Comando `Kanbrain: Select Work Item`:
- Abre um Quick Pick alimentado por uma query WIQL simples filtrando pelo projeto configurado, com busca incremental por título ou `#id`.
- Ao selecionar, guarda o ID em `context.workspaceState` (não versionado — cada máquina/sessão tem o seu, equivalente ao `lastFlowCardId` do backoffice).
- A Webview recarrega mostrando esse work item como card principal.

## UI — Webview View

Registrada como `WebviewViewProvider` num view container próprio ("Kanbrain"), que o usuário arrasta pra qualquer sidebar (incluindo a secondary/right sidebar do VS Code, replicando a posição da coluna direita do backoffice).

Estrutura da view:
- **Header:** `#id`, título, badge de status (cor por status), badge de prioridade/tipo (se existirem como campos no work item), botão "Selecionar work item" (abre o Quick Pick acima).
- **Corpo — card principal:** se `statusSkills[status atual]` existir, mostra um botão de ação rotulado com o nome do arquivo de skill (ou um campo `label` opcional no front-matter do arquivo de skill, se presente).
- **Corpo — subtasks:** lista os work items filhos (via `System.LinkTypes.Hierarchy-Forward`), cada um com seu próprio badge de status e botão de ação (mesma lógica de lookup em `statusSkills`, usando o status da subtask).
- **Auto-refresh:** polling a cada alguns segundos comparando um JSON serializado do estado atual (work item + subtasks) com o último conhecido — só re-renderiza o que mudou, sem piscar (mesma técnica do `buildRight()` do backoffice).

## Skills como templates

Um arquivo de skill é markdown livre com placeholders substituíveis:

| Placeholder | Conteúdo |
|---|---|
| `{{id}}` | ID do work item |
| `{{title}}` | Título |
| `{{description}}` | Descrição (HTML da API convertido pra texto simples) |
| `{{status}}` | Estado atual |
| `{{type}}` | Work Item Type |
| `{{url}}` | Link pro work item no Azure DevOps |
| `{{branch}}` | Nome da branch git atual no workspace |
| `{{parent.id}}` / `{{parent.title}}` / `{{parent.description}}` | Dados do work item pai (vazio se não houver) |
| `{{subtasks}}` | Checklist markdown gerado automaticamente (`- [x]`/`- [ ]` por subtask, igual ao formato usado hoje no backoffice) |

Ao clicar no botão de ação:
1. A extensão resolve todos os placeholders presentes no arquivo de skill configurado pro status atual.
2. Escreve o resultado em `.kanbrain/generated/<id>-<timestamp>.md`.
3. Garante que existe um terminal integrado chamado "Kanbrain" (cria se não existir, reusa se já existir).
4. Envia o texto `Leia o arquivo .kanbrain/generated/<id>-<timestamp>.md e siga as instruções nele.` pro terminal.

## Tratamento de erros

- Falha de autenticação / token expirado: mensagem inline na Webview com botão "Tentar login novamente", sem exceptions não tratadas.
- Projeto/organização configurados em `.kanbrain/config.json` que não existem mais (ex: removidos no Azure DevOps, ou config veio de outro dev): Webview mostra estado vazio com botão "Reconfigurar" que reabre o fluxo de setup.
- Arquivo de skill referenciado em `statusSkills` que não existe no disco: botão de ação fica desabilitado com tooltip explicando o caminho que está faltando, em vez de falhar silenciosamente ao clicar.
- Placeholder não resolvível (ex: `{{parent.title}}` sem work item pai): substituído por string vazia, não gera erro.

## Testes

- Unitários (sem VS Code API): parsing/resolução de placeholders em `src/skills`, montagem de WIQL e mapeamento de respostas da API em `src/azureDevOps`, leitura/escrita de `.kanbrain/config.json` em `src/config`.
- Integração leve com `@vscode/test-electron` cobrindo o comando de setup e o comando de seleção de work item contra um client Azure DevOps mockado (sem chamar a API real).
- Sem cobertura automatizada da Webview em si (renderização HTML/CSS) — validação manual documentada no README ao final da implementação.
