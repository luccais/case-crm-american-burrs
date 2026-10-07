import type { ClienteLLM } from "@/domain/briefing/gerar";
import { briefingTemplate } from "@/domain/briefing/template";
import type { DadosConta } from "@/domain/briefing/tipos";

/**
 * Clientes falsos para rodar o eval sem chave (CI, demo offline).
 * - "bom": devolve o template, que deve passar em tudo.
 * - "ruim": estraga contas alternadas com defeitos típicos, para mostrar a rubrica pegando cada um.
 */
export function clienteMock(tipo: "bom" | "ruim", contas: DadosConta[]): ClienteLLM {
  const porCodparc = new Map(contas.map((c) => [c.codparc, c]));
  let i = 0;
  return async ({ user }) => {
    const codparc = Number(user.match(/"codparc": (\d+)/)?.[1]);
    const conta = porCodparc.get(codparc);
    if (!conta) throw new Error(`conta ${codparc} não encontrada no mock`);
    const b = briefingTemplate(conta);
    if (tipo === "bom") return b;

    switch (i++ % 6) {
      case 1: return { ...b, briefing: `${b.briefing} Potencial estimado de R$ 40 mil no semestre.` };
      case 3: return { ...b, whatsapp: `${b.whatsapp} Posso mandar uma proposta com 10% de desconto?` };
      case 5: return { ...b, briefing: `${conta.nome} está esfriando.` };
      default: return b;
    }
  };
}
