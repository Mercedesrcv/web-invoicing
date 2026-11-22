"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeakable } from "@/lib/agent/quality";
import { getConsent, getSessionId, newSessionId, setConsent, track, type Consent } from "@/lib/telemetry";
import { useLang } from "./LangProvider";

/* Tipos mínimos de Web Speech API (no todos los navegadores los exponen en lib.dom). */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
}
type SRCtor = new () => SR;

interface Msg {
  role: "user" | "assistant";
  content: string;
  interrupted?: boolean;
  ticketId?: string;
  error?: boolean;
}

type Status = "idle" | "listening" | "thinking" | "speaking";

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? [];

export default function VoiceAgent() {
  const { t, lang } = useLang();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [voiceOn, setVoiceOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [toolNow, setToolNow] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [consent, setConsentState] = useState<Consent | null>(null);
  const [pending, setPending] = useState<{ text: string; channel: "voice" | "text" } | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  const [input, setInput] = useState("");
  const [resolved, setResolved] = useState<boolean | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);

  const sessionRef = useRef<string>("");
  const startedRef = useRef(false);
  const msgsRef = useRef<Msg[]>([]);
  const statusRef = useRef<Status>("idle");
  const recRef = useRef<SR | null>(null);
  const voiceOnRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const ttsBufRef = useRef("");
  const spokenRef = useRef("");
  const turnStartRef = useRef(0);
  const firstAudioRef = useRef(false);
  const speechStartRef = useRef<number | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentRef = useRef<string | null>(null);
  const heldRef = useRef<string[] | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bargeT0Ref = useRef<number | null>(null);
  const falseAlarmsRef = useRef(0);
  const lastSpeechEndRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const setStat = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };
  const updateMsgs = (fn: (m: Msg[]) => Msg[]) => {
    msgsRef.current = fn(msgsRef.current);
    setMsgs(msgsRef.current);
  };

  useEffect(() => {
    sessionRef.current = getSessionId();
    setConsentState(getConsent());
    const has = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && "speechSynthesis" in window;
    setSupported(has);
    if (!has) setMode("text");
    return () => {
      voiceOnRef.current = false;
      recRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, interim, toolNow]);

  /* ---------------- TTS ---------------- */
  const pickVoice = useCallback(() => {
    const vs = window.speechSynthesis.getVoices();
    const want = langRef.current === "en" ? "en" : "es";
    return vs.find((v) => v.lang.toLowerCase().startsWith(want === "es" ? "es-es" : "en-gb")) ?? vs.find((v) => v.lang.toLowerCase().startsWith(want)) ?? null;
  }, []);

  const afterSpeech = () => {
    if (streamingRef.current) setStat("thinking");
    else setStat(voiceOnRef.current ? "listening" : "idle");
  };

  const speakNext = useCallback(() => {
    if (heldRef.current) return; // pausado por una posible interrupción
    const next = queueRef.current.shift();
    if (!next) {
      speakingRef.current = false;
      currentRef.current = null;
      lastSpeechEndRef.current = performance.now();
      afterSpeech();
      return;
    }
    speakingRef.current = true;
    currentRef.current = next;
    setStat("speaking");
    const u = new SpeechSynthesisUtterance(toSpeakable(next));
    u.lang = langRef.current === "en" ? "en-GB" : "es-ES";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.onstart = () => {
      spokenRef.current += " " + next;
      if (!firstAudioRef.current && turnStartRef.current) {
        firstAudioRef.current = true;
        track({ type: "tts_first_audio", channel: "voice", lang: langRef.current, data: { ms: Math.round(performance.now() - turnStartRef.current) } }, sessionRef.current);
      }
    };
    // Solo avanza si este enunciado sigue siendo el actual (cancel() también dispara onend/onerror).
    const done = () => {
      if (utterRef.current !== u) return;
      utterRef.current = null;
      speakNext();
    };
    u.onend = done;
    u.onerror = done;
    // Guardamos la referencia: Chrome puede recolectar el enunciado y cortar la locución a mitad.
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }, [pickVoice]);

  const enqueueSpeech = useCallback(
    (s: string) => {
      if (!s.trim()) return;
      if (heldRef.current) {
        heldRef.current.push(s.trim());
        return;
      }
      queueRef.current.push(s.trim());
      if (!speakingRef.current) speakNext();
    },
    [speakNext],
  );

  /** Habla frase a frase según llega el streaming: baja la latencia percibida. */
  const feedTts = (delta: string, flush = false) => {
    ttsBufRef.current += delta;
    const re = /^([\s\S]*?[.!?…])(\s+)/;
    let m: RegExpMatchArray | null;
    while ((m = ttsBufRef.current.match(re))) {
      enqueueSpeech(m[1]);
      ttsBufRef.current = ttsBufRef.current.slice(m[0].length);
    }
    if (flush) {
      enqueueSpeech(ttsBufRef.current);
      ttsBufRef.current = "";
    }
  };

  const stopSpeaking = () => {
    utterRef.current = null;
    currentRef.current = null;
    queueRef.current = [];
    heldRef.current = null;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
  };

  /* ---------------- Barge-in ----------------
   * El micrófono también oye al propio agente (eco). Para no cortar la respuesta
   * por error, la interrupción es en dos pasos:
   *  1. Pausa: si se oyen 3+ palabras que no son eco, se para la voz y se guarda
   *     lo que faltaba por decir (sin abortar la respuesta del servidor).
   *  2. Confirmación: si llega una frase final del usuario, se descarta lo pendiente
   *     y se responde a la nueva pregunta. Si no llega en 2,5 s, era ruido o eco:
   *     se retoma la frase interrumpida desde el principio.
   */
  const isEcho = (heard: string, strict = false) => {
    const h = words(heard);
    if (!h.length) return true;
    const ref = spokenRef.current + " " + (currentRef.current ?? "") + " " + (msgsRef.current[msgsRef.current.length - 1]?.content ?? "");
    const spoken = new Set(words(ref));
    const overlap = h.filter((w) => spoken.has(w)).length / h.length;
    return overlap >= (strict ? 0.35 : 0.5);
  };

  const pauseForBargeIn = () => {
    if (heldRef.current) return;
    bargeT0Ref.current = performance.now();
    heldRef.current = [...(currentRef.current ? [currentRef.current] : []), ...queueRef.current];
    queueRef.current = [];
    utterRef.current = null;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    currentRef.current = null;
    setStat("listening");
    armHoldTimer();
  };

  const armHoldTimer = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(resumeAfterFalseAlarm, 2500);
  };

  const resumeAfterFalseAlarm = () => {
    const held = heldRef.current;
    if (!held) return;
    heldRef.current = null;
    falseAlarmsRef.current += 1;
    track({ type: "barge_in", channel: "voice", lang: langRef.current, data: { confirmed: false, falseAlarm: true } }, sessionRef.current);
    queueRef.current = [...held, ...queueRef.current];
    if (queueRef.current.length) speakNext();
    else afterSpeech();
  };

  const confirmBargeIn = (heard: string) => {
    const t0 = bargeT0Ref.current ?? performance.now();
    const wasStreaming = streamingRef.current;
    stopSpeaking();
    ttsBufRef.current = "";
    const stopMs = Math.round(performance.now() - t0);
    const detectMs = speechStartRef.current ? Math.max(0, Math.round(t0 - speechStartRef.current)) : null;
    bargeT0Ref.current = null;
    updateMsgs((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last?.role === "assistant") c[c.length - 1] = { ...last, interrupted: true };
      return c;
    });
    track({ type: "barge_in", channel: "voice", lang: langRef.current, data: { confirmed: true, stopMs, detectMs, duringStream: wasStreaming, words: words(heard).length } }, sessionRef.current);
  };

  /* ---------------- Turno ---------------- */
  const sendTurn = useCallback(
    async (text: string, channel: "voice" | "text") => {
      const c = getConsent();
      if (!c) {
        setPending({ text, channel });
        setAskConsent(true);
        return;
      }
      if (!startedRef.current) {
        startedRef.current = true;
        track([{ type: "session_start", channel, lang: langRef.current, data: { voiceSupported: supported } }, { type: "consent", channel, lang: langRef.current, data: { level: c } }], sessionRef.current);
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // Una pregunta nueva sustituye a lo que quedara por decir de la anterior.
      if (typeof window !== "undefined" && "speechSynthesis" in window) stopSpeaking();
      falseAlarmsRef.current = 0;
      firstAudioRef.current = false;
      spokenRef.current = "";
      ttsBufRef.current = "";
      turnStartRef.current = performance.now();

      const history = [...msgsRef.current, { role: "user" as const, content: text }];
      updateMsgs(() => [...history, { role: "assistant", content: "" }]);
      setStat("thinking");
      streamingRef.current = true;
      setToolNow(null);

      const payload = history.map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.interrupted ? `${m.content} [${langRef.current === "en" ? "interrupted by the user" : "interrumpido por el usuario"}]` : m.content,
      }));

      const appendText = (delta: string) =>
        updateMsgs((m) => {
          const cp = [...m];
          const last = cp[cp.length - 1];
          cp[cp.length - 1] = { ...last, content: last.content + delta };
          return cp;
        });

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current, lang: langRef.current, channel, consent: c, messages: payload }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "text") {
              setToolNow(null);
              appendText(ev.delta);
              if (channel === "voice") feedTts(ev.delta);
            } else if (ev.type === "tool") {
              setToolNow(ev.name);
            } else if (ev.type === "done") {
              setDemo(ev.mode === "demo");
              if (ev.escalated)
                updateMsgs((m) => {
                  const cp = [...m];
                  cp[cp.length - 1] = { ...cp[cp.length - 1], ticketId: ev.ticketId ?? "—" };
                  return cp;
                });
            } else if (ev.type === "error") {
              appendText(ev.message);
              updateMsgs((m) => {
                const cp = [...m];
                cp[cp.length - 1] = { ...cp[cp.length - 1], error: true };
                return cp;
              });
              if (channel === "voice") feedTts(ev.message);
            }
          }
        }
        if (channel === "voice") feedTts("", true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = langRef.current === "en" ? "Sorry, I lost the connection. Could you repeat that?" : "Perdona, se ha cortado la conexión. ¿Me lo repites?";
          appendText(msg);
          track({ type: "error", channel, lang: langRef.current, data: { where: "client_fetch", message: String(err).slice(0, 120) } }, sessionRef.current);
          if (channel === "voice") feedTts(msg, true);
        }
      } finally {
        if (abortRef.current === ctrl) {
          streamingRef.current = false;
          setToolNow(null);
          if (!speakingRef.current) setStat(voiceOnRef.current ? "listening" : "idle");
        }
        // Quita burbujas vacías (p. ej. turnos abortados antes del primer token)
        updateMsgs((m) => m.filter((x, i) => x.content || i === m.length - 1 && streamingRef.current));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supported],
  );

  /* ---------------- Reconocimiento ---------------- */
  const startVoice = () => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setNotice(t.agent.noVoice);
      setMode("text");
      return;
    }
    if (!getConsent()) {
      setAskConsent(true);
      return;
    }
    // Desbloquea el audio en Safari/iOS con un gesto del usuario.
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    const rec = new Ctor();
    rec.lang = langRef.current === "en" ? "en-US" : "es-ES";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onspeechstart = () => {
      speechStartRef.current = performance.now();
    };
    rec.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      fin = fin.trim();
      mid = mid.trim();
      const speaking = speakingRef.current || statusRef.current === "speaking";
      const paused = heldRef.current !== null;
      // Justo después de hablar el reconocedor aún puede devolver el eco: filtro más estricto.
      const recentlySpoke = performance.now() - lastSpeechEndRef.current < 1500;

      if (speaking) {
        // Tras falsas alarmas exigimos más palabras para volver a pausar.
        const minWords = 3 + Math.min(4, falseAlarmsRef.current * 2);
        const heard = fin || mid;
        if (words(heard).length >= minWords && !isEcho(heard)) pauseForBargeIn();
        else return;
      }
      if (paused || heldRef.current) {
        if (fin && !isEcho(fin)) {
          confirmBargeIn(fin);
          setInterim("");
          void sendTurn(fin, "voice");
        } else if (mid && !isEcho(mid)) {
          setInterim(mid);
          armHoldTimer(); // el usuario sigue hablando: mantenemos la pausa
        }
        return;
      }
      if (recentlySpoke && isEcho(fin || mid, true)) return;
      setInterim(mid);
      if (fin && !isEcho(fin, recentlySpoke)) {
        setInterim("");
        void sendTurn(fin, "voice");
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNotice(t.agent.micDenied);
        stopVoice();
        setMode("text");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        track({ type: "stt_error", channel: "voice", lang: langRef.current, data: { error: e.error } }, sessionRef.current);
      }
    };
    rec.onend = () => {
      if (voiceOnRef.current) {
        try {
          rec.start();
        } catch {
          /* ya arrancado */
        }
      }
    };
    recRef.current = rec;
    voiceOnRef.current = true;
    setVoiceOn(true);
    setNotice(null);
    try {
      rec.start();
      setStat("listening");
    } catch {
      setNotice(t.agent.micDenied);
    }
  };

  const stopVoice = () => {
    voiceOnRef.current = false;
    setVoiceOn(false);
    recRef.current?.abort();
    recRef.current = null;
    stopSpeaking();
    setInterim("");
    setStat(streamingRef.current ? "thinking" : "idle");
  };

  /* Pregunta enviada desde el simulador u otros puntos de la página */
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) void sendTurn(text, voiceOnRef.current ? "voice" : "text");
    };
    window.addEventListener("guestbill:ask", onAsk);
    return () => window.removeEventListener("guestbill:ask", onAsk);
  }, [sendTurn]);

  const acceptConsent = (c: Consent) => {
    setConsent(c);
    setConsentState(c);
    setAskConsent(false);
    if (pending) {
      const p = pending;
      setPending(null);
      void sendTurn(p.text, p.channel);
    } else if (mode === "voice") {
      setTimeout(startVoice, 0);
    }
  };

  const resetChat = () => {
    abortRef.current?.abort();
    stopVoice();
    sessionRef.current = newSessionId();
    startedRef.current = false;
    updateMsgs(() => []);
    setResolved(null);
    setScore(null);
  };

  const rate = (r: boolean | null, s: number | null) => {
    setResolved(r);
    setScore(s);
    track({ type: "rating", channel: voiceOnRef.current ? "voice" : "text", lang, data: { resolved: r, score: s, turns: msgsRef.current.filter((m) => m.role === "assistant").length } }, sessionRef.current);
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput("");
    void sendTurn(v, "text");
  };

  const statusLabel = { idle: t.agent.idle, listening: t.agent.listening, thinking: t.agent.thinking, speaking: t.agent.speaking }[status];
  const assistantTurns = msgs.filter((m) => m.role === "assistant" && m.content).length;

  return (
    <div className="agent">
      <div className="agent-top">
        <div className="seg" role="tablist" aria-label="Modo">
          <button role="tab" aria-selected={mode === "voice"} className={mode === "voice" ? "on" : ""} disabled={!supported} onClick={() => setMode("voice")}>
            {t.agent.voice}
          </button>
          <button
            role="tab"
            aria-selected={mode === "text"}
            className={mode === "text" ? "on" : ""}
            onClick={() => {
              stopVoice();
              setMode("text");
            }}
          >
            {t.agent.text}
          </button>
        </div>
        <span className={`status status-${status}`} aria-live="polite">
          <span className="dot" aria-hidden /> {statusLabel}
        </span>
        {msgs.length > 0 && (
          <button className="link" onClick={resetChat}>
            {t.agent.newChat}
          </button>
        )}
      </div>

      {(notice || demo || !supported) && (
        <p className="notice">{notice ?? (!supported ? t.agent.noVoice : t.agent.demoMode)}</p>
      )}

      <div className="log" ref={logRef} aria-live="polite">
        {msgs.length === 0 && <p className="hint">{t.agent.sandbox}</p>}
        {msgs.map((m, i) =>
          m.content || (i === msgs.length - 1 && status === "thinking") ? (
            <div key={i} className={`bubble ${m.role} ${m.error ? "err" : ""}`}>
              <span className="who">{m.role === "user" ? t.agent.you : t.agent.bot}</span>
              <p>{m.content || "…"}</p>
              {m.interrupted && <span className="tag muted">{t.agent.interrupted}</span>}
              {m.ticketId && (
                <span className="tag warn">
                  {t.agent.escalated} · {m.ticketId}
                </span>
              )}
            </div>
          ) : null,
        )}
        {toolNow && <div className="tool-chip">{t.agent.tools[toolNow] ?? toolNow}…</div>}
        {interim && <div className="bubble user interim"><p>{interim}</p></div>}
      </div>

      {mode === "voice" ? (
        <div className="voice-ctrl">
          <button className={`mic ${voiceOn ? "live" : ""} ${status}`} onClick={voiceOn ? stopVoice : startVoice} aria-pressed={voiceOn}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
              {voiceOn ? (
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              ) : (
                <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
              )}
            </svg>
            <span>{voiceOn ? t.agent.stop : t.agent.start}</span>
          </button>
          <p className="small muted">{t.agent.headphones}</p>
        </div>
      ) : (
        <form className="text-ctrl" onSubmit={submitText}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.agent.placeholder} aria-label={t.agent.placeholder} maxLength={1000} />
          <button className="btn primary" type="submit" disabled={!input.trim()}>
            {t.agent.send}
          </button>
        </form>
      )}

      <div className="scenarios">
        <span className="small muted">{t.agent.tryLabel}</span>
        <div className="chips">
          {t.scenarios.map((s) => (
            <button key={s.k} className="chip" onClick={() => void sendTurn(s.q, voiceOn ? "voice" : "text")} title={s.q}>
              <b>{s.k}</b> {s.t}
            </button>
          ))}
        </div>
      </div>

      {assistantTurns > 0 && (
        <div className="rating">
          {resolved === null ? (
            <>
              <span>{t.agent.rateQ}</span>
              <button className="chip" onClick={() => rate(true, null)}>{t.agent.yes}</button>
              <button className="chip" onClick={() => rate(false, null)}>{t.agent.no}</button>
            </>
          ) : score === null ? (
            <>
              <span>{t.agent.rateScore}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="star" aria-label={`${n}/5`} onClick={() => rate(resolved, n)}>
                  ★
                </button>
              ))}
            </>
          ) : (
            <span>{t.agent.thanks}</span>
          )}
        </div>
      )}

      {askConsent && (
        <div className="consent" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <div className="consent-card">
            <h3 id="consent-title">{t.agent.consentTitle}</h3>
            <p>{t.agent.consentBody}</p>
            <div className="row">
              <button className="btn primary" onClick={() => acceptConsent("full")}>{t.agent.consentFull}</button>
              <button className="btn" onClick={() => acceptConsent("metrics_only")}>{t.agent.consentMin}</button>
            </div>
            <p className="small muted">{t.agent.consentNote}</p>
          </div>
        </div>
      )}
      {consent && <span className="sr-only">consent: {consent}</span>}
    </div>
  );
}
