import { describe, expect, it } from "vitest";
import { type EntradaKit, type ProdutoErp, validarKit } from "@/domain/kit";

const produtos: ProdutoErp[] = [
  { codprod: 101, descricao: "Diamantada esférica 1012", tipo: "DIAMANTADA", precoCentavos: 1_200, estoqueDisponivel: 500 },
  { codprod: 102, descricao: "Diamantada tronco-cônica 3216", tipo: "DIAMANTADA", precoCentavos: 1_500, estoqueDisponivel: 40 },
  { codprod: 201, descricao: "Carbide esférica 2", tipo: "CARBIDE", precoCentavos: 900, estoqueDisponivel: 500 },
  { codprod: 301, descricao: "Mandril para PM", tipo: "OUTRO", precoCentavos: 2_000, estoqueDisponivel: 500 },
];

// Kit válido: 5 diamantadas + 3 carbide = 8 un./aluno; custo 5*12 + 3*9 = R$ 87,00
function kitBase(over: Partial<EntradaKit> = {}): EntradaKit {
  return {
    itens: [
      { codprod: 101, qtdPorAluno: 5 },
      { codprod: 201, qtdPorAluno: 3 },
    ],
    alunos: 40,
    tetoCustoPorAlunoCentavos: 10_000,
    produtos,
    ...over,
  };
}

const codigos = (e: EntradaKit) => validarKit(e).violacoes.map((v) => v.codigo);

describe("validarKit", () => {
  it("aceita um kit que cumpre todas as regras e calcula os totais", () => {
    const r = validarKit(kitBase());
    expect(r.valido).toBe(true);
    expect(r.violacoes).toEqual([]);
    expect(r.unidadesPorAluno).toBe(8);
    expect(r.custoPorAlunoCentavos).toBe(8_700);
    expect(r.custoTotalCentavos).toBe(8_700 * 40);
  });

  describe("mínimo de 8 unidades por aluno", () => {
    it("7 unidades reprova", () => {
      expect(codigos(kitBase({ itens: [{ codprod: 101, qtdPorAluno: 4 }, { codprod: 201, qtdPorAluno: 3 }] })))
        .toEqual(["MINIMO_UNIDADES"]);
    });
    it("8 unidades exatas aprova", () => {
      expect(validarKit(kitBase()).valido).toBe(true);
    });
  });

  describe("ao menos uma diamantada e uma carbide", () => {
    it("sem carbide reprova", () => {
      expect(codigos(kitBase({ itens: [{ codprod: 101, qtdPorAluno: 8 }] }))).toEqual(["SEM_CARBIDE"]);
    });
    it("sem diamantada reprova", () => {
      expect(codigos(kitBase({ itens: [{ codprod: 201, qtdPorAluno: 8 }] }))).toEqual(["SEM_DIAMANTADA"]);
    });
    it("itens OUTRO não contam como diamantada nem carbide", () => {
      expect(codigos(kitBase({ itens: [{ codprod: 301, qtdPorAluno: 8 }], tetoCustoPorAlunoCentavos: 99_999 })))
        .toEqual(["SEM_DIAMANTADA", "SEM_CARBIDE"]);
    });
  });

  describe("estoque suficiente para a turma", () => {
    it("estoque exato para a turma aprova (2 x 20 = 40)", () => {
      const r = validarKit(kitBase({
        alunos: 20,
        itens: [{ codprod: 102, qtdPorAluno: 2 }, { codprod: 101, qtdPorAluno: 3 }, { codprod: 201, qtdPorAluno: 3 }],
      }));
      expect(r.valido).toBe(true);
    });
    it("uma unidade a mais que o estoque reprova e aponta o produto", () => {
      const r = validarKit(kitBase({
        alunos: 21,
        itens: [{ codprod: 102, qtdPorAluno: 2 }, { codprod: 101, qtdPorAluno: 3 }, { codprod: 201, qtdPorAluno: 3 }],
      }));
      expect(r.violacoes).toEqual([
        expect.objectContaining({ codigo: "ESTOQUE_INSUFICIENTE", codprod: 102 }),
      ]);
      expect(r.violacoes[0]?.mensagem).toContain("42");
    });
    it("o mesmo produto em duas linhas soma para o estoque", () => {
      const r = validarKit(kitBase({
        alunos: 20,
        itens: [{ codprod: 102, qtdPorAluno: 1 }, { codprod: 102, qtdPorAluno: 2 }, { codprod: 201, qtdPorAluno: 5 }],
      }));
      expect(r.violacoes.map((v) => v.codigo)).toEqual(["ESTOQUE_INSUFICIENTE"]);
    });
  });

  describe("custo por aluno dentro do teto", () => {
    it("custo igual ao teto aprova", () => {
      expect(validarKit(kitBase({ tetoCustoPorAlunoCentavos: 8_700 })).valido).toBe(true);
    });
    it("um centavo acima do teto reprova", () => {
      const r = validarKit(kitBase({ tetoCustoPorAlunoCentavos: 8_699 }));
      expect(r.violacoes.map((v) => v.codigo)).toEqual(["CUSTO_ACIMA_TETO"]);
      expect(r.violacoes[0]?.mensagem).toContain("87,00");
    });
  });

  describe("entradas inválidas", () => {
    it("kit vazio reprova com todas as regras aplicáveis", () => {
      expect(codigos(kitBase({ itens: [] }))).toEqual(["KIT_VAZIO", "MINIMO_UNIDADES", "SEM_DIAMANTADA", "SEM_CARBIDE"]);
    });
    it("produto que não existe no ERP é apontado", () => {
      expect(codigos(kitBase({ itens: [...kitBase().itens, { codprod: 999, qtdPorAluno: 1 }] })))
        .toEqual(["PRODUTO_INEXISTENTE"]);
    });
    it("quantidade zero, negativa ou fracionada é rejeitada", () => {
      const r = validarKit(kitBase({ itens: [...kitBase().itens, { codprod: 301, qtdPorAluno: 0 }, { codprod: 301, qtdPorAluno: 1.5 }] }));
      expect(r.violacoes.map((v) => v.codigo)).toEqual(["QUANTIDADE_INVALIDA", "QUANTIDADE_INVALIDA"]);
    });
    it("turma com 0 alunos reprova", () => {
      expect(codigos(kitBase({ alunos: 0 }))).toEqual(["TURMA_INVALIDA"]);
    });
  });
});
