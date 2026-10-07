/**
 * Validação do kit acadêmico (montagem por aluno de uma turma).
 *
 * Regras:
 *  - mínimo de 8 unidades por aluno;
 *  - ao menos uma broca diamantada e uma carbide;
 *  - estoque disponível suficiente para a turma inteira (qtd por aluno x alunos);
 *  - custo por aluno dentro do teto informado.
 *
 * Dinheiro em centavos inteiros (DECISOES.md, decisão 8). Função pura: o preço e o estoque
 * chegam já lidos do ERP.
 */
export const MIN_UNIDADES_POR_ALUNO = 8;

export type TipoBroca = "DIAMANTADA" | "CARBIDE" | "OUTRO";

export interface ProdutoErp {
  codprod: number;
  descricao: string;
  tipo: TipoBroca;
  precoCentavos: number;
  estoqueDisponivel: number;
}

export interface ItemKit {
  codprod: number;
  qtdPorAluno: number;
}

export interface EntradaKit {
  itens: ItemKit[];
  alunos: number;
  tetoCustoPorAlunoCentavos: number;
  produtos: ProdutoErp[];
}

export type CodigoViolacao =
  | "TURMA_INVALIDA"
  | "KIT_VAZIO"
  | "QUANTIDADE_INVALIDA"
  | "PRODUTO_INEXISTENTE"
  | "MINIMO_UNIDADES"
  | "SEM_DIAMANTADA"
  | "SEM_CARBIDE"
  | "ESTOQUE_INSUFICIENTE"
  | "CUSTO_ACIMA_TETO";

export interface Violacao {
  codigo: CodigoViolacao;
  mensagem: string;
  codprod?: number;
}

export interface ResultadoKit {
  valido: boolean;
  violacoes: Violacao[];
  unidadesPorAluno: number;
  custoPorAlunoCentavos: number;
  custoTotalCentavos: number;
}

export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function validarKit(entrada: EntradaKit): ResultadoKit {
  const { alunos, tetoCustoPorAlunoCentavos } = entrada;
  const violacoes: Violacao[] = [];
  const produtos = new Map(entrada.produtos.map((p) => [p.codprod, p]));

  if (!Number.isInteger(alunos) || alunos <= 0) {
    violacoes.push({ codigo: "TURMA_INVALIDA", mensagem: "A turma precisa ter ao menos 1 aluno." });
  }

  // Agrupa por produto: o mesmo CODPROD lançado duas vezes soma no estoque e no custo.
  const qtdPorProduto = new Map<number, number>();
  for (const item of entrada.itens) {
    if (!Number.isInteger(item.qtdPorAluno) || item.qtdPorAluno <= 0) {
      violacoes.push({
        codigo: "QUANTIDADE_INVALIDA",
        codprod: item.codprod,
        mensagem: `Quantidade por aluno inválida para o produto ${item.codprod}.`,
      });
      continue;
    }
    qtdPorProduto.set(item.codprod, (qtdPorProduto.get(item.codprod) ?? 0) + item.qtdPorAluno);
  }

  if (qtdPorProduto.size === 0) {
    violacoes.push({ codigo: "KIT_VAZIO", mensagem: "O kit não tem nenhum item." });
  }

  let unidadesPorAluno = 0;
  let custoPorAlunoCentavos = 0;
  let temDiamantada = false;
  let temCarbide = false;

  for (const [codprod, qtd] of qtdPorProduto) {
    const produto = produtos.get(codprod);
    if (!produto) {
      violacoes.push({
        codigo: "PRODUTO_INEXISTENTE",
        codprod,
        mensagem: `Produto ${codprod} não encontrado no ERP.`,
      });
      continue;
    }
    unidadesPorAluno += qtd;
    custoPorAlunoCentavos += qtd * produto.precoCentavos;
    if (produto.tipo === "DIAMANTADA") temDiamantada = true;
    if (produto.tipo === "CARBIDE") temCarbide = true;

    const necessario = qtd * Math.max(alunos, 0);
    if (necessario > produto.estoqueDisponivel) {
      violacoes.push({
        codigo: "ESTOQUE_INSUFICIENTE",
        codprod,
        mensagem:
          `Estoque insuficiente de ${produto.descricao}: a turma precisa de ${necessario} ` +
          `e há ${produto.estoqueDisponivel} disponíveis.`,
      });
    }
  }

  if (unidadesPorAluno < MIN_UNIDADES_POR_ALUNO) {
    violacoes.push({
      codigo: "MINIMO_UNIDADES",
      mensagem: `O kit tem ${unidadesPorAluno} unidades por aluno; o mínimo é ${MIN_UNIDADES_POR_ALUNO}.`,
    });
  }
  if (!temDiamantada) {
    violacoes.push({ codigo: "SEM_DIAMANTADA", mensagem: "O kit precisa de ao menos uma broca diamantada." });
  }
  if (!temCarbide) {
    violacoes.push({ codigo: "SEM_CARBIDE", mensagem: "O kit precisa de ao menos uma broca carbide." });
  }
  if (custoPorAlunoCentavos > tetoCustoPorAlunoCentavos) {
    violacoes.push({
      codigo: "CUSTO_ACIMA_TETO",
      mensagem:
        `Custo por aluno de ${formatarBRL(custoPorAlunoCentavos)} acima do teto de ` +
        `${formatarBRL(tetoCustoPorAlunoCentavos)}.`,
    });
  }

  return {
    valido: violacoes.length === 0,
    violacoes,
    unidadesPorAluno,
    custoPorAlunoCentavos,
    custoTotalCentavos: custoPorAlunoCentavos * Math.max(alunos, 0),
  };
}
