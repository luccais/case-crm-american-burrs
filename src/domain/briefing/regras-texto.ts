/**
 * Regras de texto compartilhadas entre a validação em runtime (schema.ts) e o eval (rubrica.ts).
 * Um lugar só, para o eval medir exatamente o que o runtime exige.
 */
export const LIMITE_PALAVRAS_WHATSAPP = 50;
export const LIMITE_PALAVRAS_EMAIL = 90;

/** Conta palavras: tokens separados por espaço que tenham ao menos uma letra ou dígito. */
export function contarPalavras(texto: string): number {
  return texto.split(/\s+/u).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Exatamente um "?" e o texto termina nele (ignorando espaços e emoji/pontuação de fecho). */
export function temPerguntaUnicaFinal(texto: string): boolean {
  const qtd = (texto.match(/\?/g) ?? []).length;
  return qtd === 1 && /\?[\s"”'’)\]]*$/u.test(texto.trim());
}

const TERMOS_DESCONTO = [
  "desconto", "descontos", "abatimento", "promoção", "promocao", "promocional",
  "cupom", "cupons", "bonificação", "bonificacao", "brinde", "brindes", "grátis", "gratis",
  "condição especial", "condicao especial", "condições especiais", "condicoes especiais",
  "preço especial", "preco especial", "oferta", "ofertas", "liquidação", "liquidacao",
];

// Fronteira por letra (não \b, que falha em "ção"); também pega "10%" / "10 %".
const REGEX_DESCONTO = new RegExp(
  `(?<!\\p{L})(${TERMOS_DESCONTO.join("|")})(?!\\p{L})|\\d+\\s?%`,
  "iu",
);

/** Retorna o trecho que sugere desconto/promoção, ou null. */
export function encontrarPromessaDesconto(texto: string): string | null {
  return texto.match(REGEX_DESCONTO)?.[0] ?? null;
}
