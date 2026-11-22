"use client";
/** Cliente de monitorización del navegador: sesión, consentimiento y envío de eventos. */

export type Consent = "full" | "metrics_only";
const CONSENT_KEY = "folia.consent";
const SESSION_KEY = "folia.session";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function newSessionId() {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  safe(() => sessionStorage.setItem(SESSION_KEY, id), undefined);
  return id;
}

export function getSessionId() {
  return safe(() => sessionStorage.getItem(SESSION_KEY), null) || newSessionId();
}

export function getConsent(): Consent | null {
  const v = safe(() => localStorage.getItem(CONSENT_KEY), null);
  return v === "full" || v === "metrics_only" ? v : null;
}

export function setConsent(c: Consent) {
  safe(() => localStorage.setItem(CONSENT_KEY, c), undefined);
}

export interface ClientEvent {
  type: "session_start" | "consent" | "barge_in" | "tts_first_audio" | "stt_error" | "rating" | "simulator_run" | "page_view" | "error";
  channel?: "voice" | "text" | "web";
  lang?: string;
  data?: Record<string, unknown>;
}

export function track(events: ClientEvent | ClientEvent[], sessionId = getSessionId()) {
  const body = JSON.stringify({ sessionId, consent: getConsent() ?? "metrics_only", events: Array.isArray(events) ? events : [events] });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* sigue con fetch */
  }
  fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
