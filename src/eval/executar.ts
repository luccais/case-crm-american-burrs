import { createHash } from "node:crypto";
import type { ClienteLLM } from "@/domain/briefing/gerar";
import { PROMPT_VERSION, SYSTEM_V1, montarPromptV1 } from "@/domain/briefing/prompts/v1";
import { type Avaliacao, CRITERIOS, type Criterio, aprovadoGeral, avaliarBriefing } from "@/domain/briefing/rubrica";
import { BriefingSchema } from "@/domain/briefing/schema";
import type { DadosConta } from "@/domain/briefing/tipos";

export interface ResultadoConta {
  codparc: number;
  nome: string;
  saida: unknown;
  erro?: string;
  avaliacao: Avaliacao;
  aprovado: boolean;
  /** Passaria na validação de runtime (sem precisar de retry/fallback). */
  passaRuntime: boolean;
  ms: number;
}

export interface RelatorioEval {
  executadoEm: string;
  promptVersion: string;
  promptHash: string;
  modelo: string;
  rotulo?: string;
  total: number;
  errosApi: number;
  taxaPorCriterio: Record<Criterio, number>;
  taxaAprovacaoGeral: number;
  taxaPassaRuntime: number;
  contas: ResultadoConta[];
}

export const hashPrompt = () => createHash("sha256").update(SYSTEM_V1).digest("hex").slice(0, 12);

/** Uma chamada por conta, saída bruta (sem retry nem fallback): mede o prompt. */
export async function executarEval(
  contas: DadosConta[],
  cliente: ClienteLLM,
  meta: { modelo: string; rotulo?: string; timeoutMs?: number; concorrencia?: number },
): Promise<RelatorioEval> {
  const { timeoutMs = 60_000, concorrencia = 4 } = meta;
  const resultados: ResultadoConta[] = new Array(contas.length);

  let proxima = 0;
  async function trabalhador() {
    while (proxima < contas.length) {
      const i = proxima++;
      const conta = contas[i]!;
      const inicio = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let saida: unknown = null;
      let erro: string | undefined;
      try {
        saida = await cliente({ ...montarPromptV1(conta), signal: controller.signal });
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
      }
      const avaliacao = avaliarBriefing(conta, saida);
      resultados[i] = {
        codparc: conta.codparc,
        nome: conta.nome,
        saida,
        erro,
        avaliacao,
        aprovado: aprovadoGeral(avaliacao),
        passaRuntime: BriefingSchema.safeParse(saida).success,
        ms: Date.now() - inicio,
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, contas.length) }, trabalhador));

  const taxa = (n: number) => (contas.length ? n / contas.length : 0);
  const taxaPorCriterio = Object.fromEntries(
    CRITERIOS.map((c) => [c, taxa(resultados.filter((r) => r.avaliacao[c].passou).length)]),
  ) as Record<Criterio, number>;

  return {
    executadoEm: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    promptHash: hashPrompt(),
    modelo: meta.modelo,
    rotulo: meta.rotulo,
    total: contas.length,
    errosApi: resultados.filter((r) => r.erro).length,
    taxaPorCriterio,
    taxaAprovacaoGeral: taxa(resultados.filter((r) => r.aprovado).length),
    taxaPassaRuntime: taxa(resultados.filter((r) => r.passaRuntime).length),
    contas: resultados,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function relatorioMarkdown(r: RelatorioEval): string {
  const linhas = [
    `# Eval do briefing: ${r.promptVersion} (${r.modelo})`,
    "",
    `- Executado em: ${r.executadoEm}`,
    `- Prompt: ${r.promptVersion}, hash \`${r.promptHash}\`${r.rotulo ? `, rótulo "${r.rotulo}"` : ""}`,
    `- Contas: ${r.total}; erros de API: ${r.errosApi}`,
    `- **Aprovação geral (todos os critérios): ${pct(r.taxaAprovacaoGeral)}**`,
    `- Passaria na validação de runtime sem fallback: ${pct(r.taxaPassaRuntime)}`,
    "",
    "| Critério | Aprovação |",
    "|---|---|",
    ...CRITERIOS.map((c) => `| ${c} | ${pct(r.taxaPorCriterio[c])} |`),
    "",
    "## Reprovações",
    "",
  ];
  const reprovadas = r.contas.filter((c) => !c.aprovado);
  if (!reprovadas.length) linhas.push("Nenhuma.");
  for (const c of reprovadas) {
    linhas.push(`### ${c.codparc}: ${c.nome}`);
    if (c.erro) linhas.push(`- erro: ${c.erro}`);
    for (const crit of CRITERIOS) {
      const a = c.avaliacao[crit];
      if (!a.passou) linhas.push(`- ${crit}: ${a.detalhe ?? "reprovado"}`);
    }
    linhas.push("");
  }
  return linhas.join("\n");
}

export const CABECALHO_HISTORICO = [
  "executado_em", "prompt_version", "prompt_hash", "modelo", "rotulo", "total", "erros_api",
  ...CRITERIOS, "aprovacao_geral", "passa_runtime",
].join(",");

export function linhaHistorico(r: RelatorioEval): string {
  const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    r.executadoEm, r.promptVersion, r.promptHash, csv(r.modelo), csv(r.rotulo ?? ""), r.total, r.errosApi,
    ...CRITERIOS.map((c) => r.taxaPorCriterio[c].toFixed(3)),
    r.taxaAprovacaoGeral.toFixed(3), r.taxaPassaRuntime.toFixed(3),
  ].join(",");
}
