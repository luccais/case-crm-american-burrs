import { describe, expect, it, vi } from "vitest";
import { type ClienteLLM, ErroLLM, type EventoBriefing, gerarBriefing } from "@/domain/briefing/gerar";
import { briefingTemplate } from "@/domain/briefing/template";
import { briefingValido, contaFicticia } from "./fixtures/conta";

const conta = contaFicticia();

function montar(cliente: ClienteLLM | null, timeoutMs = 1_000) {
  const eventos: EventoBriefing[] = [];
  const esperas: number[] = [];
  const opcoes = {
    cliente,
    timeoutMs,
    registrarEvento: (e: EventoBriefing) => void eventos.push(e),
    esperar: async (ms: number) => void esperas.push(ms),
  };
  return { eventos, esperas, gerar: () => gerarBriefing(conta, opcoes) };
}

const tipos = (eventos: EventoBriefing[]) => eventos.map((e) => `${e.tipo}:${e.motivo}`);

describe("gerarBriefing: fallback", () => {
  it("API caindo: 1 chamada + 2 retries, depois template e evento registrado", async () => {
    const cliente = vi.fn<ClienteLLM>().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { gerar, eventos, esperas } = montar(cliente);

    const r = await gerar();

    expect(cliente).toHaveBeenCalledTimes(3);
    expect(r.origem).toBe("template");
    expect(r.tentativas).toBe(3);
    expect(r.motivoFallback).toBe("ERRO_API");
    expect(r.conteudo).toEqual(briefingTemplate(conta));
    expect(tipos(eventos)).toEqual([
      "BRIEFING_TENTATIVA_FALHOU:ERRO_API",
      "BRIEFING_TENTATIVA_FALHOU:ERRO_API",
      "BRIEFING_TENTATIVA_FALHOU:ERRO_API",
      "BRIEFING_FALLBACK:ERRO_API",
    ]);
    expect(eventos.at(-1)).toMatchObject({ codparc: 1007, promptVersion: "v1", detalhe: "connect ECONNREFUSED" });
    expect(esperas).toEqual([500, 1_500]);
  });

  it("timeout em todas as tentativas: aborta a chamada e usa o template", async () => {
    const sinais: AbortSignal[] = [];
    const cliente: ClienteLLM = ({ signal }) => {
      sinais.push(signal);
      return new Promise(() => {}); // nunca responde
    };
    const { gerar, eventos } = montar(cliente, 20);

    const r = await gerar();

    expect(r.origem).toBe("template");
    expect(r.motivoFallback).toBe("TIMEOUT");
    expect(sinais).toHaveLength(3);
    expect(sinais.every((s) => s.aborted)).toBe(true);
    expect(eventos.at(-1)?.tipo).toBe("BRIEFING_FALLBACK");
  });

  it("saída fora do schema em todas as tentativas: template, com o motivo da reprovação", async () => {
    const invalido = briefingValido({ whatsapp: "Olá! Temos 15% de desconto para vocês." });
    const cliente = vi.fn<ClienteLLM>().mockResolvedValue(invalido);
    const { gerar, eventos } = montar(cliente);

    const r = await gerar();

    expect(cliente).toHaveBeenCalledTimes(3);
    expect(r.origem).toBe("template");
    expect(r.motivoFallback).toBe("SAIDA_INVALIDA");
    expect(eventos.at(-1)?.detalhe).toContain("whatsapp");
    expect(eventos.at(-1)?.detalhe).toContain("15%");
  });

  it("JSON nulo (parse falhou no SDK) conta como saída inválida", async () => {
    const { gerar } = montar(vi.fn<ClienteLLM>().mockResolvedValue(null));
    expect((await gerar()).motivoFallback).toBe("SAIDA_INVALIDA");
  });

  it("sucesso na 2ª tentativa: usa o Claude e registra só a falha da 1ª", async () => {
    const cliente = vi
      .fn<ClienteLLM>()
      .mockRejectedValueOnce(new ErroLLM("API 529: overloaded", true))
      .mockResolvedValueOnce(briefingValido());
    const { gerar, eventos } = montar(cliente);

    const r = await gerar();

    expect(r).toMatchObject({ origem: "claude", tentativas: 2, promptVersion: "v1" });
    expect(r.conteudo).toEqual(briefingValido());
    expect(tipos(eventos)).toEqual(["BRIEFING_TENTATIVA_FALHOU:ERRO_API"]);
  });

  it("erro não-retentável (ex.: 401) vai direto ao template, sem gastar retries", async () => {
    const cliente = vi.fn<ClienteLLM>().mockRejectedValue(new ErroLLM("API 401: invalid x-api-key", false));
    const { gerar, eventos } = montar(cliente);

    const r = await gerar();

    expect(cliente).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ origem: "template", tentativas: 1 });
    expect(tipos(eventos)).toEqual(["BRIEFING_TENTATIVA_FALHOU:ERRO_API", "BRIEFING_FALLBACK:ERRO_API"]);
  });

  it("sem ANTHROPIC_API_KEY (cliente nulo): template direto, evento SEM_CLIENTE", async () => {
    const { gerar, eventos } = montar(null);

    const r = await gerar();

    expect(r).toMatchObject({ origem: "template", tentativas: 0, motivoFallback: "SEM_CLIENTE" });
    expect(tipos(eventos)).toEqual(["BRIEFING_FALLBACK:SEM_CLIENTE"]);
  });

  it("passa system e user do prompt v1 com os dados formatados do ERP", async () => {
    const cliente = vi.fn<ClienteLLM>().mockResolvedValue(briefingValido());
    await montar(cliente).gerar();

    const chamada = cliente.mock.calls[0]![0];
    expect(chamada.system).toContain("único");
    expect(chamada.user).toContain('"dias_sem_compra": 74');
    expect(chamada.user).toContain("R$ 18.432,50");
    expect(chamada.user).toContain("24/07/2026");
  });
});
