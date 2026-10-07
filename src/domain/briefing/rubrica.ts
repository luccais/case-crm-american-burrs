import { formatarBRL, formatarData } from "../formatar";
import { dadosParaPrompt } from "./prompts/v1";
import {
  LIMITE_PALAVRAS_EMAIL,
  LIMITE_PALAVRAS_WHATSAPP,
  contarPalavras,
  encontrarPromessaDesconto,
  temPerguntaUnicaFinal,
} from "./regras-texto";
import { BriefingFormatoSchema } from "./schema";
import type { DadosConta } from "./tipos";

/**
 * Rubrica automática do eval. Avalia a saída BRUTA do modelo (antes de qualquer fallback),
 * para medir o prompt e não o template.
 */
export const CRITERIOS = [
  "formato_valido",
  "numeros_ancorados",
  "cita_dias_sem_compra",
  "cita_ultimo_pedido",
  "limites_palavras",
  "pergunta_unica",
  "sem_desconto",
] as const;
export type Criterio = (typeof CRITERIOS)[number];

export interface ResultadoCriterio {
  passou: boolean;
  detalhe?: string;
}
export type Avaliacao = Record<Criterio, ResultadoCriterio>;

const REGEX_NUMERO = /\d+(?:[.,]\d+)*/g;

/** Números de um texto, normalizando a vírgula/ponto final solto ("2026." -> "2026"). */
export function extrairNumeros(texto: string): string[] {
  return texto.match(REGEX_NUMERO) ?? [];
}

/** Todo número que aparece nos dados de entrada, na forma em que foi enviado ao modelo. */
function numerosPermitidos(conta: DadosConta): Set<string> {
  const entrada = JSON.stringify(dadosParaPrompt(conta));
  const permitidos = new Set(extrairNumeros(entrada));
  // Partes de data e valor também valem isoladas ("24/07/2026" -> 24, 07, 2026; "18.432,50" -> 18.432)
  for (const n of [...permitidos]) for (const parte of n.split(/[.,]/)) permitidos.add(parte);
  return permitidos;
}

function textos(b: { briefing: string; proximaAcao: string; whatsapp: string; email: { assunto: string; corpo: string } }) {
  return [b.briefing, b.proximaAcao, b.whatsapp, b.email.assunto, b.email.corpo];
}

function reprovadoTudo(motivo: string): Avaliacao {
  return Object.fromEntries(CRITERIOS.map((c) => [c, { passou: false, detalhe: motivo }])) as Avaliacao;
}

export function avaliarBriefing(conta: DadosConta, saida: unknown): Avaliacao {
  const parse = BriefingFormatoSchema.safeParse(saida);
  if (!parse.success) {
    return reprovadoTudo(`formato inválido: ${parse.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const b = parse.data;
  const todos = textos(b).join("\n");

  const permitidos = numerosPermitidos(conta);
  const inventados = extrairNumeros(todos).filter((n) => !permitidos.has(n));

  const dias = conta.diasSemCompra;
  const citaDias =
    dias == null || new RegExp(`(?<!\\d)${dias}(?!\\d)\\s*dias?`, "i").test(b.briefing);

  const up = conta.ultimoPedido;
  const marcasUltimo = up ? [formatarData(up.data), formatarBRL(up.valorCentavos), String(up.nunota)] : [];
  const citaUltimo = !up || marcasUltimo.some((m) => b.briefing.includes(m));

  const pWpp = contarPalavras(b.whatsapp);
  const pEmail = contarPalavras(b.email.corpo);

  const desconto = textos(b).map(encontrarPromessaDesconto).find((t) => t != null);

  return {
    formato_valido: { passou: true },
    numeros_ancorados: inventados.length
      ? { passou: false, detalhe: `números fora da entrada: ${[...new Set(inventados)].join(", ")}` }
      : { passou: true },
    cita_dias_sem_compra: citaDias
      ? { passou: true }
      : { passou: false, detalhe: `briefing não cita "${dias} dias"` },
    cita_ultimo_pedido: citaUltimo
      ? { passou: true }
      : { passou: false, detalhe: `briefing não cita data, valor nem número do último pedido (${marcasUltimo.join(" / ")})` },
    limites_palavras:
      pWpp <= LIMITE_PALAVRAS_WHATSAPP && pEmail <= LIMITE_PALAVRAS_EMAIL
        ? { passou: true }
        : { passou: false, detalhe: `WhatsApp ${pWpp}/${LIMITE_PALAVRAS_WHATSAPP}, e-mail ${pEmail}/${LIMITE_PALAVRAS_EMAIL}` },
    pergunta_unica: temPerguntaUnicaFinal(b.whatsapp)
      ? { passou: true }
      : { passou: false, detalhe: `WhatsApp com ${(b.whatsapp.match(/\?/g) ?? []).length} "?" ou sem pergunta no final` },
    sem_desconto: desconto ? { passou: false, detalhe: `menciona "${desconto}"` } : { passou: true },
  };
}

export const aprovadoGeral = (a: Avaliacao) => CRITERIOS.every((c) => a[c].passou);
