/**
 * Eval do briefing: roda o prompt atual contra 20 contas fictícias e aplica a rubrica automática.
 *
 *   npm run eval                 # Claude API real (precisa de ANTHROPIC_API_KEY no .env)
 *   npm run eval -- --mock       # sem chave: cliente falso "bom" (template)
 *   npm run eval -- --mock=ruim  # sem chave: cliente falso com defeitos, para ver a rubrica reprovar
 *   npm run eval -- --rotulo "teste tom mais curto"
 *
 * Saída: evals/runs/<data>_<prompt>_<modelo>.json e .md, e uma linha em evals/historico.csv.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { DadosConta } from "@/domain/briefing/tipos";
import { CRITERIOS } from "@/domain/briefing/rubrica";
import { clienteMock } from "@/eval/clientes-mock";
import { CABECALHO_HISTORICO, executarEval, linhaHistorico, relatorioMarkdown } from "@/eval/executar";
import { MODELO_PADRAO, criarClienteClaude } from "@/infra/anthropic";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: segue com o ambiente atual
}

// "--mock" sem valor equivale a "--mock=bom"
const args = process.argv.slice(2).map((a) => (a === "--mock" ? "--mock=bom" : a));
const { values } = parseArgs({
  args,
  options: {
    mock: { type: "string" },
    rotulo: { type: "string" },
    contas: { type: "string", default: "evals/fixtures/contas.json" },
  },
  allowPositionals: false,
});
const mock = values.mock;

const contas: DadosConta[] = JSON.parse(readFileSync(values.contas!, "utf8"));

let cliente;
let modelo: string;
if (mock) {
  if (mock !== "bom" && mock !== "ruim") throw new Error(`--mock deve ser "bom" ou "ruim", recebido "${mock}"`);
  cliente = clienteMock(mock, contas);
  modelo = `mock-${mock}`;
} else {
  cliente = criarClienteClaude();
  modelo = process.env.CLAUDE_MODEL || MODELO_PADRAO;
  if (!cliente) {
    console.error("ANTHROPIC_API_KEY não definida. Configure o .env ou rode com --mock.");
    process.exit(1);
  }
}

console.log(`Eval: ${contas.length} contas, modelo ${modelo}...`);
const r = await executarEval(contas, cliente, { modelo, rotulo: values.rotulo });

const pasta = "evals/runs";
mkdirSync(pasta, { recursive: true });
const carimbo = r.executadoEm.slice(0, 19).replace(/:/g, "-");
const base = `${pasta}/${carimbo}_${r.promptVersion}_${modelo.replace(/[^\w.-]/g, "_")}`;
writeFileSync(`${base}.json`, JSON.stringify(r, null, 2) + "\n", "utf8");
writeFileSync(`${base}.md`, relatorioMarkdown(r) + "\n", "utf8");

const historico = "evals/historico.csv";
if (!existsSync(historico)) writeFileSync(historico, CABECALHO_HISTORICO + "\n", "utf8");
appendFileSync(historico, linhaHistorico(r) + "\n", "utf8");

const pct = (x: number) => `${(x * 100).toFixed(0).padStart(4)}%`;
console.log("");
for (const c of CRITERIOS) console.log(`  ${c.padEnd(22)}${pct(r.taxaPorCriterio[c])}`);
console.log(`  ${"APROVAÇÃO GERAL".padEnd(22)}${pct(r.taxaAprovacaoGeral)}`);
console.log(`  ${"passa no runtime".padEnd(22)}${pct(r.taxaPassaRuntime)}   erros de API: ${r.errosApi}`);
console.log(`\nRelatório: ${base}.md\nHistórico: ${historico}`);
