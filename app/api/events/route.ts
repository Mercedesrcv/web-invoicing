import { clientKey, rateLimited } from "@/lib/ratelimit";
import { logEvents, type NewEvent } from "@/lib/store";
import type { EventType } from "@/lib/store/types";

export const runtime = "nodejs";

/** Eventos que el navegador puede enviar (los turnos los registra el servidor). */
const CLIENT_TYPES: EventType[] = ["session_start", "consent", "barge_in", "tts_first_audio", "stt_error", "rating", "simulator_run", "page_view", "error"];
const TEXT_KEYS = ["text", "comment", "transcript"];

export async function POST(req: Request) {
  if (rateLimited("ev:" + clientKey(req), 120)) return Response.json({ error: "rate_limited" }, { status: 429 });
  let body: { sessionId?: string; consent?: string; events?: Array<{ type: EventType; channel?: "voice" | "text" | "web"; lang?: string; data?: Record<string, unknown> }> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const sessionId = String(body.sessionId || "");
  if (!/^[\w-]{8,64}$/.test(sessionId)) return Response.json({ error: "invalid_session" }, { status: 400 });
  const keepText = body.consent === "full";

  const events: NewEvent[] = (body.events ?? [])
    .slice(0, 20)
    .filter((e) => CLIENT_TYPES.includes(e.type))
    .map((e) => {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e.data ?? {}).slice(0, 20)) {
        if (TEXT_KEYS.includes(k) && !keepText) continue;
        data[k] = typeof v === "string" ? v.slice(0, 500) : v;
      }
      return { sessionId, type: e.type, channel: e.channel, lang: e.lang === "en" ? "en" : "es", data };
    });
  await logEvents(events);
  return Response.json({ ok: true, stored: events.length });
}
