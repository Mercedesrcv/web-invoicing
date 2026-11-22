export type EventType =
  | "session_start"
  | "consent"
  | "user_turn"
  | "assistant_turn"
  | "tool_call"
  | "escalation"
  | "ticket_created"
  | "barge_in"
  | "tts_first_audio"
  | "stt_error"
  | "rating"
  | "error"
  | "simulator_run"
  | "page_view";

export type Channel = "voice" | "text" | "web";

export interface AgentEvent {
  id: string;
  ts: string; // ISO
  sessionId: string;
  type: EventType;
  channel?: Channel;
  lang?: string;
  /** Datos del evento. Siempre pasan por maskDeep antes de guardarse. */
  data: Record<string, unknown>;
}

export interface EventQuery {
  since?: string;
  sessionId?: string;
  limit?: number;
}

export interface EventStore {
  readonly kind: string;
  append(events: AgentEvent[]): Promise<void>;
  list(q?: EventQuery): Promise<AgentEvent[]>;
}
