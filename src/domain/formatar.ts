/** Formatação pt-BR usada no app, nos prompts e no template (mesma forma em todos os lugares). */

export function formatarBRL(centavos: number): string {
  // Intl usa espaço não separável depois de "R$"; troca por espaço comum para o texto
  // gerado (e a comparação do eval) não dependerem de um caractere invisível.
  return (centavos / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}

/** "2026-08-14" -> "14/08/2026". Trabalha na string para não sofrer com fuso horário. */
export function formatarData(isoDate: string): string {
  const [ano, mes, dia] = isoDate.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}
