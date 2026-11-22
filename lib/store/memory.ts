import type { AgentEvent, EventQuery, EventStore } from "./types";

const g = globalThis as unknown as { __guestbillEvents?: AgentEvent[] };

export class MemoryStore implements EventStore {
  readonly kind = "memory";
  private get buf() {
    return (g.__guestbillEvents ??= []);
  }
  async append(events: AgentEvent[]) {
    this.buf.push(...events);
    if (this.buf.length > 20000) this.buf.splice(0, this.buf.length - 20000);
  }
  async list(q: EventQuery = {}) {
    return filter(this.buf, q);
  }
}

export function filter(all: AgentEvent[], q: EventQuery): AgentEvent[] {
  let out = all;
  if (q.since) out = out.filter((e) => e.ts >= q.since!);
  if (q.sessionId) out = out.filter((e) => e.sessionId === q.sessionId);
  out = [...out].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return q.limit ? out.slice(0, q.limit) : out;
}
