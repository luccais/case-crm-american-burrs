# Decisões de arquitetura

Para cada decisão: o que foi escolhido, as alternativas consideradas e o custo assumido.

## 1. n8n como orquestrador, regra de negócio em código próprio

**Escolha:** o n8n cuida de agendamento, webhooks e roteamento, e só faz chamadas HTTP ao app.
Farol, validação de kit, chamada ao Claude, validação com zod e fallback ficam em TypeScript,
cobertos por testes.

**Alternativas**
- Tudo no n8n, com nós de Code e HTTP. É mais rápido de montar, mas é difícil testar e versionar.
- Tudo em código, com cron e fila próprios. Dá controle total, mas a operação perde visibilidade
  das execuções e o reprocessamento manual fica mais trabalhoso.
- n8n lendo o Postgres direto. Fica mais perto de um n8n ligado ao Oracle, mas exige credencial
  importada e espalha lógica para fora dos testes.

**Custo assumido:** quando algo quebra, há dois lugares para olhar. Workflows em JSON são ruins
de revisar em diff.

## 2. View materializada com refresh diário, não consulta em tempo real

**Escolha:** `vw_farol_rfm` é uma view materializada, atualizada uma vez por dia pelo n8n com
`REFRESH MATERIALIZED VIEW CONCURRENTLY`. A coluna `dt_referencia` mostra a data do cálculo.

**Alternativas**
- View comum, consultada ao vivo. O dado está sempre atual, mas cada abertura do farol custa
  agregação sobre todo o histórico de pedidos, e no ERP real isso concorre com o faturamento.
- Tabela atualizada por trigger a cada pedido. É incremental, mas acopla escrita no ERP e não
  resolve sozinha a passagem do tempo: os dias aumentam sem que nenhum pedido aconteça.

**Custo assumido:** os dias ficam defasados até o próximo refresh. Se um refresh falhar, o dado
fica velho sem aviso, e por isso `dt_referencia` aparece na tela.

## 3. CODPARC como chave de integração

**Escolha:** o código do parceiro no ERP (`CODPARC`) é a chave da conta no CRM.

**Alternativas**
- CNPJ. É estável fora do ERP, mas há parceiros sem CNPJ (pessoa física, lead) e filiais com
  CNPJs distintos.
- ID próprio do CRM com tabela de-para. Desacopla os sistemas, mas é mais uma tabela para manter
  consistente.

**Custo assumido:** o CRM fica acoplado ao ERP. Um parceiro duplicado no Sankhya vira duas contas
no CRM.

## 4. Front separado do ERP

**Escolha:** o CRM e o app de kits são um app Next.js próprio. O ERP fica no schema `erp`,
acessado com um role somente de leitura. O CRM fica no schema `crm`.

**Alternativas**
- Telas dentro do próprio ERP (Construtor de Telas do Sankhya). O dado fica num lugar só, mas a
  experiência do vendedor fica limitada pelo ERP, que era justamente o problema.
- Banco separado para o CRM. O isolamento é maior, mas a demo fica mais pesada.

**Custo assumido:** o mesmo dado existe em dois modelos, e a sincronização pode ficar defasada.

## 5. Regra do farol duplicada em SQL e TypeScript

**Escolha:** `erp.fn_farol(dias)` alimenta a view, e `classificarFarol(dias)` é usada no app.
Um teste de integração compara as duas para 0 a 200 dias e para nulo.

**Regra fiel ao SQL de produção:**

| DIASULTIMACOMPRA | Farol |
|---|---|
| `> 0 and <= 30` | Verde |
| 31 a 60 | Amarelo |
| 61 a 90 | Vermelho |
| 91 a 120 | Preto |
| demais, incluindo `NULL` (sem compra) e `0` | Roxo |

**Limitação conhecida (borda do dia 0):** uma conta que comprou hoje tem DIASULTIMACOMPRA = 0 e,
pela regra original, cai em **Roxo**, a mesma cor de um inativo ou lead. A reconstrução mantém
esse comportamento de propósito, para ser fiel ao original. Um teste de borda documenta o caso.
Na prática, o efeito aparece no máximo por um dia: no refresh seguinte a conta tem 1 dia e passa
a Verde.

**Sugestão (não aplicada):** trocar a primeira faixa para `>= 0 and <= 30` e deixar o Roxo só para
`NULL` e para mais de 120 dias. A mudança teria que ser feita no SQL e no TypeScript ao mesmo
tempo, com o teste de paridade atualizado. Fica registrada como proposta para discutir com o
negócio, não como mudança da regra.

**Custo assumido:** duas implementações a manter. O teste de paridade cobre o risco de divergência.

## 6. Retry e fallback do briefing

**Escolha:** o SDK roda com `maxRetries: 0`, e o controle de tentativas é nosso: 1 chamada mais
até 2 novas tentativas, com timeout por tentativa. Se todas falharem (erro de API, timeout ou
saída fora do schema), entra um template com os dados do ERP, com `origem = 'template'`, e o
evento é registrado.

A validação em runtime cobre schema, limites de palavras, pergunta única e ausência de desconto.
A checagem de "nenhum número inventado" fica só no eval.

**Custo assumido:** se a checagem de número inventado rodasse em runtime, falsos positivos
mandariam briefings bons para o fallback. Por isso ela fica no eval, e o vendedor revisa tudo.

## 7. Revisão humana obrigatória

**Escolha:** todo briefing nasce como `rascunho`. Nada é enviado sem aprovação do vendedor.

**Custo assumido:** um passo a mais para o vendedor, em troca de nunca mandar a um cliente um
texto que ninguém leu.

## 8. Dinheiro em centavos inteiros

**Escolha:** o TypeScript usa centavos inteiros e o SQL usa `numeric(14,2)`.

**Custo assumido:** é preciso converter na borda, mas evita erro de ponto flutuante no custo
por aluno.

## 9. SQL puro com `pg`, sem ORM

**Escolha:** queries SQL explícitas.

**Alternativas:** Prisma ou Drizzle, que trazem tipagem automática e migrações.

**Custo assumido:** tipagem manual das linhas. O ganho é o SQL ficar visível, como no dia a dia
com Sankhya e Oracle.

## 10. Mock do WhatsApp com o contrato da Cloud API

**Escolha:** o mock aceita `POST /v21.0/{phone-number-id}/messages`, exige `Authorization: Bearer`,
valida o payload e responde no formato oficial, inclusive os erros.

**Limitação conhecida:** na API real, uma mensagem livre só pode ser enviada dentro da janela de
24 h após a última mensagem do cliente. Para resgatar um cliente inativo seria preciso um template
aprovado. O mock só registra um aviso, e o tema fica registrado aqui como ponto de atenção.
