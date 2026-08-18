# Skill global de comentário de validação — Design

## Contexto e motivação

Hoje o Kanbrain semeia uma única skill global no Setup: `explain-card` (`bootstrapContent.ts`), que pede ao agente para explicar o card em linguagem simples. É deliberadamente mínima — serve de exemplo de formato, não de fluxo de trabalho.

Falta uma skill que cubra o outro extremo do ciclo: **o registro de validação**. Depois que a entrega está pronta, alguém precisa comprovar no card que aquilo funciona do ponto de vista de quem usa — normalmente um comentário no work item, com prints. Na prática esse comentário costuma ser escrito de memória, cobrindo só o cenário que motivou a correção, e sem confronto com o diff. O resultado é registro incompleto, e às vezes registro que afirma coisa que o print ao lado contradiz.

Esta skill nasceu fora do repositório, foi usada ponta a ponta em duas entregas reais, e numa delas removeu de um comentário já publicado um passo que o código não conseguia produzir. Ver issue #4.

## Escopo

**Dentro do escopo:**
- Uma skill global nova, `validation-comment`, semeada por `Kanbrain: Setup` e retro-preenchida por `Kanbrain: Sync Board Configuration`, no mesmo molde do `explain-card`.
- O arquivo `.kanbrain/skills/validation-comment.md`, gerado com o conteúdo da skill.
- Entrada em `globalSkills` no `.kanbrain/config.json`.
- `isBootstrapContentMissing` passa a considerar a entrada nova, para o Sync retro-preencher projetos já configurados.
- Uma frase no `USAGE.md` registrando que uma skill global pode também ser apontada por uma entrada de status, para times que tenham um status claro de validação.

**Fora do escopo:**
- Qualquer escrita no Azure DevOps pela extensão. A skill instrui o **agente** a publicar com as ferramentas dele (MCP, CLI, REST), sempre após aprovação explícita do rascunho. O Kanbrain continua estritamente read-only.
- Automação do teste em si — o agente abrir URLs, conduzir a pessoa passo a passo, capturar o print. Discutido na issue #4 e adiado: exige o agente dirigindo um browser, e a versão atual já se paga sem isso.
- Placeholder novo em `resolvePlaceholders`. A skill usa só o bloco de card info que o `generateContextFile` já injeta desde a 0.9.2.
- Mapeamento automático da skill para algum status. Não é possível: `skills[tipo][status]` é descoberto do board real de cada projeto, e não há status que signifique "validar" em todo processo.

## Por que global e não por status

A skill é transversal à jornada, não presa a uma fase: ela atua em dois momentos distintos, e é isso que a classifica como global antes de qualquer restrição técnica. Produzir o roteiro roda **antes** de o card chegar em validação — é o motivo de existir, você quer o roteiro para ir testar. Documentar uma validação já feita roda durante ou depois. Não existe um status único que seja o gatilho dos dois.

A restrição técnica reforça a mesma conclusão: uma skill semeada só pode ser global. O mapa `skills` é descoberto do processo real do projeto no Setup — a extensão não tem como saber qual status significa "hora de validar" (`Resolved`, `Testing`, ou o que um processo customizado chamar).

Times com um status claro de validação continuam podendo apontar para lá: `SkillEntry.path` é só um caminho, então uma entrada em `skills[tipo][status]` pode referenciar o mesmo arquivo da entrada em `globalSkills`. Daí a frase nova no `USAGE.md`.

## Efeito em projetos já configurados

Incluir a entrada nova em `isBootstrapContentMissing` faz `Kanbrain: Check Board Configuration` passar a reportar que há algo a revisar em todo projeto configurado antes desta versão, até que o Sync rode uma vez. É o mesmo mecanismo que já existe para o `explain-card`, o `USAGE.md` e os profiles padrão — retro-preenchimento por Sync, nunca escrita silenciosa.

## Alternativa considerada e rejeitada

**Publicar a skill apenas como exemplo documentado** (README ou `USAGE.md`), sem semear arquivo nenhum. Custa menos e não impõe opinião a ninguém, mas só alcança quem já foi ler a documentação — e o valor da skill está justamente em chegar a quem não pensaria em escrevê-la.

A issue #4 apresentou as duas opções e pediu a escolha; ela não foi registrada por escrito. Esta implementação segue a de semear, com base no pedido de implementar o código e abrir o PR — um exemplo documentado seria só um parágrafo de README. A decisão é barata de reverter: apagar o arquivo semeado, a entrada em `globalSkills` e a linha em `isBootstrapContentMissing` deixa a skill como documentação pura, sem tocar em mais nada.
