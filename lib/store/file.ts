import { promises as fs } from "node:fs";
import path from "node:path";
import { filter } from "./memory";
import type { AgentEvent, EventQuery, EventStore } from "./types";

/** Almacenamiento JSONL para desarrollo local. Una línea = un evento. */
export class FileStore implements EventStore {
  readonly kind = "file";
  constructor(private file: string) {}

  async append(events: AgentEvent[]) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }

  async list(q: EventQuery = {}) {
    let raw = "";
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    const all = raw
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as AgentEvent];
        } catch {
          return [];
        }
      });
    return filter(all, q);
  }
}
