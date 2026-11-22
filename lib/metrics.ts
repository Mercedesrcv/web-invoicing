import type { AgentEvent } from "./store/types";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  lastAt: string;
  channel: string;
  lang: string;
  turns: number;
  intents: string[];
  escalated: boolean;
  resolved: boolean | null;
  rating: number | null;
  avgQuality: number | null;
  avgTtft: number | null;
  bargeIns: number;
  errors: number;
}

export function summarizeSessions(events: AgentEvent[]): SessionSummary[] {
  const by = new Map<string, AgentEvent[]>();
  for (const e of events) {
    if (!by.has(e.sessionId)) by.set(e.sessionId, []);
    by.get(e.sessionId)!.push(e);
  }
  const out: SessionSummary[] = [];
  for (const [sessionId, evs] of by) {
    evs.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const turns = evs.filter((e) => e.type === "assistant_turn");
    if (!turns.length && !evs.some((e) => e.type === "user_turn")) continue;
    const rating = [...evs].reverse().find((e) => e.type === "rating");
    const intents = [...new Set(evs.filter((e) => e.type === "user_turn").map((e) => String(e.data.intent ?? "other")))];
    out.push({
      sessionId,
      startedAt: evs[0].ts,
      lastAt: evs[evs.length - 1].ts,
      channel: turns.some((t) => t.channel === "voice") ? "voice" : "text",
      lang: evs.find((e) => e.lang)?.lang ?? "es",
      turns: turns.length,
      intents,
      escalated: evs.some((e) => e.type === "escalation"),
      resolved: rating ? Boolean(rating.data.resolved) : null,
      rating: rating && typeof rating.data.score === "number" ? (rating.data.score as number) : null,
      avgQuality: avg(turns.map((t) => Number((t.data.quality as { score?: number })?.score ?? NaN)).filter((n) => !Number.isNaN(n))),
      avgTtft: avg(turns.map((t) => Number(t.data.ttftMs)).filter((n) => n > 0)),
      bargeIns: evs.filter((e) => e.type === "barge_in").length,
      errors: evs.filter((e) => e.type === "error").length,
    });
  }
  return out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export function computeMetrics(events: AgentEvent[]) {
  const sessions = summarizeSessions(events);
  const turns = events.filter((e) => e.type === "assistant_turn");
  const ttft = turns.map((t) => Number(t.data.ttftMs)).filter((n) => n > 0);
  const total = turns.map((t) => Number(t.data.totalMs)).filter((n) => n > 0);
  const firstAudio = events.filter((e) => e.type === "tts_first_audio").map((e) => Number(e.data.ms)).filter((n) => n > 0);
  const bargeStop = events.filter((e) => e.type === "barge_in").map((e) => Number(e.data.stopMs)).filter((n) => n >= 0);
  const quality = turns.map((t) => Number((t.data.quality as { score?: number })?.score)).filter((n) => !Number.isNaN(n));
  const ratings = sessions.map((s) => s.rating).filter((n): n is number => n !== null);
  const rated = sessions.filter((s) => s.resolved !== null);
  const escalated = sessions.filter((s) => s.escalated);
  const flags: Record<string, number> = {};
  for (const t of turns) for (const f of ((t.data.quality as { flags?: string[] })?.flags ?? [])) flags[f] = (flags[f] ?? 0) + 1;

  const intents: Record<string, { sessions: number; escalated: number; resolved: number; rated: number }> = {};
  for (const s of sessions)
    for (const i of s.intents.length ? s.intents : ["other"]) {
      intents[i] ??= { sessions: 0, escalated: 0, resolved: 0, rated: 0 };
      intents[i].sessions++;
      if (s.escalated) intents[i].escalated++;
      if (s.resolved !== null) {
        intents[i].rated++;
        if (s.resolved) intents[i].resolved++;
      }
    }

  const daily: Record<string, { sessions: number; turns: number }> = {};
  for (const s of sessions) {
    const d = s.startedAt.slice(0, 10);
    daily[d] ??= { sessions: 0, turns: 0 };
    daily[d].sessions++;
    daily[d].turns += s.turns;
  }

  return {
    totals: {
      sessions: sessions.length,
      turns: turns.length,
      voiceShare: pct(sessions.filter((s) => s.channel === "voice").length, sessions.length),
      toolCalls: events.filter((e) => e.type === "tool_call").length,
      errors: events.filter((e) => e.type === "error").length,
      bargeIns: events.filter((e) => e.type === "barge_in").length,
      simulatorRuns: events.filter((e) => e.type === "simulator_run").length,
    },
    resolution: {
      /** % de sesiones con valoración que el usuario marcó como resueltas. */
      selfReportedRate: pct(rated.filter((s) => s.resolved).length, rated.length),
      ratedSessions: rated.length,
      /** % de sesiones sin escalado a humano (contención). */
      containmentRate: pct(sessions.length - escalated.length, sessions.length),
      escalationRate: pct(escalated.length, sessions.length),
      highPriorityTickets: events.filter((e) => e.type === "escalation" && e.data.priority === "high").length,
    },
    latency: {
      ttftP50: percentile(ttft, 50),
      ttftP95: percentile(ttft, 95),
      totalP50: percentile(total, 50),
      totalP95: percentile(total, 95),
      firstAudioP50: percentile(firstAudio, 50),
      bargeInStopP50: percentile(bargeStop, 50),
    },
    quality: {
      avgTurnScore: avg(quality),
      csat: avg(ratings),
      flags,
    },
    intents,
    daily: Object.entries(daily)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, ...v })),
    sessions: sessions.slice(0, 50),
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;
