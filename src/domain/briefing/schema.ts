import { z } from "zod";
import {
  LIMITE_PALAVRAS_EMAIL,
  LIMITE_PALAVRAS_WHATSAPP,
  contarPalavras,
  encontrarPromessaDesconto,
  temPerguntaUnicaFinal,
} from "./regras-texto";

/**
 * Forma estrutural do briefing. É também o formato pedido ao modelo (structured output);
 * por isso não tem refinements, que não viram JSON Schema.
 */
export const BriefingFormatoSchema = z.object({
  briefing: z.string().min(1).describe("Resumo da situação da conta para o vendedor"),
  proximaAcao: z.string().min(1).describe("Uma ação concreta e imediata para o vendedor"),
  whatsapp: z.string().min(1).describe("Mensagem de WhatsApp para o contato"),
  email: z.object({
    assunto: z.string().min(1).max(120),
    corpo: z.string().min(1),
  }),
});

/** Validação completa em runtime: forma + regras de negócio do texto. */
export const BriefingSchema = BriefingFormatoSchema.superRefine((b, ctx) => {
  const palavrasWpp = contarPalavras(b.whatsapp);
  if (palavrasWpp > LIMITE_PALAVRAS_WHATSAPP) {
    ctx.addIssue({
      code: "custom",
      path: ["whatsapp"],
      message: `WhatsApp com ${palavrasWpp} palavras (máximo ${LIMITE_PALAVRAS_WHATSAPP})`,
    });
  }
  if (!temPerguntaUnicaFinal(b.whatsapp)) {
    ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "WhatsApp deve terminar com uma única pergunta" });
  }
  const palavrasEmail = contarPalavras(b.email.corpo);
  if (palavrasEmail > LIMITE_PALAVRAS_EMAIL) {
    ctx.addIssue({
      code: "custom",
      path: ["email", "corpo"],
      message: `E-mail com ${palavrasEmail} palavras (máximo ${LIMITE_PALAVRAS_EMAIL})`,
    });
  }
  const campos: [string[], string][] = [
    [["briefing"], b.briefing],
    [["proximaAcao"], b.proximaAcao],
    [["whatsapp"], b.whatsapp],
    [["email", "assunto"], b.email.assunto],
    [["email", "corpo"], b.email.corpo],
  ];
  for (const [path, texto] of campos) {
    const trecho = encontrarPromessaDesconto(texto);
    if (trecho) ctx.addIssue({ code: "custom", path, message: `Menciona desconto/promoção: "${trecho}"` });
  }
});

export type Briefing = z.infer<typeof BriefingFormatoSchema>;
