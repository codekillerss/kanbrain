# Picker de assignee com membros do time — Design

## Contexto e motivação

A edição de assignee foi reativada no PR #20 (issue #19). O dono testou e pediu mudanças: o picker
diverge do select de assignee do próprio Azure DevOps em dois pontos concretos.

1. **Sem foto nas opções.** Os resultados da busca mostram só o nome. O avatar deveria vir antes do
   nome, do mesmo jeito que o card já renderiza o assignee atual.
2. **Sem opções pré-carregadas.** O menu abre vazio, só com "Unassigned", e só mostra gente depois de
   digitar. O Azure DevOps oferece pessoas de imediato.

O que ele pediu, textualmente: reaproveitar o select de time que já existe para carregar os membros
daquele time como opções padrão, visíveis com o campo de busca vazio, e **sempre incluir a conta do
próprio usuário** (o caso "atribuir a mim").

## Escopo

**Dentro do escopo:**
- Carregar os membros do time selecionado como opções padrão do picker, com avatar.
- Incluir sempre o usuário autenticado, como primeira pessoa da lista.
- Avatar em toda opção, vindo da busca ou do time.
- Comportamento de digitação: filtrar o que já está carregado e mesclar com a busca na organização.

**Fora do escopo:**
- Qualquer mudança no picker de status — ele já foi aprovado e está em produção.
- Os painéis de detalhe, que seguem com `enableScripts: false` e CSP completo.
- Atribuir a grupos: a busca continua com `identityTypes: ['user']`.
- Trocar o time pelo picker. O time vem do select que já existe na Home; o picker só lê.

## A decisão sobre o comportamento ao digitar

O pedido dele — *"Typing then narrows/extends the list via the identity search"* — admite três leituras.
Registrando a escolha e o porquê, em vez de perguntar, porque só uma delas não regride nada:

| Opção | Efeito |
|---|---|
| Só filtrar local | Regressão: hoje dá para atribuir qualquer pessoa da organização; passaria a só dar para quem está no time |
| Só substituir pela busca | É o comportamento atual, exatamente o que ele reclamou |
| **Filtrar local + mesclar a busca** | Atende os dois pedidos sem tirar nada |

**Escolhido: mesclar.** O caso comum (atribuir a alguém do próprio time) responde sem ida à rede, e
quem está fora do time continua alcançável pela busca. É também o que o Azure DevOps faz, que é o
parâmetro que ele mesmo usou.

Ordem da lista: `Unassigned`, o usuário atual, os membros do time, e por fim os resultados da
organização que ainda não apareceram. Deduplicação por `uniqueName`, sem diferenciar maiúsculas.

## As três fontes de identidade, e o que falta em cada uma

Hoje só existe a busca. As outras duas precisam ser criadas.

| Fonte | Estado | Falta |
|---|---|---|
| Busca na organização (`searchIdentities`) | Existe | Não traz imagem: `properties` pede `DisplayName`, `Mail`, `SignInAddress`, `Active`, e `IdentitySearchResult` não tem campo de avatar |
| Membros do time | **Não existe** | Método novo no client. O endpoint de membros devolve identidades já com `imageUrl` |
| Usuário atual | `getCurrentUserId()` existe | Devolve só o `id` do perfil. O mesmo endpoint já retorna nome e e-mail, hoje descartados |

As três passam a produzir o mesmo formato, para o picker renderizar sem saber de onde veio cada
opção — `IdentitySearchResult` ganha `imageUrl: string | null` e vira o tipo compartilhado.

### Incerteza declarada

Não dá para saber, sem uma chamada real, se a API de IdentityPicker devolve avatar utilizável ao se
pedir a propriedade de imagem.

**Isso não vira pré-requisito.** A busca pede a imagem e mapeia se vier; `renderAvatarOrInitial` já cai
para a inicial quando não vem; e os membros do time — o caso comum — trazem `imageUrl` do próprio
endpoint deles de qualquer forma. O pior cenário é resultado de busca fora do time aparecer com
inicial em vez de foto, que é degradação aceitável e não falha.

A resposta sai de graça na verificação manual: rosto significa que a API preenche, inicial significa
que não. Registrar aqui quando for observado, em vez de supor agora.

**Observado em 2026-10-01:** os **membros do time** vêm com avatar utilizável — o `imageUrl` do
endpoint de membros resolve em data URI pelo `getAuthenticatedImageDataUri` e aparece na opção. Sobre
os **resultados da busca** na organização, continua sem resposta: o tenant usado no teste tem um único
usuário, então não houve resultado fora do time para observar. Fica assim de propósito — se a API não
preencher, a opção cai na inicial, que é degradação aceitável e não falha.

**Armadilha encontrada no mesmo teste:** o perfil do usuário autenticado não traz avatar, e como ele
entra na lista antes dos membros do time, a deduplicação descartava justamente o registro que tinha a
foto. Quem está logado aparecia sempre com a inicial, mesmo tendo imagem. A deduplicação passou a
adotar um avatar que o registro guardado não tinha, mantendo a posição — regra geral, que serve
também se a foto vier só da busca.

## Avatares: o caminho já existe

`resolveAvatars` (no provider) resolve URL autenticada em data URI e guarda em `avatarCache`. Hoje ele
recebe `WorkItem[]` e extrai `assignedTo.imageUrl`. Precisa de um irmão que receba URLs diretamente,
para servir às opções do picker. O cache continua sendo o mesmo, então abrir o picker duas vezes não
rebusca imagem.

As opções chegam ao webview por `postMessage` com HTML já montado, então o data URI vai embutido —
não há requisição partindo do webview, o que mantém o modelo de CSP que ele acabou de endurecer.

## Onde a decisão de mesclar mora

Numa função pura, `mergePickerIdentities`, fora do provider. É a regra da casa: o que precisaria de
`vi.mock('vscode')` vira função pura testada direto. Ela recebe o usuário atual, os membros do time,
os resultados da busca e a consulta digitada, e devolve a lista final ordenada e sem repetição.

O provider fica com o I/O e o cache: resolve o id do time a partir do nome que está em
`selectedTeam` (via `listTeams`, que devolve `{ id, name }`), busca membros uma vez por time, e
responde a cada digitação primeiro com o filtro local e depois com a lista mesclada.

## Nota sobre o `uniqueName` vazio

Levantada no PR #20 como risco: uma identidade sem `uniqueName` viraria "limpar o campo", porque é
assim que o botão `Unassigned` funciona. Verificado: `searchIdentities` já termina com
`.filter(i => i.uniqueName)`, então isso não acontece pela busca. As duas fontes novas precisam manter
a mesma garantia.
