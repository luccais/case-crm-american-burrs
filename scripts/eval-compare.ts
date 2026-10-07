/**
 * Compara duas execuções do eval, critério a critério.
 *
 *   npm run eval:compare                      # as duas execuções mais recentes
 *   npm run eval:compare -- <antes.json> <depois.json>
 */
import { readFileSync, readdirSync } from "node:fs";
import { CRITERIOS } from "@/domain/briefing/rubrica";
import type { RelatorioEval } from "@/eval/executar";

const pasta = "evals/runs";
let [antes, depois] = process.argv.slice(2);
if (!antes || !depois) {
  const runs = readdirSync(pasta).filter((f) => f.endsWith(".json")).sort();
  if (runs.length < 2) {
    console.error("São necessárias ao menos duas execuções em evals/runs.");
    process.exit(1);
  }
  [antes, depois] = runs.slice(-2).map((f) => `${pasta}/${f}`);
}

const ler = (p: string): RelatorioEval => JSON.parse(readFileSync(p, "utf8"));
const a = ler(antes!);
const d = ler(depois!);
const id = (r: RelatorioEval) => `${r.promptVersion}/${r.promptHash.slice(0, 7)} ${r.modelo}${r.rotulo ? ` "${r.rotulo}"` : ""}`;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);
const delta = (x: number) => {
  const pp = Math.round(x * 100);
  return pp === 0 ? "    =" : `${pp > 0 ? "+" : ""}${pp}pp`.padStart(5);
};

console.log(`antes : ${id(a)}  (${a.executadoEm})`);
console.log(`depois: ${id(d)}  (${d.executadoEm})\n`);
console.log(`${"critério".padEnd(22)}antes depois   Δ`);
for (const c of CRITERIOS) {
  const x = a.taxaPorCriterio[c];
  const y = d.taxaPorCriterio[c];
  console.log(`${c.padEnd(22)}${pct(x)}  ${pct(y)} ${delta(y - x)}`);
}
console.log(`${"APROVAÇÃO GERAL".padEnd(22)}${pct(a.taxaAprovacaoGeral)}  ${pct(d.taxaAprovacaoGeral)} ${delta(d.taxaAprovacaoGeral - a.taxaAprovacaoGeral)}`);

// Contas que mudaram de status
const antesPorConta = new Map(a.contas.map((c) => [c.codparc, c.aprovado]));
const mudaram = d.contas.filter((c) => antesPorConta.has(c.codparc) && antesPorConta.get(c.codparc) !== c.aprovado);
if (mudaram.length) {
  console.log("\nContas que mudaram:");
  for (const c of mudaram) console.log(`  ${c.codparc} ${c.aprovado ? "passou a aprovar" : "passou a reprovar"}: ${c.nome}`);
}
