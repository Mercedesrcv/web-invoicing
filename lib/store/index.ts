import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { maskDeep } from "../pii";
import { FileStore } from "./file";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { AgentEvent, EventStore } from "./types";

export type { AgentEvent, EventStore } from "./types";

let store: EventStore | null = null;

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "";
}

export function getStore(): EventStore {
  if (store) return store;
  const forced = (process.env.STORAGE || "").toLowerCase();
  const url = dbUrl();
  if (forced === "postgres" || (!forced && url)) {
    if (!url) throw new Error("STORAGE=postgres pero no hay DATABASE_URL/POSTGRES_URL");
    store = new PostgresStore(url);
  } else if (forced === "memory") {
    store = new MemoryStore();
  } else {
    // En Vercel el sistema de ficheros del proyecto es de solo lectura: usamos /tmp (efímero).
    const file = process.env.VERCEL
      ? path.join(os.tmpdir(), "folia-events.jsonl")
      : process.env.LOG_FILE_PATH || ".data/events.jsonl";
    store = new FileStore(file);
  }
  return store;
}

export type NewEvent = Omit<AgentEvent, "id" | "ts"> & { ts?: string };

/** Punto único de registro: enmascara PII y nunca rompe la conversación si falla. */
export async function logEvents(events: NewEvent[]): Promise<void> {
  const prepared: AgentEvent[] = events.map((e) => ({
    ...e,
    id: randomUUID(),
    ts: e.ts ?? new Date().toISOString(),
    data: maskDeep(e.data ?? {}),
  }));
  try {
    await getStore().append(prepared);
  } catch (err) {
    console.error("[monitoring] no se pudo guardar el evento", err);
  }
}
