import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ClienteLLM, gerarBriefing } from "@/domain/briefing/gerar";
import { CRITERIOS, aprovadoGeral, avaliarBriefing } from "@/domain/briefing/rubrica";
import { BriefingSchema } from "@/domain/briefing/schema";
import { briefingTemplate } from "@/domain/briefing/template";
import type { DadosConta } from "@/domain/briefing/tipos";
import { clienteMock } from "@/eval/clientes-mock";
import { executarEval, linhaHistorico, relatorioMarkdown } from "@/eval/executar";
import { briefingValido, contaFicticia } from "./fixtures/conta";

const contasEval: DadosConta[] = JSON.parse(readFileSync("evals/fixtures/contas.json", "utf8"));
const conta = contaFicticia();
const reprovados = (saida: unknown) =>
  Object.entries(avaliarBriefing(conta, saida))
    .filter(([, r]) => !r.passou)
    .map(([c]) => c);

describe("rubrica", () => {
  it("briefing bom passa em todos os critérios", () => {
    expect(reprovados(briefingValido())).toEqual([]);
  });

  it("número inventado ou arredondado reprova numeros_ancorados", () => {
    const b = briefingValido({ briefing: `${briefingValido().briefing} Potencial de R$ 20 mil.` });
    const a = avaliarBriefing(conta, b);
    expect(a.numeros_ancorados.passou).toBe(false);
    expect(a.numeros_ancorados.detalhe).toContain("20");
  });

  it("números da entrada, inclusive data e valor formatados, são aceitos", () => {
    const b = briefingValido({
      briefing: "74 dias sem compra; pedido 50231 de 24/07/2026 (R$ 18.432,50); 5 pedidos em 12 meses, R$ 72.150,00.",
    });
    expect(avaliarBriefing(conta, b).numeros_ancorados).toEqual({ passou: true });
  });

  it("briefing sem os dias sem compra reprova", () => {
    expect(reprovados(briefingValido({ briefing: "Último pedido em 24/07/2026." }))).toEqual(["cita_dias_sem_compra"]);
  });

  it("briefing sem o último pedido reprova", () => {
    expect(reprovados(briefingValido({ briefing: "Conta com 74 dias sem compra." }))).toEqual(["cita_ultimo_pedido"]);
  });

  it("limites de palavras, pergunta única e desconto", () => {
    const longo = Array.from({ length: 51 }, () => "palavra").join(" ") + "?";
    expect(reprovados(briefingValido({ whatsapp: longo }))).toEqual(["limites_palavras"]);
    expect(reprovados(briefingValido({ whatsapp: "Tudo bem? Podemos falar?" }))).toEqual(["pergunta_unica"]);
    expect(reprovados(briefingValido({ proximaAcao: "Oferecer condição especial." }))).toEqual(["sem_desconto"]);
  });

  it("saída fora do formato reprova todos os critérios", () => {
    expect(reprovados({ texto: "solto" })).toEqual([...CRITERIOS]);
    expect(reprovados(null)).toEqual([...CRITERIOS]);
  });
});

describe("conjunto do eval (evals/fixtures/contas.json)", () => {
  it("tem 20 contas fictícias, todas em Vermelho ou Preto", () => {
    expect(contasEval).toHaveLength(20);
    expect(new Set(contasEval.map((c) => c.farol))).toEqual(new Set(["VERMELHO", "PRETO"]));
  });

  it("o template de fallback passa no schema de runtime e na rubrica inteira para as 20 contas", () => {
    for (const c of contasEval) {
      const t = briefingTemplate(c);
      expect(BriefingSchema.safeParse(t).success, `schema ${c.codparc}`).toBe(true);
      expect(aprovadoGeral(avaliarBriefing(c, t)), `rubrica ${c.codparc}`).toBe(true);
    }
  });
});

describe("executarEval", () => {
  it("mock bom: 100% em todos os critérios", async () => {
    const r = await executarEval(contasEval, clienteMock("bom", contasEval), { modelo: "mock-bom" });
    expect(r.taxaAprovacaoGeral).toBe(1);
    expect(Object.values(r.taxaPorCriterio).every((t) => t === 1)).toBe(true);
    expect(linhaHistorico(r).split(",")).toHaveLength(7 + CRITERIOS.length + 2);
  });

  it("mock ruim: a rubrica pega número inventado, desconto e briefing sem dados", async () => {
    const r = await executarEval(contasEval, clienteMock("ruim", contasEval), { modelo: "mock-ruim", concorrencia: 1 });
    expect(r.taxaPorCriterio.numeros_ancorados).toBeLessThan(1);
    expect(r.taxaPorCriterio.sem_desconto).toBeLessThan(1);
    expect(r.taxaPorCriterio.cita_dias_sem_compra).toBeLessThan(1);
    expect(r.taxaAprovacaoGeral).toBe(0.5);
    expect(relatorioMarkdown(r)).toContain("## Reprovações");
  });

  it("API caindo durante o eval: cada conta registra o erro e reprova", async () => {
    const caiu: ClienteLLM = async () => {
      throw new Error("503 overloaded");
    };
    const r = await executarEval(contasEval.slice(0, 3), caiu, { modelo: "fora" });
    expect(r.errosApi).toBe(3);
    expect(r.taxaAprovacaoGeral).toBe(0);
    expect(r.contas[0]?.erro).toBe("503 overloaded");
  });

  it("e, no fluxo de produção, a mesma queda faz o fallback entrar com briefing aprovado na rubrica", async () => {
    const caiu: ClienteLLM = async () => {
      throw new Error("503 overloaded");
    };
    const c = contasEval[0]!;
    const r = await gerarBriefing(c, { cliente: caiu, registrarEvento: () => {}, esperar: async () => {} });
    expect(r.origem).toBe("template");
    expect(aprovadoGeral(avaliarBriefing(c, r.conteudo))).toBe(true);
  });
});
