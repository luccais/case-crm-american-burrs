import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ClienteLLM, ErroLLM } from "@/domain/briefing/gerar";
import { BriefingFormatoSchema } from "@/domain/briefing/schema";

export const MODELO_PADRAO = "claude-sonnet-5-5";

/**
 * Adaptador da Claude API para o gerador de briefing.
 *
 * - A chave vem só do ambiente (ANTHROPIC_API_KEY); sem chave, devolve null e o gerador usa o template.
 * - maxRetries: 0 no SDK: quem conta as tentativas é o gerarBriefing (DECISOES.md, decisão 6).
 * - Saída estruturada com o schema de forma; as regras de texto são validadas no domínio.
 * - Recusa do modelo vira erro não-retentável: vai direto ao template.
 */
export function criarClienteClaude(env: NodeJS.ProcessEnv = process.env): ClienteLLM | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const model = env.CLAUDE_MODEL || MODELO_PADRAO;

  return async ({ system, user, signal }) => {
    try {
      const resposta = await client.messages.parse(
        {
          model,
          max_tokens: 16_000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: "medium", format: zodOutputFormat(BriefingFormatoSchema) },
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
