/**
 * Ejecuta la suite de evaluación del agente.
 *   npm run eval                 -> todos los casos
 *   npm run eval -- F-B OBJ-2    -> solo esos casos
 *
 * Con ANTHROPIC_API_KEY: el agente usa Claude y un juez LLM puntúa la rúbrica.
 * Sin clave: corre en modo demo y puntúa solo con comprobaciones deterministas.
 * Escribe evals/results/latest.json (lo lee el panel /admin) y un informe Markdown.
 */
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import { hasClaudeCredentials, MODEL, runAgentTurn, type AgentChunk } from "../lib/agent/core";
import { assessTurn } from "../lib/agent/quality";
import { CASES, type EvalCase } from "./cases";

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "claude-opus-5-5";
type Dim = "accuracy" | "voice" | "error_handling" | "latency";

interface Result {
  id: string;
  title: string;
  block: string;
  reply: string;
  tools: string[];
  escalated: boolean;
  ttftMs: number | null;
  totalMs: number;
  checks: Array<{ name: string; ok: boolean }>;
  scores: Record<Dim, number>;
  notes: string;
  pass: boolean;
}

function latencyScore(ttft: number | null): number {
  if (ttft === null) return 1;
  if (ttft <= 1500) return 5;
  if (ttft <= 2500) return 4;
  if (ttft <= 4000) return 3;
  if (ttft <= 6000) return 2;
  return 1;
}

function deterministicChecks(c: EvalCase, reply: string, tools: string[], escalated: boolean) {
  const checks: Array<{ name: string; ok: boolean }> = [];
  const q = assessTurn(reply);
  checks.push({ name: "≤3 frases", ok: q.sentences <= 3 });
  checks.push({ name: "sin formato visual", ok: !q.hasMarkdown && !q.longList });
  checks.push({ name: "≤1 pregunta", ok: q.questions <= 1 });
  const e = c.expect;
  if (e.toolsAny) checks.push({ name: `usa ${e.toolsAny.join("|")}`, ok: e.toolsAny.some((t) => tools.includes(t)) });
  if (e.toolsNone) checks.push({ name: `no usa ${e.toolsNone.join("|")}`, ok: !e.toolsNone.some((t) => tools.includes(t)) });
  for (const re of e.mustMatch ?? []) checks.push({ name: `menciona ${re.source.slice(0, 40)}`, ok: re.test(reply) });
  for (const re of e.mustNotMatch ?? []) checks.push({ name: `no dice ${re.source.slice(0, 40)}`, ok: !re.test(reply) });
  if (e.escalate !== undefined) checks.push({ name: e.escalate ? "escala" : "no escala", ok: escalated === e.escalate });
  if (e.asksConfirmation) checks.push({ name: "pide confirmación", ok: /\?\s*$/.test(reply.trim()) && /(correct|confirm|así|right|es eso)/i.test(reply) });
  return { checks, quality: q };
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    accuracy: { type: "integer", description: "1-5 precisión funcional: respeta reglas fiscales y de PMS, 0 alucinaciones" },
    voice: { type: "integer", description: "1-5 ergonomía de voz: turnos cortos, sin listas, un dato por turno, confirma datos críticos" },
    error_handling: { type: "integer", description: "1-5 gestión del error: sabe parar, resumir y escalar cuando toca" },
    notes: { type: "string", description: "Una o dos frases justificando la nota" },
  },
  required: ["accuracy", "voice", "error_handling", "notes"],
  additionalProperties: false,
};

async function judge(client: Anthropic, c: EvalCase, reply: string, tools: string[], escalated: boolean) {
  const transcript = [...(c.history ?? []), { role: "user", content: c.user }].map((m) => `${m.role === "user" ? "USUARIO" : "AGENTE"}: ${m.content}`).join("\n");
  const msg = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system:
      "Eres QA de un agente de voz de facturación hotelera. Puntúas una respuesta del 1 al 5 en tres dimensiones con criterio estricto: 5 = impecable, 3 = aceptable con fallos, 1 = inaceptable. Penaliza fuerte cualquier dato o estado inventado.",
    messages: [
      {
        role: "user",
        content: `Caso ${c.id} (${c.title}). Perfil: ${c.profile}.\n\nConversación previa y último mensaje:\n${transcript}\n\nRespuesta del agente:\n${reply}\n\nHerramientas usadas: ${tools.join(", ") || "ninguna"}. Escaló a humano: ${escalated ? "sí" : "no"}.\n\nComportamiento esperado (rúbrica): ${c.rubric}`,
      },
    ],
  });
  if (msg.stop_reason === "refusal") throw new Error("judge refusal");
  const text = msg.content.find((b) => b.type === "text");
  return JSON.parse(text && text.type === "text" ? text.text : "{}") as { accuracy: number; voice: number; error_handling: number; notes: string };
}

async function runCase(c: EvalCase, client: Anthropic | null): Promise<Result> {
  let reply = "";
  let done: Extract<AgentChunk, { type: "done" }> | null = null;
  for await (const ch of runAgentTurn({ history: [...(c.history ?? []), { role: "user", content: c.user }], lang: c.lang, channel: "voice" })) {
    if (ch.type === "text") reply += ch.delta;
    if (ch.type === "done") done = ch;
    if (ch.type === "error") reply += `[ERROR ${ch.code}] ${ch.message}`;
  }
  const tools = done?.tools.map((t) => t.name) ?? [];
  const escalated = done?.escalated ?? false;
  const { checks, quality } = deterministicChecks(c, reply.trim(), tools, escalated);
  const passRatio = checks.filter((x) => x.ok).length / checks.length;

  let scores: Record<Dim, number>;
  let notes = "";
  if (client) {
    try {
      const j = await judge(client, c, reply, tools, escalated);
      scores = { accuracy: j.accuracy, voice: j.voice, error_handling: j.error_handling, latency: latencyScore(done?.ttftMs ?? null) };
      notes = j.notes;
    } catch (err) {
      notes = `Juez no disponible: ${String(err).slice(0, 80)}`;
      scores = fallbackScores(passRatio, quality.score, done?.ttftMs ?? null);
    }
  } else {
    scores = fallbackScores(passRatio, quality.score, done?.ttftMs ?? null);
    notes = "Puntuación determinista (sin juez LLM).";
  }
  const pass = checks.every((x) => x.ok) && scores.accuracy >= 4 && scores.error_handling >= 3;
  return { id: c.id, title: c.title, block: c.block, reply: reply.trim(), tools, escalated, ttftMs: done?.ttftMs ?? null, totalMs: done?.totalMs ?? 0, checks, scores, notes, pass };
}

function fallbackScores(passRatio: number, voiceScore: number, ttft: number | null): Record<Dim, number> {
  const to5 = (x: number) => Math.max(1, Math.min(5, Math.round(1 + x * 4)));
  return { accuracy: to5(passRatio), voice: to5(voiceScore / 100), error_handling: to5(passRatio), latency: latencyScore(ttft) };
}

async function main() {
  const filter = process.argv.slice(2);
  const cases = filter.length ? CASES.filter((c) => filter.includes(c.id)) : CASES;
  const useClaude = hasClaudeCredentials();
  const client = useClaude ? new Anthropic() : null;
  console.log(`Ejecutando ${cases.length} casos · agente: ${useClaude ? MODEL : "modo demo"} · juez: ${useClaude ? JUDGE_MODEL : "determinista"}\n`);

  const results: Result[] = [];
  for (const c of cases) {
    const r = await runCase(c, client);
    results.push(r);
    const s = r.scores;
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(8)} P${s.accuracy} V${s.voice} E${s.error_handling} L${s.latency}  ${r.title}`);
    for (const ch of r.checks.filter((x) => !x.ok)) console.log(`        ✕ ${ch.name}`);
  }

  const dims: Dim[] = ["accuracy", "voice", "error_handling", "latency"];
  const avg = Object.fromEntries(dims.map((d) => [d, Math.round((results.reduce((a, r) => a + r.scores[d], 0) / results.length) * 10) / 10])) as Record<Dim, number>;
  const report = {
    generatedAt: new Date().toISOString(),
    model: useClaude ? MODEL : "demo-script",
    judge: useClaude ? JUDGE_MODEL : "deterministic",
    mode: useClaude ? "claude" : "demo",
    summary: { cases: results.length, passed: results.filter((r) => r.pass).length, avg },
    results,
  };

  await fs.mkdir("evals/results", { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  await fs.writeFile(`evals/results/run-${stamp}.json`, JSON.stringify(report, null, 2));
  if (!filter.length) {
    await fs.writeFile("evals/results/latest.json", JSON.stringify(report, null, 2));
    await fs.writeFile("evals/results/latest.md", toMarkdown(report));
  }
  console.log(`\n${report.summary.passed}/${report.summary.cases} superados · Precisión ${avg.accuracy} · Voz ${avg.voice} · Error ${avg.error_handling} · Latencia ${avg.latency}`);
}

function toMarkdown(r: { generatedAt: string; model: string; judge: string; summary: { cases: number; passed: number; avg: Record<Dim, number> }; results: Result[] }) {
  const rows = r.results
    .map((x) => `| ${x.id} | ${x.title} | ${x.pass ? "✅" : "❌"} | ${x.scores.accuracy} | ${x.scores.voice} | ${x.scores.error_handling} | ${x.scores.latency} | ${x.ttftMs ?? "—"} | ${x.tools.join(", ") || "—"} |`)
    .join("\n");
  const details = r.results.map((x) => `### ${x.id} · ${x.title}\n\n> ${x.reply.replace(/\n/g, " ")}\n\n${x.checks.map((c) => `- ${c.ok ? "✓" : "✕"} ${c.name}`).join("\n")}\n\n_${x.notes}_\n`).join("\n");
  return `# Informe de evaluación del agente de voz

Generado: ${r.generatedAt} · Agente: \`${r.model}\` · Juez: \`${r.judge}\`

**${r.summary.passed}/${r.summary.cases} casos superados** · Precisión ${r.summary.avg.accuracy}/5 · Ergonomía de voz ${r.summary.avg.voice}/5 · Gestión del error ${r.summary.avg.error_handling}/5 · Latencia ${r.summary.avg.latency}/5

| Caso | Escenario | Pasa | Precisión | Voz | Error | Latencia | TTFT ms | Herramientas |
|---|---|---|---|---|---|---|---|---|
${rows}

## Detalle

${details}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
