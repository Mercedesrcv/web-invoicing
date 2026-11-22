import { isAdmin } from "@/lib/adminAuth";
import { computeMetrics } from "@/lib/metrics";
import { getStore } from "@/lib/store";
import { hasClaudeCredentials, MODEL } from "@/lib/agent/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const store = getStore();
  const session = url.searchParams.get("session");
  if (session) {
    const events = await store.list({ sessionId: session, limit: 500 });
    return Response.json({ events: events.reverse() });
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const events = await store.list({ since, limit: 20000 });
  return Response.json({
    storage: store.kind,
    agentMode: hasClaudeCredentials() ? "claude" : "demo",
    model: hasClaudeCredentials() ? MODEL : "demo-script",
    days,
    eventCount: events.length,
    metrics: computeMetrics(events),
  });
}
