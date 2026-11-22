import Anthropic from "@anthropic-ai/sdk";
import { demoTurn } from "./demo";
import { SYSTEM_PROMPT, sessionContext } from "./prompt";
import { runTool, TOOL_DEFS } from "./tools";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface TurnOptions {
  history: ChatMsg[];
  lang: "es" | "en";
  channel: "voice" | "text";
}

export interface ToolTrace {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  isError?: boolean;
}

export type AgentChunk =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | {
      type: "done";
      text: string;
      mode: "claude" | "demo";
      model: string;
      ttftMs: number | null;
      totalMs: number;
      tools: ToolTrace[];
      escalated: boolean;
      ticketId?: string;
      priority?: string;
      stopReason?: string | null;
      usage?: { input: number; output: number; cacheRead: number };
    }
  | { type: "error"; message: string; code: string };

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high";
const MAX_TOOL_ROUNDS = 5;

/** Modelos que aceptan el parámetro server-side `fallbacks`. */
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"];

export function hasClaudeCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Normaliza el historial: alterna roles, empieza por usuario y se limita a 20 mensajes. */
export function sanitizeHistory(history: ChatMsg[]): ChatMsg[] {
  const clean = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  const merged: ChatMsg[] = [];
  for (const m of clean) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else merged.push({ ...m });
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  const tail = merged.slice(-20);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export async function* runAgentTurn(opts: TurnOptions): AsyncGenerator<AgentChunk> {
  const history = sanitizeHistory(opts.history);
  if (!history.length || history[history.length - 1].role !== "user") {
    yield { type: "error", message: "Empty conversation", code: "bad_request" };
    return;
  }
  if (!hasClaudeCredentials()) {
    yield* demoTurn(opts.lang, history);
    return;
  }

  const started = Date.now();
  let ttft: number | null = null;
  let fullText = "";
  const tools: ToolTrace[] = [];
  let escalated = false;
  let ticketId: string | undefined;
  let priority: string | undefined;
  let stopReason: string | null | undefined;
  const usage = { input: 0, output: 0, cacheRead: 0 };

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const useFallbacks = FALLBACK_MODELS.includes(MODEL) && process.env.ANTHROPIC_DISABLE_FALLBACKS !== "1";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = getClient().beta.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        // Prompt estable cacheado (herramientas + sistema); el contexto variable va detrás.
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: sessionContext(opts.lang, opts.channel) },
        ],
        tools: TOOL_DEFS.map((t) => ({ ...t, eager_input_streaming: true })),
        output_config: { effort: EFFORT },
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        messages,
      });

      let roundText = "";
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          if (ttft === null) ttft = Date.now() - started;
          // Separamos el texto de rondas distintas para que el TTS no junte frases.
          const delta = !roundText && fullText ? " " + ev.delta.text : ev.delta.text;
          roundText += ev.delta.text;
          fullText += delta;
          yield { type: "text", delta };
        }
      }
      const msg = await stream.finalMessage();
      stopReason = msg.stop_reason;
      usage.input += msg.usage.input_tokens;
      usage.output += msg.usage.output_tokens;
      usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;

      if (msg.stop_reason === "refusal") {
        const t = opts.lang === "en" ? "I can't help with that here. Shall I connect you with the support team?" : "Con eso no puedo ayudarte por aquí. ¿Quieres que te pase con el equipo de soporte?";
        fullText += (fullText ? " " : "") + t;
        yield { type: "text", delta: t };
        break;
      }
      if (msg.stop_reason !== "tool_use") break;

      const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        yield { type: "tool", name: tu.name };
        const input = tu.input && typeof tu.input === "object" ? (tu.input as Record<string, unknown>) : {};
        const out = runTool(tu.name, input);
        tools.push({ name: tu.name, input, result: out.result, isError: out.isError });
        if (out.escalated) {
          escalated = true;
          ticketId = out.ticketId;
          priority = out.priority;
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out.result), is_error: out.isError });
      }
      // Devolvemos el contenido del asistente sin tocar (incluye bloques de thinking).
      messages.push({ role: "assistant", content: msg.content });
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    let code = "unknown";
    if (err instanceof Anthropic.RateLimitError) code = "rate_limited";
    else if (err instanceof Anthropic.AuthenticationError) code = "auth";
    else if (err instanceof Anthropic.BadRequestError) code = "bad_request";
    else if (err instanceof Anthropic.APIConnectionError) code = "connection";
    else if (err instanceof Anthropic.APIError) code = `api_${err.status}`;
    console.error("[agent] error", code, err);
    yield {
      type: "error",
      code,
      message:
        opts.lang === "en"
          ? "Sorry, I'm having a technical problem. You can try again or I can create a ticket for the team."
          : "Perdona, estoy teniendo un problema técnico. Puedes intentarlo de nuevo o dejo un ticket al equipo.",
    };
    return;
  }

  yield {
    type: "done",
    text: fullText.trim(),
    mode: "claude",
    model: MODEL,
    ttftMs: ttft,
    totalMs: Date.now() - started,
    tools,
    escalated,
    ticketId,
    priority,
    stopReason,
    usage,
  };
}
