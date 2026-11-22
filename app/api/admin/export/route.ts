import { isAdmin } from "@/lib/adminAuth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exporta los eventos (ya enmascarados) en CSV o JSON para análisis externo. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") || 30)));
  const events = await getStore().list({ since: new Date(Date.now() - days * 86400_000).toISOString(), limit: 50000 });
  if (url.searchParams.get("format") === "json") return Response.json(events);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["id,ts,session_id,type,channel,lang,data", ...events.map((e) => [e.id, e.ts, e.sessionId, e.type, e.channel, e.lang, JSON.stringify(e.data)].map(esc).join(","))];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="agent-events-${days}d.csv"` },
  });
}
