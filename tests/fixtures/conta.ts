import type { Briefing } from "@/domain/briefing/schema";
import type { DadosConta } from "@/domain/briefing/tipos";

/** Conta fictícia para testes unitários. */
export function contaFicticia(over: Partial<DadosConta> = {}): DadosConta {
  return {
    codparc: 1007,
    nome: "Faculdade de Odontologia Vale do Ipê",
    cidade: "Campinas",
    uf: "SP",
    contatoNome: "Renata Moura",
    vendedor: "Carlos Andrade",
    farol: "VERMELHO",
    diasSemCompra: 74,
    ultimoPedido: { nunota: 50231, data: "2026-07-24", valorCentavos: 1_843_250 },
    pedidos12m: 5,
    valor12mCentavos: 7_215_000,
    produtosFrequentes: ["Diamantada esférica 1012", "Carbide esférica 2"],
    ...over,
  };
}

export function briefingValido(over: Partial<Briefing> = {}): Briefing {
  return {
    briefing: "Conta em Vermelho: 74 dias sem compra. Último pedido nº 50231 em 24/07/2026, R$ 18.432,50.",
    proximaAcao: "Ligar para a Renata nesta semana.",
    whatsapp: "Olá, Renata! Aqui é o Carlos, da American Burrs. Como está o planejamento das turmas do semestre?",
    email: {
      assunto: "Planejamento de kits",
      corpo: "Olá, Renata! Gostaria de conversar sobre os kits das próximas turmas. Podemos falar esta semana?\n\nCarlos",
    },
    ...over,
  };
}
