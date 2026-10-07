# Farol de Clientes + CRM de Kits (reconstrução)

> **Isto é uma reconstrução.** O sistema original rodou em produção na American Burrs
> (indústria odontológica, vendas B2B para o meio acadêmico). Este repositório **não contém
> código, dados, credenciais nem informações de clientes** do ambiente real. Todos os
> clientes, produtos, pedidos, telefones e e-mails são fictícios e foram gerados para a demo.
> O ERP (Sankhya sobre Oracle) é simulado com Postgres.

## Problema

O ERP tinha um farol de clientes que ninguém consultava. O vendedor não gostava de preencher
dados no CRM, e oportunidades de resgate de clientes sumiam sem que alguém percebesse. A solução
leva a informação para onde o vendedor já trabalha: o farol sincronizado no CRM, um briefing
pronto quando a conta esfria e a mensagem rascunhada para ele revisar e enviar.

## Arquitetura

_Em construção. O plano está em [docs/DECISOES.md](docs/DECISOES.md)._

## Avaliação do briefing (eval)

São 20 contas fictícias em `evals/fixtures/contas.json`. A rubrica automática fica em
`src/domain/briefing/rubrica.ts` e verifica:
- o formato da saída;
- se todos os números estão na entrada;
- se o briefing cita os dias sem compra e o último pedido;
- os limites de palavras;
- se o WhatsApp termina com uma única pergunta;
- se não há promessa de desconto.

```bash
npm run eval                  # Claude API real (ANTHROPIC_API_KEY no .env)
npm run eval -- --mock        # sem chave: cliente falso que deve passar em tudo
npm run eval -- --mock=ruim   # sem chave: cliente falso com defeitos, para ver a rubrica reprovar
npm run eval:compare          # compara as duas execuções mais recentes, critério a critério
```

Cada execução grava `evals/runs/<data>_<prompt>_<modelo>.json` e `.md` e acrescenta uma linha em
`evals/historico.csv`, com a versão e o hash do prompt, para comparar versões.

## Roteiro de demo (5 passos)

_Em construção._

## Documentação

- [docs/DECISOES.md](docs/DECISOES.md): decisões de arquitetura, alternativas e custos assumidos
- [docs/LOG_DE_ERROS.md](docs/LOG_DE_ERROS.md): erros apontados durante a construção e o que mudou
