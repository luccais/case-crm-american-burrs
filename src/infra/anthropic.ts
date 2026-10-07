import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type ClienteLLM, ErroLLM } from "@/domain/briefing/gerar";
import { BriefingFormatoSchema } from "@/domain/briefing/schema";

export const MODELO_PADRAO = "claude-opus-5-5";

/**
 * Adaptador da Claude API para o gerador de briefing.
 *
 * - A chave vem só do ambiente (ANTHROPIC_API_KEY); sem chave, devolve null e o gerador usa o template.
 * - maxRetries: 0 no SDK: quem conta as tentativas é o gerarBriefing (DECISOES.md, decisão 6).
 * - Saída estruturada com o schema de forma; as regras de texto são validadas no domínio.
 * - fallbacks "default": se o modelo recusar por política, a API tenta outro modelo na mesma chamada.
 */
export function criarClienteClaude(env: NodeJS.ProcessEnv = process.env): ClienteLLM | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const model = env.CLAUDE_MODEL || MODELO_PADRAO;

  return async ({ system, user, signal }) => {
    try {
      const resposta = await client.beta.messages.parse(
        {
          model,
          max_tokens: 16_000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: "medium", format: betaZodOutputFormat(BriefingFormatoSchema) },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );
      if (resposta.stop_reason === "refusal") {
        throw new ErroLLM(`recusa do modelo (${resposta.stop_details?.category ?? "sem categoria"})`, false);
      }
      if (resposta.stop_reason === "max_tokens") throw new ErroLLM("resposta truncada (max_tokens)", true);
      // parsed_output nulo -> o domínio reprova no schema e conta como SAIDA_INVALIDA
      return resposta.parsed_output;
    } catch (err) {
      if (err instanceof ErroLLM) throw err;
      if (err instanceof Anthropic.APIError && typeof err.status === "number") {
        const retentavel = err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500;
        throw new ErroLLM(`API ${err.status}: ${err.message}`, retentavel);
      }
      throw err; // conexão, abort por timeout, parse: retentável por padrão
    }
  };
}
