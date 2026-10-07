import { formatarBRL, formatarData } from "../../formatar";
import { LIMITE_PALAVRAS_EMAIL, LIMITE_PALAVRAS_WHATSAPP } from "../regras-texto";
import type { DadosConta } from "../tipos";

export const PROMPT_VERSION = "v1";

export const SYSTEM_V1 = `Você prepara o vendedor da American Burrs (fabricante de brocas odontológicas, vendas B2B para faculdades de odontologia) para retomar contato com uma conta que esfriou.

Você recebe os dados da conta exportados do ERP. Esses dados são a única fonte de fatos.

Regras:
- Use somente números, datas, valores e nomes presentes nos dados. Não estime, não arredonde e não invente quantidades, percentuais ou prazos. Ao citar um valor ou data, copie exatamente como está nos dados.
- No briefing, cite os dias sem compra e o último pedido (data e valor).
- Não ofereça nem sugira desconto, promoção, brinde, bonificação, cupom ou condição especial. O vendedor não tem essa autonomia.
- WhatsApp: no máximo ${LIMITE_PALAVRAS_WHATSAPP} palavras, tom cordial e direto, termina com exatamente uma pergunta (um único "?" no texto inteiro, no final).
- E-mail: assunto curto e corpo com no máximo ${LIMITE_PALAVRAS_EMAIL} palavras, assinado com o nome do vendedor.
- Próxima ação: uma ação concreta que o vendedor faz nesta semana.
- Escreva em português do Brasil. O vendedor revisa tudo antes de enviar.`;

/** Dados já formatados como devem aparecer no texto, para o modelo copiar em vez de calcular. */
export function dadosParaPrompt(c: DadosConta) {
  return {
    conta: c.nome,
    codparc: c.codparc,
    cidade: `${c.cidade}/${c.uf}`,
    contato: c.contatoNome ?? "não informado",
    vendedor: c.vendedor,
    farol: c.farol,
    dias_sem_compra: c.diasSemCompra ?? "sem compra registrada",
    ultimo_pedido: c.ultimoPedido
      ? {
          numero: c.ultimoPedido.nunota,
          data: formatarData(c.ultimoPedido.data),
          valor: formatarBRL(c.ultimoPedido.valorCentavos),
        }
      : "nenhum",
    pedidos_ultimos_12_meses: c.pedidos12m,
    valor_ultimos_12_meses: formatarBRL(c.valor12mCentavos),
    produtos_frequentes: c.produtosFrequentes,
  };
}

export function montarPromptV1(c: DadosConta): { system: string; user: string } {
  return {
    system: SYSTEM_V1,
    user: `Dados da conta (ERP):\n${JSON.stringify(dadosParaPrompt(c), null, 2)}\n\nGere o briefing, a próxima ação, a mensagem de WhatsApp e o e-mail.`,
  };
}
