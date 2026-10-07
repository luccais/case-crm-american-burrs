# Log de erros

Registro de cada erro apontado durante a construção: o que errou, como foi detectado e o que mudou.

| # | Data | O que errou | Como foi detectado | O que mudou |
|---|------|-------------|--------------------|-------------|
| 1 | 2026-10-06 | Mudou a regra do dia 0 sem eu pedir; reverti para o original. O plano recomendou "0 dias = Verde" como se fosse uma correção, em vez de perguntar como o SQL de produção tratava o caso. | O Lucas revisou o plano e o DECISOES.md e apontou que a produção usava `DIASULTIMACOMPRA > 0 and <= 30` para Verde. | A regra voltou à original: 0 e NULL são Roxo. Um teste de borda documenta o dia 0, e o DECISOES.md registra a limitação e deixa a correção apenas como sugestão separada. Daqui em diante, regra de produção não muda sem confirmação explícita. |
