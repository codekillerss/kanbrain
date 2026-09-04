# Alterar o status do work item pelo painel — Design

> **Para a sessão que for implementar — antes de editar qualquer arquivo:**
>
> ```bash
> git branch --show-current          # se disser "main", PARE
> git fetch origin
> git switch main && git pull --ff-only origin main
> ```
>
> Depois crie a branch `worktree-work-item-status-from-panel` e trabalhe nela.
>
> **Nunca commitar nem dar push na `main`.** O dono do repo commita direto na main dele; eu sou
> colaborador convidado e toda mudança minha chega na main por PR que ele revisa. Um plano sem esse passo
> já fez uma sessão commitar e pushar na main sem revisão (commit `a10f692`, issue #9). Ao fim, confira
> `git log --oneline origin/main..HEAD` e `git status` antes de considerar qualquer coisa entregue.

## Contexto e motivação

O dono pediu, por chat, para permitir alterar status e assignee dos cards pelo painel. A issue #10 levantou
que isso reverte a fronteira central do produto — hoje o Kanbrain lê e nunca escreve — e ofereceu três
leituras. **Ele respondeu: o Kanbrain passa a escrever direto, e as três definições mudam junto.**

Este design cobre **status**. O assignee tem issue própria e vem depois: compartilha a fundação de escrita,
mas precisa de listagem de pessoas que o client não tem hoje.

## Escopo

**Dentro do escopo:**
- Trocar o status do work item ativo pelo card da sidebar, escrevendo direto no Azure DevOps.
- Primeiro método de escrita do `AzureDevOpsClient`, e a mudança no `fetchWithAuth` que o viabiliza.
- Reescrita dos três textos que hoje prometem read-only.
- Tratamento visível de falha e proteção contra o poll sobrescrever a escolha em voo.

**Fora do escopo:**
- Assignee (issue separada).
- Qualquer outro campo (Effort, Iteration, Area, tags).
- Controle nos painéis de detalhe — ver "Onde o controle vive".
- Transições inválidas do processo. O Azure DevOps rejeita e a mensagem dele é o que aparece; não vamos
  modelar as regras de transição do lado do cliente.
- Desfazer / histórico local da alteração.

## A fronteira, e o que exatamente muda nos três textos

Os três lugares que prometem read-only:

| Onde | Hoje |
|---|---|
| `USAGE_GUIDE_CONTENT` (`bootstrapContent.ts`) | *"Kanbrain itself stays strictly read-only — it never writes to Azure DevOps"* |
| `buildSkillsAssistantFile.ts` | *"never through Kanbrain, which stays read-only"* |
| `README.md` | *"Kanbrain itself never writes to Azure DevOps"* |

**Cuidado central desta mudança:** o texto novo não pode virar "o Kanbrain escreve no board". Ele escreve
**um campo, a partir de uma ação explícita do usuário no painel**. Todo o resto continua passando pelo
agente com as ferramentas dele.

Isso importa porque esses textos são o que instrui o *agente*. Se virarem "o Kanbrain escreve", uma skill
pode concluir que não deve mais agir — e o caminho skill → agente → MCP continua sendo o mecanismo certo
para tudo que não é essa ação pontual. A skill de validação, por exemplo, publica comentário via agente, e
isso segue válido e desejável: o trade-off lá é positivo porque o agente redige, avalia cobertura e pede
aprovação, coisas que o painel não faz.

Redação proposta, em espírito: *"Kanbrain writes exactly one thing to Azure DevOps: the work item's status,
when you change it from the panel. Everything else — comments, fields, board configuration — still goes
through your own tooling."*

O `isBootstrapContentMissing` só checa existência do `USAGE.md`, então **projetos já configurados não
recebem o texto novo** (é a issue #7, ainda sem resposta). Consequência a registrar no PR: quem já tem o
arquivo continua lendo a promessa antiga.

## Onde o controle vive

**Só no card da sidebar.** Os dois painéis de detalhe rodam com `enableScripts: false` e CSP completo — é o
modelo seguro do repo, e ligar script neles para caber um dropdown troca uma garantia de segurança por
conveniência de UI. Fica fora, e se ele quiser lá depois é decisão própria.

Dentro da sidebar, só no **card principal da tela Flow** (`kb-main-card`). Não nos filhos, não no card da
Home, não nos resultados de busca — a ação precisa de intenção, e espalhar o dropdown por todo card
transforma clique acidental em escrita no board.

**Restrição de assinatura:** `renderWorkItemCard` já tem 10 parâmetros posicionais. Um 11º booleano é
inaceitável. A flag nova entra como objeto `options` no fim (`{ editableStatus?: boolean }`), sem tocar em
nenhum call site existente. Migrar os 10 atuais para dentro do objeto é refactor separado e decisão dele.

## Origem dos status

Nenhuma chamada nova de descoberta: `config.skills[workItem.type]` é chaveado pelos status reais daquele
tipo, descobertos no Setup. As chaves são todas as opções; o valor (`SkillEntry | null`) diz se há skill,
não se o status existe.

Se o tipo não estiver em `config.skills` (config antiga, tipo novo no board), o dropdown não é renderizado —
degrada para o comportamento atual em vez de mostrar lista vazia.

## O caminho de escrita

```
PATCH https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}?api-version=7.1
Content-Type: application/json-patch+json

[{ "op": "add", "path": "/fields/System.State", "value": "Active" }]
```

**Bloqueio a remover primeiro:** o `fetchWithAuth` monta os headers com `'Content-Type': 'application/json'`
**depois** do spread dos headers do chamador, então o valor do chamador é sempre sobrescrito. Nenhuma
escrita é possível enquanto isso não mudar. Correção: mover o `Content-Type` para antes do spread, virando
default sobrescrevível. É mudança de uma linha, mas afeta todas as chamadas existentes — nenhuma delas
passa `Content-Type` hoje, então o comportamento fica idêntico.

Método novo, no vocabulário da casa (`update*` para escrita, distinguindo de `get*`/`list*`):
`updateWorkItemStatus(organization, project, id, status): Promise<void>`

**Propagação de erro:** ao contrário dos métodos de enriquecimento opcional (`getPullRequest`,
`listRepositories`) que engolem erro e devolvem `null`/`[]`, este **deixa o erro subir**. Uma escrita que
falhou em silêncio é pior que nenhuma escrita.

## Concorrência com o poll

O `refresh()` roda a cada 5s e reescreve o HTML inteiro. Há um guard para o work item ativo ter mudado
durante o fetch, mas nenhum para escrita em voo. Sem proteção: você escolhe "Active", um poll que já estava
em trânsito volta com "New" e o dropdown reverte sozinho na sua frente.

Proteção mínima: um campo `statusWriteInFlight` na provider, setado antes do PATCH e limpo depois. Enquanto
verdadeiro, `refresh()` retorna cedo. Depois da escrita, força `lastState = ''` e chama `refresh()` para
buscar o estado real — não assume que o valor escrito é o que o board tem (o processo pode ter regra que
altera outros campos junto).

## Falha e feedback

O poll trata falha como transiente e silencia. **Escrita não pode.** Reaproveitar o par que já existe:
`kb-loading` no controle enquanto está em voo, e a mensagem `command-finished` para liberar. Em erro,
`vscode.window.showErrorMessage` com a mensagem do Azure DevOps — que é onde vem "transição inválida",
"campo obrigatório não preenchido" e afins.

Sem confirmação prévia: a ação já é explícita (escolher num dropdown), e um diálogo a cada troca de status
tornaria a feature pior que abrir o board no navegador. O `AzureDevOpsHttpError` já carrega status e corpo,
então a mensagem é acionável.

## Decisões em aberto para o PR

1. O dropdown escreve no `change` ou precisa de um botão "Apply"? Proposta: `change` direto, pelo argumento
   acima — mas é reversível e barato mudar.
2. Status de categoria `Removed` deve aparecer na lista? Proposta: sim, o board permite; esconder é regra
   nossa, não dele.

## Alternativa rejeitada

**O painel monta a requisição e o agente executa** (opção 3 da #10). Preservaria a fronteira intacta e
reaproveitaria o mecanismo de skill que já existe. Rejeitada porque o dono escolheu explicitamente a opção 1,
e porque para uma ação de um clique o round trip pelo terminal custa mais que o valor que entrega — ao
contrário da skill de validação, onde o agente agrega julgamento (analisa cobertura, redige, pede aprovação)
e o trade-off se paga.
