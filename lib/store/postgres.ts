import postgres from "postgres";
import type { AgentEvent, EventQuery, EventStore } from "./types";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_events (
  id          TEXT PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL,
  session_id  TEXT NOT NULL,
  type        TEXT NOT NULL,
  channel     TEXT,
  lang        TEXT,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS agent_events_ts_idx ON agent_events (ts DESC);
CREATE INDEX IF NOT EXISTS agent_events_session_idx ON agent_events (session_id);
CREATE INDEX IF NOT EXISTS agent_events_type_idx ON agent_events (type);
`;

type Row = { id: string; ts: Date; session_id: string; type: string; channel: string | null; lang: string | null; data: Record<string, unknown> };

/** Postgres (Vercel Postgres/Neon, Supabase o cualquier Postgres gestionado). */
export class PostgresStore implements EventStore {
  readonly kind = "postgres";
  private sql: postgres.Sql;
  private ready: Promise<unknown> | null = null;

  constructor(url: string) {
    this.sql = postgres(url, { max: 3, idle_timeout: 20, prepare: false, ssl: url.includes("localhost") ? false : "require" });
  }

  private init() {
    return (this.ready ??= this.sql.unsafe(SCHEMA_SQL));
  }

  async append(events: AgentEvent[]) {
    if (!events.length) return;
    await this.init();
    const rows = events.map((e) => ({
      id: e.id,
      ts: e.ts,
      session_id: e.sessionId,
      type: e.type,
      channel: e.channel ?? null,
      lang: e.lang ?? null,
      data: this.sql.json(e.data as postgres.JSONValue),
    }));
    await this.sql`INSERT INTO agent_events ${this.sql(rows)} ON CONFLICT (id) DO NOTHING`;
  }

  async list(q: EventQuery = {}) {
    await this.init();
    const since = q.since ?? "1970-01-01";
    const limit = q.limit ?? 5000;
    const rows = q.sessionId
      ? await this.sql<Row[]>`SELECT * FROM agent_events WHERE session_id = ${q.sessionId} AND ts >= ${since} ORDER BY ts DESC LIMIT ${limit}`
      : await this.sql<Row[]>`SELECT * FROM agent_events WHERE ts >= ${since} ORDER BY ts DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      ts: new Date(r.ts).toISOString(),
      sessionId: r.session_id,
      type: r.type as AgentEvent["type"],
      channel: (r.channel ?? undefined) as AgentEvent["channel"],
      lang: r.lang ?? undefined,
      data: r.data,
    }));
  }
}
