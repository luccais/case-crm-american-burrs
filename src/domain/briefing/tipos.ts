import type { CorFarol } from "../farol";

/** Dados da conta vindos do ERP (vw_farol_rfm + parceiro). É tudo o que o briefing pode usar. */
export interface DadosConta {
  codparc: number;
  nome: string;
  cidade: string;
  uf: string;
  contatoNome: string | null;
  vendedor: string;
  farol: CorFarol;
  diasSemCompra: number | null;
  ultimoPedido: { nunota: number; data: string; valorCentavos: number } | null;
  pedidos12m: number;
  valor12mCentavos: number;
  produtosFrequentes: string[];
}
