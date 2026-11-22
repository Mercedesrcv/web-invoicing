"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Metrics } from "@/lib/metrics";
import { Logo } from "./Header";
import { LangToggle, useLang } from "./LangProvider";

interface MetricsResponse {
  storage: string;
  agentMode: string;
  model: string;
  days: number;
  eventCount: number;
  metrics: Metrics;
}
interface Ev { id: string; ts: string; type: string; channel?: string; data: Record<string, unknown> }
interface EvalReport {
  empty?: boolean;
  generatedAt?: string;
  model?: string;
  mode?: string;
  summary?: { cases: number; passed: number; avg: Record<string, number> };
  results?: Array<{ id: string; title: string; pass: boolean; scores: Record<string, number>; notes: string; checks: Array<{ name: string; ok: boolean }> }>;
}

const INTENT_LABEL: Record<string, [string, string]> = {
  invoice_missing: ["Factura no recibida", "Invoice not received"],
  company_invoice: ["Factura a empresa / rectificativa", "Company / corrective invoice"],
  reconciliation: ["Descuadre / conciliación", "Mismatch / reconciliation"],
  vcc_split: ["VCC / split billing", "VCC / split billing"],
  pms_sync: ["Sync con PMS", "PMS sync"],
  compliance: ["Normativa (VeriFactu…)", "Compliance (VeriFactu…)"],
  tax_id_error: ["Error NIF / emisión", "Tax ID / issuing error"],
  pricing: ["Precio", "Pricing"],
  objection_pms: ["Objeción: ya lo hace el PMS", "Objection: PMS does it"],
  privacy: ["Privacidad", "Privacy"],
  out_of_scope: ["Fuera de alcance", "Out of scope"],
  human_request: ["Pide una persona", "Asks for a human"],
  configuration: ["Configuración", "Configuration"],
  other: ["Otros", "Other"],
};

const ms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);

export default function AdminDashboard() {
  const { lang, t } = useLang();
  const L = (es: string, en: string) => (lang === "en" ? en : es);
  const [token, setToken] = useState("");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [evals, setEvals] = useState<EvalReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ id: string; events: Ev[] } | null>(null);

  const headers = useCallback((tk?: string) => ({ Authorization: `Bearer ${tk ?? token}` }), [token]);

  const load = useCallback(
    async (tk?: string) => {
      const useToken = tk ?? token;
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/admin/metrics?days=${days}`, { headers: headers(useToken), cache: "no-store" });
        if (r.status === 401) throw new Error(lang === "en" ? "Wrong password" : "Contraseña incorrecta");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json());
        try {
          sessionStorage.setItem("guestbill.admin", useToken);
        } catch {
          /* ignore */
        }
        const e = await fetch("/api/admin/evals", { headers: headers(useToken) });
        if (e.ok) setEvals(await e.json());
      } catch (e) {
        setErr((e as Error).message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [days, headers, token, lang],
  );

  // Al entrar: si la contraseña ya se usó en esta pestaña, carga directamente.
  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem("guestbill.admin") ?? "";
    } catch {
      /* ignore */
    }
    if (saved) {
      setToken(saved);
      void load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar el periodo recarga si ya hay datos.
  useEffect(() => {
    if (data) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const openSession = async (id: string) => {
    const r = await fetch(`/api/admin/metrics?session=${encodeURIComponent(id)}`, { headers: headers() });
    if (r.ok) setSession({ id, events: (await r.json()).events });
  };

  const exportCsv = async () => {
    const r = await fetch(`/api/admin/export?days=${days}`, { headers: headers() });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-events-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const m = data?.metrics;
  // Rellena los días sin actividad para que el eje temporal sea continuo (máx. 30 barras).
  const daily = (() => {
    if (!m) return [];
    const byDate = new Map(m.daily.map((d) => [d.date, d]));
    const n = Math.min(days, 30);
    return Array.from({ length: n }, (_, i) => {
      const date = new Date(Date.now() - (n - 1 - i) * 86400_000).toISOString().slice(0, 10);
      return byDate.get(date) ?? { date, sessions: 0, turns: 0 };
    });
  })();
  const maxDaily = Math.max(1, ...daily.map((d) => d.sessions));
  const intents = m ? Object.entries(m.intents).sort((a, b) => b[1].sessions - a[1].sessions) : [];
  const maxIntent = Math.max(1, ...intents.map(([, v]) => v.sessions));

  return (
    <>
      <header className="site-header">
        <div className="wrap row-between">
          <Link href="/" style={{ textDecoration: "none" }}><Logo /></Link>
          <div className="row">
            <LangToggle />
            <Link className="btn sm" href="/">{L("Volver a la web", "Back to site")}</Link>
          </div>
        </div>
      </header>
      <main className="admin wrap">
        <div className="row-between" style={{ flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2rem" }}>{L("Monitorización del agente", "Agent monitoring")}</h1>
            {data && (
              <p className="small muted">
                {L("Almacenamiento", "Storage")}: <b>{data.storage}</b> · {L("Modo", "Mode")}: <b>{data.agentMode}</b> · {L("Modelo", "Model")}: <b>{data.model}</b> · {data.eventCount} {L("eventos", "events")}
              </p>
            )}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <input type="password" placeholder={L("Contraseña", "Password")} value={token} onChange={(e) => setToken(e.target.value)} aria-label={L("Contraseña", "Password")} className="field" style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }} />
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={L("Periodo", "Period")} style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
              {[1, 7, 30, 90].map((d) => (
                <option key={d} value={d}>{d} {L("días", "days")}</option>
              ))}
            </select>
            <button className="btn primary sm" type="submit" disabled={loading}>{loading ? "…" : L("Actualizar", "Refresh")}</button>
            {data && <button className="btn sm" type="button" onClick={exportCsv}>CSV</button>}
          </form>
        </div>
        {err && <p className="notice">{err}</p>}

        <section className="panel how" aria-labelledby="how-title">
          <h2 id="how-title" style={{ fontSize: "1.3rem" }}>{t.quality.title}</h2>
          <p className="muted">{t.quality.sub}</p>
          <div className="grid-4" style={{ margin: "14px 0" }}>
            {t.quality.kpis.map((k) => (
              <article key={k.t} className="card kpi-card">
                <h3>{k.t}</h3>
                <p>{k.d}</p>
              </article>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>{t.quality.evals}</p>
        </section>

        {m && (
          <>
            <div className="kpis">
              <Stat label={L("Sesiones", "Sessions")} value={m.totals.sessions} sub={`${m.totals.turns} ${L("turnos", "turns")} · ${m.totals.voiceShare}% ${L("voz", "voice")}`} />
              <Stat label={L("Resolución declarada", "Self-reported resolution")} value={`${m.resolution.selfReportedRate}%`} sub={`${m.resolution.ratedSessions} ${L("sesiones valoradas", "rated sessions")}`} />
              <Stat label={L("Contención (sin humano)", "Containment (no human)")} value={`${m.resolution.containmentRate}%`} sub={`${m.resolution.escalationRate}% ${L("escaladas", "escalated")} · ${m.resolution.highPriorityTickets} ${L("prioridad alta", "high priority")}`} />
              <Stat label={L("Primer token p50 / p95", "First token p50 / p95")} value={ms(m.latency.ttftP50)} sub={`p95 ${ms(m.latency.ttftP95)} · ${L("turno completo", "full turn")} p50 ${ms(m.latency.totalP50)}`} />
              <Stat label={L("Primer audio p50", "First audio p50")} value={ms(m.latency.firstAudioP50)} sub={`${L("corte por barge-in", "barge-in cut-off")} p50 ${ms(m.latency.bargeInStopP50)} · ${m.totals.bargeIns} barge-ins`} />
              <Stat label={L("Calidad por turno", "Per-turn quality")} value={m.quality.avgTurnScore ?? "—"} sub={`/100 · CSAT ${m.quality.csat ?? "—"}/5`} />
              <Stat label={L("Errores", "Errors")} value={m.totals.errors} sub={`${m.totals.toolCalls} ${L("llamadas a herramientas", "tool calls")} · ${m.totals.simulatorRuns} ${L("simulaciones", "simulations")}`} />
            </div>

            <div className="panels">
              <section className="panel">
                <h3>{L("Sesiones por día", "Sessions per day")}</h3>
                {m.daily.length ? (
                  <>
                    <div className="bars" role="img" aria-label={L("Sesiones por día", "Sessions per day")}>
                      {daily.map((d) => (
                        <div key={d.date} className="b" tabIndex={0} style={{ height: `${(d.sessions / maxDaily) * 100}%` }}>
                          <span className="tip">{d.date}: {d.sessions} {L("sesiones", "sessions")}, {d.turns} {L("turnos", "turns")}</span>
                        </div>
                      ))}
                    </div>
                    <div className="axis"><span>{daily[0].date}</span><span>{L("máx.", "max")} {maxDaily}</span><span>{daily[daily.length - 1].date}</span></div>
                  </>
                ) : (
                  <p className="muted small">{L("Sin datos todavía. Habla con el agente en la web.", "No data yet. Talk to the agent on the site.")}</p>
                )}
              </section>

              <section className="panel">
                <h3>{L("Intenciones: volumen y escalado", "Intents: volume and escalation")}</h3>
                {intents.map(([k, v]) => (
                  <div className="hbar" key={k} title={`${v.sessions} ${L("sesiones", "sessions")} · ${v.escalated} ${L("escaladas", "escalated")} · ${v.resolved}/${v.rated} ${L("resueltas", "resolved")}`}>
                    <span>{INTENT_LABEL[k]?.[lang === "en" ? 1 : 0] ?? k}</span>
                    <div className="track" style={{ width: `${(v.sessions / maxIntent) * 100}%` }} />
                    <span className="v">{v.sessions}{v.escalated ? ` · ${v.escalated}↑` : ""}</span>
                  </div>
                ))}
                {!intents.length && <p className="muted small">—</p>}
                <p className="small muted">↑ = {L("sesiones escaladas", "escalated sessions")}</p>
              </section>

              <section className="panel">
                <h3>{L("Alertas de ergonomía de voz", "Voice ergonomics flags")}</h3>
                <table>
                  <thead><tr><th>{L("Regla", "Rule")}</th><th className="num-cell">{L("Turnos", "Turns")}</th></tr></thead>
                  <tbody>
                    {Object.entries(m.quality.flags).length ? (
                      Object.entries(m.quality.flags).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                        <tr key={f}><td>{flagLabel(f, lang)}</td><td className="num-cell">{n}</td></tr>
                      ))
                    ) : (
                      <tr><td colSpan={2} className="muted">{L("Ningún turno incumple las reglas.", "No turn breaks the rules.")}</td></tr>
                    )}
                  </tbody>
                </table>
              </section>

              <section className="panel">
                <h3>{L("Suite de evaluación (último informe)", "Evaluation suite (latest report)")}</h3>
                {evals?.summary ? (
                  <>
                    <p className="small muted">{evals.generatedAt?.slice(0, 16).replace("T", " ")} · {evals.model} · {evals.mode}</p>
                    <div className="kpis" style={{ margin: "8px 0" }}>
                      <Stat label={L("Casos superados", "Cases passed")} value={`${evals.summary.passed}/${evals.summary.cases}`} />
                      {Object.entries(evals.summary.avg).map(([k, v]) => (
                        <Stat key={k} label={dimLabel(k, lang)} value={`${v}/5`} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="small muted">{L("Ejecuta npm run eval para generar evals/results/latest.json.", "Run npm run eval to generate evals/results/latest.json.")}</p>
                )}
              </section>
            </div>

            <section className="panel" style={{ marginTop: 16 }}>
              <h3>{L("Sesiones recientes", "Recent sessions")}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{L("Inicio", "Start")}</th><th>{L("Canal", "Channel")}</th><th>{L("Intenciones", "Intents")}</th>
                      <th className="num-cell">{L("Turnos", "Turns")}</th><th className="num-cell">TTFT</th><th className="num-cell">{L("Calidad", "Quality")}</th>
                      <th>{L("Resultado", "Outcome")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.sessions.map((s) => (
                      <tr key={s.sessionId} className="clickable" onClick={() => openSession(s.sessionId)}>
                        <td>{new Date(s.startedAt).toLocaleString(lang === "en" ? "en-GB" : "es-ES", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td>{s.channel}{s.bargeIns ? ` · ${s.bargeIns} barge-in` : ""}</td>
                        <td>{s.intents.map((i) => INTENT_LABEL[i]?.[lang === "en" ? 1 : 0] ?? i).join(", ")}</td>
                        <td className="num-cell">{s.turns}</td>
                        <td className="num-cell">{ms(s.avgTtft)}</td>
                        <td className="num-cell">{s.avgQuality ?? "—"}</td>
                        <td>
                          {s.escalated && <span className="badge warn">{L("Escalada", "Escalated")}</span>}{" "}
                          {s.resolved === true && <span className="badge good">{L("Resuelta", "Resolved")}</span>}
                          {s.resolved === false && <span className="badge bad">{L("No resuelta", "Unresolved")}</span>}
                          {s.rating !== null && <span className="small muted"> {s.rating}★</span>}
                          {s.errors > 0 && <span className="badge bad">{s.errors} err</span>}
                        </td>
                      </tr>
                    ))}
                    {!m.sessions.length && <tr><td colSpan={7} className="muted">—</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {session && (
              <section className="panel" style={{ marginTop: 16 }}>
                <div className="row-between">
                  <h3>{L("Transcripción (enmascarada)", "Transcript (masked)")} · <code>{session.id.slice(0, 8)}</code></h3>
                  <button className="link" onClick={() => setSession(null)}>{L("Cerrar", "Close")}</button>
                </div>
                <div className="transcript">
                  {session.events.map((e) => (
                    <div key={e.id} className="ev">
                      <div className="meta">
                        {e.ts.slice(11, 19)} · {e.type}
                        {e.type === "assistant_turn" && ` · TTFT ${ms(e.data.ttftMs as number)} · ${L("calidad", "quality")} ${(e.data.quality as { score?: number })?.score ?? "—"} · ${(e.data.tools as string[] | undefined)?.join(", ") || ""}`}
                        {e.type === "escalation" && ` · ${e.data.ticketId} · ${e.data.priority}`}
                        {e.type === "barge_in" && ` · stop ${e.data.stopMs} ms`}
                        {e.type === "rating" && ` · ${e.data.resolved ? "✓" : "✕"} ${e.data.score ?? ""}`}
                      </div>
                      {typeof e.data.text === "string" && <div>{e.data.text}</div>}
                      {e.type === "user_turn" && typeof e.data.text !== "string" && <div className="muted small">({L("texto no guardado: solo métricas", "text not stored: metrics only")})</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function flagLabel(f: string, lang: string) {
  const es: Record<string, string> = {
    more_than_3_sentences: "Más de 3 frases",
    long_turn: "Turno de más de 60 palabras",
    multiple_questions: "Más de una pregunta",
    markdown_in_voice: "Formato visual en voz",
    long_list: "Lista de más de 3 puntos",
    empty: "Respuesta vacía",
  };
  const en: Record<string, string> = {
    more_than_3_sentences: "More than 3 sentences",
    long_turn: "Turn over 60 words",
    multiple_questions: "More than one question",
    markdown_in_voice: "Visual formatting in voice",
    long_list: "List over 3 items",
    empty: "Empty answer",
  };
  return (lang === "en" ? en : es)[f] ?? f;
}

function dimLabel(k: string, lang: string) {
  const map: Record<string, [string, string]> = {
    accuracy: ["Precisión", "Accuracy"],
    voice: ["Ergonomía de voz", "Voice ergonomics"],
    error_handling: ["Gestión del error", "Error handling"],
    latency: ["Latencia", "Latency"],
  };
  return map[k]?.[lang === "en" ? 1 : 0] ?? k;
}
