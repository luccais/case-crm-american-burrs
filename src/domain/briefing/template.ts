import { formatarBRL, formatarData } from "../formatar";
import type { Briefing } from "./schema";
import type { DadosConta } from "./tipos";

/**
 * Fallback determinístico: só dados do ERP, sem LLM. Precisa passar no mesmo BriefingSchema
 * que a saída do Claude (há teste garantindo isso para todas as contas do eval).
 */
export function briefingTemplate(c: DadosConta): Briefing {
  const primeiroNome = c.contatoNome?.trim().split(/\s+/)[0];
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const dias = c.diasSemCompra != null ? `${c.diasSemCompra} dias sem compra` : "sem compra registrada";
  const dataUltimo = c.ultimoPedido ? formatarData(c.ultimoPedido.data) : null;
  const ultimo = c.ultimoPedido
    ? `Último pedido: nº ${c.ultimoPedido.nunota} em ${dataUltimo}, ${formatarBRL(c.ultimoPedido.valorCentavos)}.`
    : "Nenhum pedido anterior.";
  const produtos = c.produtosFrequentes.length
    ? ` Produtos frequentes: ${c.produtosFrequentes.join(", ")}.`
    : "";

  return {
    briefing:
      `${c.nome} (${c.cidade}/${c.uf}) está em ${c.farol}: ${dias}. ${ultimo} ` +
      `Últimos 12 meses: ${c.pedidos12m} pedidos, ${formatarBRL(c.valor12mCentavos)}.${produtos}`,
    proximaAcao:
      c.farol === "PRETO"
        ? "Ligar para o contato e agendar visita presencial nesta semana."
        : "Enviar o WhatsApp abaixo e, sem resposta em dois dias, ligar para o contato.",
    whatsapp:
      `${saudacao} Aqui é ${c.vendedor}, da American Burrs. ` +
      (dataUltimo ? `Seu último pedido conosco foi em ${dataUltimo} e ` : "") +
      `queria entender o planejamento das próximas turmas. Podemos conversar esta semana?`,
    email: {
      assunto: "American Burrs: planejamento dos kits das próximas turmas",
      corpo:
        `${saudacao}\n\n` +
        (dataUltimo ? `O último pedido de vocês foi em ${dataUltimo}. ` : "") +
        `Gostaria de entender o planejamento das próximas turmas e como podemos apoiar ` +
        `a montagem dos kits de brocas. Você teria disponibilidade para uma conversa rápida ` +
        `esta semana?\n\nAtenciosamente,\n${c.vendedor}\nAmerican Burrs`,
    },
  };
}
