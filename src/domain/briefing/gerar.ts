import { PROMPT_VERSION, montarPromptV1 } from "./prompts/v1";
import { type Briefing, BriefingSchema } from "./schema";
import { briefingTemplate } from "./template";
import type { DadosConta } from "./tipos";

/**
 * Geração do briefing com retry e fallback (DECISOES.md, decisão 6).
 *
 * 1 chamada + no máximo 2 novas tentativas. Cada tentativa tem timeout próprio. Conta como falha:
 * erro da API, timeout ou saída que não passa no BriefingSchema. Erro não-retentável
 * (ex.: chave inválida) vai direto ao fallback, já que tentar de novo não muda o resultado.
 * Depois disso entra o template com dados do ERP e o evento é registrado.
 */

export interface ChamadaLLM {
  system: string;
  user: string;
  signal: AbortSignal;
}

/** Cliente injetável: devolve o JSON bruto do modelo. A validação é feita aqui, não no cliente. */
export type ClienteLLM = (chamada: ChamadaLLM) => Promise<unknown>;

/** Erro do cliente que diz se adianta tentar de novo. Erros desconhecidos são tratados como retentáveis. */
export class ErroLLM extends Error {
  constructor(message: string, readonly retentavel: boolean) {
    super(message);
    this.name = "ErroLLM";
  }
}

export type MotivoFalha = "SEM_CLIENTE" | "ERRO_API" | "TIMEOUT" | "SAIDA_INVALIDA";

export interface EventoBriefing {
  tipo: "BRIEFING_TENTATIVA_FALHOU" | "BRIEFING_FALLBACK";
  codparc: number;
  promptVersion: string;
  tentativa: number;
  motivo: MotivoFalha;
  detalhe: string;
}

export interface OpcoesGeracao {
  /** null quando não há ANTHROPIC_API_KEY: vai direto ao template. */
  cliente: ClienteLLM | null;
  registrarEvento: (e: EventoBriefing) => void | Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  /** Espera entre tentativas; injetável para os testes não dormirem. */
  esperar?: (ms: number) => Promise<void>;
}

export interface ResultadoBriefing {
  conteudo: Briefing;
  origem: "claude" | "template";
  tentativas: number;
  promptVersion: string;
  motivoFallback?: MotivoFalha;
}

export const TIMEOUT_PADRAO_MS = 20_000;
export const MAX_RETRIES_PADRAO = 2;
const BACKOFF_MS = [500, 1_500];

class ErroTimeout extends Error {}

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ErroTimeout(`timeout de ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function gerarBriefing(conta: DadosConta, opcoes: OpcoesGeracao): Promise<ResultadoBriefing> {
  const {
    cliente,
    registrarEvento,
    timeoutMs = TIMEOUT_PADRAO_MS,
    maxRetries = MAX_RETRIES_PADRAO,
    esperar = dormir,
  } = opcoes;

  const evento = (tipo: EventoBriefing["tipo"], tentativa: number, motivo: MotivoFalha, detalhe: string) =>
    registrarEvento({ tipo, codparc: conta.codparc, promptVersion: PROMPT_VERSION, tentativa, motivo, detalhe });

  const fallback = async (tentativas: number, motivo: MotivoFalha, detalhe: string): Promise<ResultadoBriefing> => {
    await evento("BRIEFING_FALLBACK", tentativas, motivo, detalhe);
    return {
      conteudo: briefingTemplate(conta),
      origem: "template",
      tentativas,
      promptVersion: PROMPT_VERSION,
      motivoFallback: motivo,
    };
  };

  if (!cliente) return fallback(0, "SEM_CLIENTE", "ANTHROPIC_API_KEY não configurada");

  const prompt = montarPromptV1(conta);
  const totalTentativas = 1 + maxRetries;
  let ultimoMotivo: MotivoFalha = "ERRO_API";
  let ultimoDetalhe = "";

  for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
    let retentavel = true;
    try {
      const bruto = await comTimeout((signal) => cliente({ ...prompt, signal }), timeoutMs);
      const validado = BriefingSchema.safeParse(bruto);
      if (validado.success) {
        return { conteudo: validado.data, origem: "claude", tentativas: tentativa, promptVersion: PROMPT_VERSION };
      }
      ultimoMotivo = "SAIDA_INVALIDA";
      ultimoDetalhe = validado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      ultimoMotivo = err instanceof ErroTimeout ? "TIMEOUT" : "ERRO_API";
      ultimoDetalhe = err instanceof Error ? err.message : String(err);
      if (err instanceof ErroLLM) retentavel = err.retentavel;
    }

    await evento("BRIEFING_TENTATIVA_FALHOU", tentativa, ultimoMotivo, ultimoDetalhe);
    if (!retentavel) return fallback(tentativa, ultimoMotivo, ultimoDetalhe);
    if (tentativa < totalTentativas) await esperar(BACKOFF_MS[tentativa - 1] ?? 1_500);
  }

  return fallback(totalTentativas, ultimoMotivo, ultimoDetalhe);
}
