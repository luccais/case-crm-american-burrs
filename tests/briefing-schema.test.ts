import { describe, expect, it } from "vitest";
import { contarPalavras, encontrarPromessaDesconto, temPerguntaUnicaFinal } from "@/domain/briefing/regras-texto";
import { BriefingSchema } from "@/domain/briefing/schema";
import { briefingTemplate } from "@/domain/briefing/template";
import { briefingValido, contaFicticia } from "./fixtures/conta";

const palavras = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join(" ");
const erros = (b: unknown) => {
  const r = BriefingSchema.safeParse(b);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("regras de texto", () => {
  it("conta palavras ignorando pontuação solta", () => {
    expect(contarPalavras("Olá, Renata! — tudo bem?")).toBe(4);
    expect(contarPalavras("  ")).toBe(0);
  });

  it("pergunta única no final", () => {
    expect(temPerguntaUnicaFinal("Podemos conversar?")).toBe(true);
    expect(temPerguntaUnicaFinal("Podemos conversar? ")).toBe(true);
    expect(temPerguntaUnicaFinal("Tudo bem? Podemos conversar?")).toBe(false);
    expect(temPerguntaUnicaFinal("Podemos conversar? Abraço.")).toBe(false);
    expect(temPerguntaUnicaFinal("Podemos conversar.")).toBe(false);
  });

  it.each(["10% de desconto", "uma promoção", "condição especial", "frete grátis", "5 % off", "BONIFICAÇÃO"])(
    "detecta promessa de desconto: %s",
    (t) => expect(encontrarPromessaDesconto(t)).not.toBeNull(),
  );

  it("não confunde palavras parecidas", () => {
    expect(encontrarPromessaDesconto("o kit contou com descontinuidade zero")).toBeNull();
    expect(encontrarPromessaDesconto("Último pedido de R$ 18.432,50")).toBeNull();
  });
});

describe("BriefingSchema", () => {
  it("aceita um briefing válido", () => {
    expect(erros(briefingValido())).toEqual([]);
  });

  it("reprova WhatsApp com mais de 50 palavras", () => {
    expect(erros(briefingValido({ whatsapp: `${palavras(50)} ok?` }))).toEqual([
      expect.stringContaining("51 palavras"),
    ]);
  });

  it("aceita WhatsApp com exatamente 50 palavras", () => {
    expect(erros(briefingValido({ whatsapp: `${palavras(49)} ok?` }))).toEqual([]);
  });

  it("reprova WhatsApp sem pergunta final ou com duas perguntas", () => {
    expect(erros(briefingValido({ whatsapp: "Olá, Renata." }))).toHaveLength(1);
    expect(erros(briefingValido({ whatsapp: "Tudo bem? Podemos falar?" }))).toHaveLength(1);
  });

  it("reprova e-mail com mais de 90 palavras", () => {
    expect(erros(briefingValido({ email: { assunto: "Kits", corpo: palavras(91) } }))).toEqual([
      expect.stringContaining("91 palavras"),
    ]);
  });

  it("reprova desconto em qualquer campo", () => {
    expect(erros(briefingValido({ proximaAcao: "Oferecer 10% na recompra." }))).toEqual([
      expect.stringContaining("10%"),
    ]);
    expect(erros(briefingValido({ email: { assunto: "Promoção de volta às aulas", corpo: "Olá!" } }))).toHaveLength(1);
  });

  it("reprova formato errado (campo faltando)", () => {
    const { whatsapp: _, ...semWhatsapp } = briefingValido();
    expect(BriefingSchema.safeParse(semWhatsapp).success).toBe(false);
  });
});

describe("template de fallback passa no mesmo schema", () => {
  it.each([
    ["conta padrão", contaFicticia()],
    ["sem nome de contato", contaFicticia({ contatoNome: null })],
    ["Preto", contaFicticia({ farol: "PRETO", diasSemCompra: 117 })],
    [
      "nomes longos",
      contaFicticia({
        nome: "Centro Universitário de Ciências da Saúde e Odontologia Integrada do Planalto Central",
        contatoNome: "Maria Aparecida dos Santos Albuquerque",
        vendedor: "José Roberto Cavalcanti de Albuquerque Filho",
      }),
    ],
  ])("%s", (_, conta) => {
    expect(erros(briefingTemplate(conta))).toEqual([]);
  });

  it("cita dias sem compra e último pedido", () => {
    const t = briefingTemplate(contaFicticia());
    expect(t.briefing).toContain("74 dias sem compra");
    expect(t.briefing).toContain("24/07/2026");
    expect(t.briefing).toContain("R$ 18.432,50");
  });
});
