import { describe, expect, it } from "vitest";
import { classificarFarol, entrouEmResgate } from "@/domain/farol";

describe("classificarFarol: bordas da regra de produção", () => {
  it.each([
    [1, "VERDE"],
    [30, "VERDE"],
    [31, "AMARELO"],
    [60, "AMARELO"],
    [61, "VERMELHO"],
    [90, "VERMELHO"],
    [91, "PRETO"],
    [120, "PRETO"],
    [121, "ROXO"],
    [999, "ROXO"],
  ] as const)("%i dias -> %s", (dias, cor) => {
    expect(classificarFarol(dias)).toBe(cor);
  });

  it("sem compra (NULL) -> ROXO", () => {
    expect(classificarFarol(null)).toBe("ROXO");
    expect(classificarFarol(undefined)).toBe("ROXO");
  });

  // Borda conhecida, fiel ao original: o SQL de produção usa "> 0 and <= 30",
  // então quem comprou hoje cai em Roxo. Ver docs/DECISOES.md (decisão 5).
  // Se a regra for corrigida um dia, este teste deve mudar junto com o SQL.
  it("BORDA CONHECIDA: comprou hoje (0 dias) -> ROXO, como em produção", () => {
    expect(classificarFarol(0)).toBe("ROXO");
  });

  it("valores inválidos caem em ROXO, como o 'demais' do SQL", () => {
    expect(classificarFarol(-1)).toBe("ROXO");
    expect(classificarFarol(Number.NaN)).toBe("ROXO");
  });
});

describe("entrouEmResgate", () => {
  it("dispara ao entrar em Vermelho ou Preto vindo de outra cor", () => {
    expect(entrouEmResgate("AMARELO", "VERMELHO")).toBe(true);
    expect(entrouEmResgate("VERMELHO", "PRETO")).toBe(true);
    expect(entrouEmResgate(null, "VERMELHO")).toBe(true);
  });

  it("não dispara de novo se a cor não mudou, nem para outras cores", () => {
    expect(entrouEmResgate("VERMELHO", "VERMELHO")).toBe(false);
    expect(entrouEmResgate("PRETO", "ROXO")).toBe(false);
    expect(entrouEmResgate("VERDE", "AMARELO")).toBe(false);
  });
});
