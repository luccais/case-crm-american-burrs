/**
 * Regra do farol, fiel ao SQL de produção (ver docs/DECISOES.md, decisão 5).
 *
 *   DIASULTIMACOMPRA > 0 and <= 30  -> Verde
 *   31 a 60                         -> Amarelo
 *   61 a 90                         -> Vermelho
 *   91 a 120                        -> Preto
 *   demais (NULL, 0, > 120)         -> Roxo (inativo/lead)
 *
 * Borda conhecida: quem comprou hoje (0 dias) cai em Roxo, como no original.
 * A mesma regra existe em SQL (erp.fn_farol); um teste de paridade compara as duas.
 */
export const CORES_FAROL = ["VERDE", "AMARELO", "VERMELHO", "PRETO", "ROXO"] as const;
export type CorFarol = (typeof CORES_FAROL)[number];

export function classificarFarol(diasUltimaCompra: number | null | undefined): CorFarol {
  const d = diasUltimaCompra;
  if (d == null || !Number.isFinite(d)) return "ROXO";
  if (d > 0 && d <= 30) return "VERDE";
  if (d >= 31 && d <= 60) return "AMARELO";
  if (d >= 61 && d <= 90) return "VERMELHO";
  if (d >= 91 && d <= 120) return "PRETO";
  return "ROXO";
}

/** Cores que disparam geração de briefing de resgate. */
export const CORES_RESGATE: readonly CorFarol[] = ["VERMELHO", "PRETO"];

/** True quando a conta acabou de entrar em uma cor de resgate vinda de outra cor. */
export function entrouEmResgate(anterior: CorFarol | null, atual: CorFarol): boolean {
  return CORES_RESGATE.includes(atual) && anterior !== atual;
}
