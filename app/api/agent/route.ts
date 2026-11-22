import { assessTurn } from "@/lib/agent/quality";
import { classifyIntent } from "@/lib/agent/intents";
import { runAgentTurn, type ChatMsg } from "@/lib/agent/core";
import { clientKey, rateLimited } from "@/lib/ratelimit";
import { logEvents, type NewEvent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  sessionId?: string;
  lang?: "es" | "en";
  channel?: "voice" | "text";
  consent?: "full" | "metrics_only";
  messages?: ChatMsg[];
}

/**
 * Turno del agente. Responde con NDJSON en streaming:
 *   {"type":"text","delta":"..."} ... {"type":"tool","name":"..."} ... {"type":"done",...}
 * Al terminar registra los eventos de monitorización (enmascarados).
 */
export async function POST(req: Request) {
  if (rateLimited(clientKey(req))) return Response.json({ error: "rate_limited" }, { status: 429 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const sessionId = String(body.sessionId || "").slice(0, 64);
  if (!/^[\w-]{8,64}$/.test(sessionId)) return Response.json({ error: "invalid_session" }, { status: 400 });
  const lang = body.lang === "en" ? "en" : "es";
  const channel = body.channel === "voice" ? "voice" : "text";
  const keepText = body.consent === "full";
  const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const turnIndex = messages.filter((m) => m.role === "user").length;
  const intent = classifyIntent(userText);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const events: NewEvent[] = [
        { sessionId, type: "user_turn", channel, lang, data: { turn: turnIndex, intent, chars: userText.length, ...(keepText ? { text: userText } : {}) } },
      ];
      try {
        for await (const chunk of runAgentTurn({ history: messages, lang, channel })) {
          if (chunk.type === "done") {
            const quality = assessTurn(chunk.text);
            send({ ...chunk, quality, tools: chunk.tools.map((t) => t.name) });
            events.push({
              sessionId,
              type: "assistant_turn",
              channel,
              lang,
              data: {
                turn: turnIndex,
                intent,
                mode: chunk.mode,
                model: chunk.model,
                ttftMs: chunk.ttftMs,
                totalMs: chunk.totalMs,
                tools: chunk.tools.map((t) => t.name),
                escalated: chunk.escalated,
                stopReason: chunk.stopReason,
                usage: chunk.usage,
                quality,
                ...(keepText ? { text: chunk.text } : {}),
              },
            });
            for (const t of chunk.tools)
              events.push({ sessionId, type: "tool_call", channel, lang, data: { name: t.name, isError: !!t.isError, ...(keepText ? { input: t.input, result: t.result } : {}) } });
            if (chunk.escalated)
              events.push({ sessionId, type: "escalation", channel, lang, data: { ticketId: chunk.ticketId, priority: chunk.priority, intent, turn: turnIndex } });
          } else if (chunk.type === "error") {
            send(chunk);
            events.push({ sessionId, type: "error", channel, lang, data: { code: chunk.code, where: "agent" } });
          } else {
            send(chunk);
          }
        }
      } catch (err) {
        send({ type: "error", code: "server", message: lang === "en" ? "Unexpected error." : "Error inesperado." });
        events.push({ sessionId, type: "error", channel, lang, data: { code: "server", where: "route", message: String(err).slice(0, 200) } });
      } finally {
        controller.close();
        await logEvents(events);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
