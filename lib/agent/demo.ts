import type { AgentChunk, ChatMsg, ToolTrace } from "./core";
import { classifyIntent } from "./intents";
import { runTool } from "./tools";

/**
 * Modo demo (sin ANTHROPIC_API_KEY): respuestas guionizadas por intención para
 * que la web sea navegable en una preview de Vercel sin coste. Usa las mismas
 * herramientas del hotel de demostración, así que los estados son "reales".
 */
const R: Record<string, { es: string; en: string }> = {
  greeting: {
    es: "Hola, soy el asistente de facturación. ¿Hablas desde un hotel o eres huésped?",
    en: "Hi, I'm the invoicing assistant. Are you calling from a hotel or are you a guest?",
  },
  invoice_missing: {
    es: "Vamos a localizarla. ¿Me dices el localizador de la reserva?",
    en: "Let's find it. Could you give me the booking reference?",
  },
  company_invoice: {
    es: "Una factura emitida no se puede sobrescribir, así que haremos una rectificativa y una nueva a nombre de la empresa. ¿Me das primero el número de factura o el localizador?",
    en: "An issued invoice can't be overwritten, so we'll issue a corrective invoice and a new one to the company. First, what's the invoice number or booking reference?",
  },
  reconciliation: {
    es: "Entendido, lo reviso sin forzar ningún cierre. ¿Me das el localizador o el ID de la reserva?",
    en: "Understood, I'll check it without forcing any closure. What's the booking reference?",
  },
  vcc_split: {
    es: "Con tarjeta virtual de Booking, la estancia se factura a la OTA y los extras como parking o minibar van en una factura aparte al huésped. ¿Quieres que lo veamos con una reserva concreta?",
    en: "With a Booking virtual card, the stay is invoiced to the OTA and extras like parking or minibar go on a separate invoice to the guest. Want to check a specific booking?",
  },
  pms_sync: {
    es: "La sincronización con el PMS es bidireccional: si recepción cambia datos fiscales o cargos, el folio se actualiza y la factura se regenera o se rectifica sin doble entrada. ¿Te cuento cómo se conecta tu PMS?",
    en: "The PMS sync is two-way: if the front desk changes tax details or charges, the folio updates and the invoice is regenerated or corrected with no double entry. Want to know how your PMS connects?",
  },
  compliance: {
    es: "En España generamos registros encadenados con huella y código QR según VeriFactu, y soportamos TicketBAI y SII según la configuración fiscal del hotel. No puedo citar certificaciones concretas; si operas en otro país, te paso con un especialista. ¿Dónde está tu establecimiento?",
    en: "In Spain we produce chained records with a hash and QR code following VeriFactu, and support TicketBAI and SII depending on the hotel's tax setup. I can't quote specific certifications; for other countries I'll connect you with a specialist. Where is your property?",
  },
  tax_id_error: {
    es: "Déjame revisar esa factura. ¿Me confirmas el número de habitación?",
    en: "Let me check that invoice. Can you confirm the room number?",
  },
  pricing: {
    es: "Las rectificativas, reenvíos y el portal self-service están incluidos, sin coste por documento; el plan depende del número de habitaciones. ¿Retomamos lo que estábamos viendo?",
    en: "Corrective invoices, resends and the self-service portal are included, with no per-document cost; the plan depends on room count. Shall we pick up where we left off?",
  },
  objection_pms: {
    es: "Tu PMS genera el PDF cuando alguien lo pulsa y rellena los datos. Nosotros automatizamos lo de alrededor: captura fiscal en el pre-check-in, separación VCC y extras, envío y conciliación sin tocar recepción. ¿Cuántas facturas corrige tu equipo al mes?",
    en: "Your PMS creates the PDF when someone clicks and fills in the data. We automate everything around it: tax data in pre-check-in, VCC and extras split, delivery and reconciliation with no front-desk work. How many invoices does your team fix each month?",
  },
  privacy: {
    es: "Lo entiendo perfectamente. Te envío un enlace seguro al móvil para que lo completes en privado, sin dictarlo. ¿Prefieres SMS, WhatsApp o email?",
    en: "Totally understandable. I can send a secure link to your phone so you fill it in privately. Do you prefer SMS, WhatsApp or email?",
  },
  out_of_scope: {
    es: "No realizo presentaciones fiscales ni asesoría contable. Lo que sí puedo es exportarte el libro de facturas emitidas y rectificativas listo para tu gestoría. ¿Te lo preparo?",
    en: "I don't file taxes or give accounting advice. What I can do is export your issued and corrective invoice ledger ready for your accountant. Shall I prepare it?",
  },
  human_request: {
    es: "Claro, te paso con una persona. He dejado un ticket con lo que me has contado para que no tengas que repetirlo; te contactarán en unos 15 minutos en horario laboral.",
    en: "Of course, I'll pass you to a person. I've left a ticket with what you've told me so you don't need to repeat it; they'll reach you in about 15 minutes during business hours.",
  },
  configuration: {
    es: "Las series e impuestos se configuran por establecimiento en el panel. ¿Empezamos por las series o por los tipos de IVA?",
    en: "Series and taxes are configured per property in the dashboard. Shall we start with series or VAT rates?",
  },
  injection: {
    es: "Eso no puedo hacerlo: antes de emitir o cambiar una factura necesito que confirmes los datos, es para protegerte. ¿Me dices el número de factura o el localizador?",
    en: "I can't do that: before issuing or changing an invoice I need you to confirm the details, it's for your protection. What's the invoice number or booking reference?",
  },
  third_party: {
    es: "Por privacidad no puedo darte datos de la reserva de otra persona. Si es tuya, dime el localizador; si no, el titular puede pedirla o el hotel puede enviársela.",
    en: "For privacy I can't share details of someone else's booking. If it's yours, give me the reference; otherwise the holder or the hotel can request it.",
  },
  frustration: {
    es: "Lo siento mucho, entiendo que es frustrante. Vamos a dejarlo resuelto ahora: ¿me dices el localizador de la reserva?",
    en: "I'm really sorry, I understand it's frustrating. Let's get it sorted now: what's your booking reference?",
  },
  duplicate_charge: {
    es: "Vamos a comprobarlo antes de nada, porque muchas veces es una retención de la tarjeta y no un segundo cobro. ¿Me dices el localizador?",
    en: "Let's check it first, because it's often a card hold rather than a second charge. What's your booking reference?",
  },
  refund: {
    es: "Cuando hay una devolución, la factura no se borra: se emite una rectificativa por el importe devuelto. ¿Me dices el localizador para revisarlo?",
    en: "When there's a refund, the invoice isn't deleted: we issue a corrective invoice for the refunded amount. What's the booking reference?",
  },
  eu_company: {
    es: "Validamos el VAT europeo de la empresa y lo ponemos en la factura. El alojamiento en España lleva IVA español aunque la empresa sea extranjera; para tu caso concreto, consúltalo con tu asesor. ¿Me dices el VAT?",
    en: "We validate the company's EU VAT number and put it on the invoice. Accommodation in Spain carries Spanish VAT even for foreign companies; for your specific case, check with your advisor. What's the VAT number?",
  },
  precheckin: {
    es: "Sí. Si el huésped rellena sus datos fiscales en el check-in online, se validan en ese momento y la factura sale con ellos al hacer el check-out, sin pasar por recepción. ¿Quieres saber qué datos se piden?",
    en: "Yes. If the guest enters tax details during online check-in, they're validated right away and the invoice is issued with them at check-out, with no front-desk work. Want to know which details we ask for?",
  },
  other: {
    es: "Puedo ayudarte con facturas no recibidas, rectificativas, descuadres de cobro o dudas del producto. ¿Qué necesitas?",
    en: "I can help with missing invoices, corrective invoices, payment mismatches or product questions. What do you need?",
  },
};

const LOCATOR_RE = /\b(X9K4P|BK-?55120|LOC-?7781|DQ-?420|R304-?88|PA-?118|CX-?930|OCT-?552|RES-\d{5})\b/i;
const GENERIC_CODE_RE = /^\s*([A-Z]{1,4}-?\d{3,6}|[A-Z0-9]{5,8})\s*\.?\s*$/i;
const TAX_ID_RE = /^\s*([A-HJ-NP-SUVWXYZ][\s-]?\d{7,8}[0-9A-Z]?|\d{8}[\s-]?[A-Z]|(?:AT|BE|DE|DK|FI|FR|IE|IT|LU|NL|PL|PT|SE)[\s-]?[0-9A-Z]{8,12})\s*\.?\s*$/i;

const SPOKEN: Record<string, string> = {
  equis: "X", ka: "K", pe: "P", be: "B", uve: "V", zeta: "Z", ye: "Y", erre: "R", ele: "L", eme: "M", ene: "N", ce: "C", de: "D", efe: "F", ge: "G", hache: "H", jota: "J", te: "T", a: "A", e: "E", i: "I", o: "O", u: "U", s: "S", ese: "S", cu: "Q",
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const REF_ES: Record<string, string> = { A: "Alicante", B: "Barcelona", C: "Cáceres", D: "Dinamarca", E: "España", F: "Francia", G: "Granada", H: "Huelva", J: "Jaén", K: "kilo", L: "León", M: "Madrid", N: "Navarra", P: "París", Q: "Quebec", R: "Roma", S: "Sevilla", T: "Toledo", U: "Úbeda", V: "Valencia", W: "Washington", X: "Xilófono", Y: "Yegua", Z: "Zaragoza" };
const REF_EN: Record<string, string> = { A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu" };

/** "equis nueve ka cuatro pe" -> "X9K4P" (solo si todas las palabras son deletreables). */
function fromSpelled(text: string): string | null {
  const ws = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (ws.length < 3) return null;
  const out = ws.map((w) => SPOKEN[w] ?? (/^[0-9]$/.test(w) ? w : null));
  return out.every(Boolean) ? out.join("") : null;
}

/** Lee un código para confirmarlo: letras con referencia y números de dos en dos. */
function readBack(code: string, lang: "es" | "en"): string {
  const ref = lang === "en" ? REF_EN : REF_ES;
  const parts = code.toUpperCase().replace(/[\s-]/g, "").match(/[A-Z]|\d{1,2}/g) ?? [];
  return parts.map((p) => (/[A-Z]/.test(p) ? (lang === "en" ? `${p} as in ${ref[p] ?? p}` : `${p} de ${ref[p] ?? p}`) : p)).join(", ");
}

/** El guion responde en el idioma del usuario (Claude lo hace solo). */
function detectLang(text: string, fallback: "es" | "en"): "es" | "en" {
  if (/[ñ¿¡áéíóú]|\b(factura|hice|tengo|quiero|necesito|puedes|reserva|habitaci|cobr|hola|por favor|mi|el|la|los|las|que|de)\b/i.test(text)) return "es";
  if (/\b(the|my|invoice|booking|please|can|you|what|how|did|didn'?t|i'm|i)\b/i.test(text)) return "en";
  return fallback;
}

export async function* demoTurn(uiLang: "es" | "en", history: ChatMsg[]): AsyncGenerator<AgentChunk> {
  const started = Date.now();
  const last = history[history.length - 1].content;
  const lang = detectLang(last, uiLang);
  const all = history.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const tools: ToolTrace[] = [];
  let escalated = false;
  let ticketId: string | undefined;
  let text: string;

  const spelled = fromSpelled(last);
  const taxId = !LOCATOR_RE.test(last) ? last.match(TAX_ID_RE)?.[1] : undefined;
  const loc = last.match(LOCATOR_RE)?.[1] ?? (spelled && LOCATOR_RE.test(spelled) ? spelled : undefined);
  const unknownCode = !loc && !taxId ? (spelled ?? last.match(GENERIC_CODE_RE)?.[1]) : undefined;
  const room = last.match(/\b(?:habitaci[oó]n|room|hab\.?)\s*(\d{3})\b/i)?.[1] ?? (/^\s*\d{3}\s*$/.test(last) ? last.trim() : undefined);
  const intent = classifyIntent(last);

  // Confirmación ("sí, adelante") de una acción propuesta en el turno anterior.
  const prevAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const affirmative = /^\s*(s[ií]|vale|ok|adelante|correcto|claro|yes|sure|go ahead)(?=[\s,.!]|$)/i.test(last) && /\?\s*$/.test(prevAssistant) && /(emito|rectificativa|issue|corrective)/i.test(prevAssistant);
  const ctxLoc = all.match(LOCATOR_RE)?.[1];

  if (affirmative && ctxLoc) {
    const b = runTool("lookup_booking", { locator: ctxLoc }).result as { invoices?: Array<{ invoice_id: string; total_eur: number }>; refunds?: Array<{ amount_eur: number }> };
    const inv = b.invoices?.[0];
    const isRefund = /CX-?930/i.test(ctxLoc);
    const input = isRefund
      ? { invoice_id: inv?.invoice_id, reason: "refund", refund_amount: b.refunds?.[0]?.amount_eur, confirmed_by_user: true }
      : { invoice_id: inv?.invoice_id, reason: "company_change", company_name: "Empresa del cliente", tax_id: "B87452108", fiscal_address: "Dirección confirmada", confirmed_by_user: true };
    const out = runTool("issue_corrective_invoice", input);
    tools.push({ name: "issue_corrective_invoice", input, result: out.result });
    const r = out.result as { status?: string; ticket_id?: string; corrective_invoice_id?: string; new_invoice_id?: string; sent_to_email_hint?: string };
    if (r.status === "pending_admin_approval") {
      escalated = true;
      ticketId = r.ticket_id;
      text = lang === "en"
        ? `That invoice belongs to a closed accounting period, so accounting has to approve the correction. I've opened ticket ${ticketId} with all the details; you'll get an answer by email within one business day.`
        : `Esa factura es de un periodo contable cerrado, así que la rectificativa la aprueba administración. He abierto el ticket ${ticketId} con todos los datos y te responderán por email en un día laborable.`;
    } else if (r.status === "issued") {
      text = lang === "en"
        ? `Done: corrective invoice ${r.corrective_invoice_id}${r.new_invoice_id ? ` and new invoice ${r.new_invoice_id}` : ""} have been sent to ${r.sent_to_email_hint}. Anything else?`
        : `Hecho: he emitido la rectificativa ${r.corrective_invoice_id}${r.new_invoice_id ? ` y la nueva factura ${r.new_invoice_id}` : ""}, enviadas a ${r.sent_to_email_hint}. ¿Algo más?`;
    } else {
      text = lang === "en" ? "I couldn't issue it with those details. Shall I pass it to the support team?" : "No he podido emitirla con esos datos. ¿Lo paso al equipo de soporte?";
    }
  } else if (history.length === 1 && /^(hola|hello|hi|buenas)\b/i.test(last.trim()) && last.trim().split(/\s+/).length <= 4) {
    text = R.greeting[lang];
  } else if (taxId) {
    text = lang === "en" ? `Confirming: ${readBack(taxId, "en")}. Is that right?` : `Confirmo: ${readBack(taxId, "es")}. ¿Es correcto?`;
  } else if (unknownCode && /\d/.test(unknownCode)) {
    const out = runTool("lookup_booking", { locator: unknownCode });
    tools.push({ name: "lookup_booking", input: { locator: unknownCode }, result: out.result });
    text = lang === "en"
      ? `I can't find any booking with ${readBack(unknownCode, "en")}. Could you check the reference, or give me the guest's email?`
      : `No encuentro ninguna reserva con ${readBack(unknownCode, "es")}. ¿Puedes revisar el localizador o darme el email del huésped?`;
  } else if (intent === "repeat") {
    const prev = [...history].reverse().find((m) => m.role === "assistant")?.content.replace(/\s*\[[^\]]*\]\s*$/, "");
    const first = prev?.split(/(?<=[.!?])\s+/).slice(-2).join(" ");
    text = first ? (lang === "en" ? `Sorry, I'll repeat: ${first}` : `Perdona, te lo repito: ${first}`) : R.other[lang];
  } else if (["injection", "third_party", "frustration", "duplicate_charge", "refund", "eu_company", "precheckin"].includes(intent) && !loc) {
    text = R[intent][lang];
  } else if (intent === "human_request" || intent === "out_of_scope" || intent === "privacy" || intent === "pricing" || intent === "objection_pms" || intent === "compliance") {
    text = R[intent][lang];
    if (intent === "human_request") {
      const out = runTool("create_ticket", { priority: "normal", category: "other", summary: all.slice(0, 200), handoff_to_human: true });
      tools.push({ name: "create_ticket", input: {}, result: out.result });
      escalated = true;
      ticketId = out.ticketId;
    }
  } else if (loc || room) {
    const out = runTool("lookup_booking", loc ? { locator: loc } : { room });
    tools.push({ name: "lookup_booking", input: loc ? { locator: loc } : { room }, result: out.result });
    const r = out.result as { found: boolean; booking_id?: string; invoices?: Array<{ invoice_id: string; status: string; delivery?: string; error?: string; total_eur: number }>; email_hint?: string };
    const confirm = loc ? (lang === "en" ? `I have ${readBack(loc, "en")}. ` : `Tengo ${readBack(loc, "es")}. `) : "";
    const inv = r.invoices?.[0];
    if (!r.found || !inv) {
      text = lang === "en" ? "I can't find a booking with that reference. Could you spell it again?" : "No encuentro ninguna reserva con ese dato. ¿Me lo deletreas de nuevo?";
    } else if (inv.status === "error") {
      text = lang === "en"
        ? `The invoice failed because the company tax ID has only 8 characters and the tax country is empty. Do you want to dictate it now, or shall I send the guest a secure link?`
        : `La factura falla porque el CIF de la empresa tiene solo 8 caracteres y el país fiscal está vacío. ¿Quieres dictármelo ahora o envío un enlace seguro al huésped?`;
    } else if (/PA-?118/i.test(loc ?? "")) {
      const rec = runTool("check_reconciliation", { booking_id: "PA-118" });
      tools.push({ name: "check_reconciliation", input: { booking_id: "PA-118" }, result: rec.result });
      text = lang === "en"
        ? `${confirm}There's only one charge of 250 euros. The other 250 was a card hold, already released this morning; when it disappears from your statement depends on your bank.`
        : `${confirm}Solo hay un cobro de 250 euros. Los otros 250 eran una retención de la tarjeta, ya liberada esta mañana; cuándo desaparece del extracto depende de tu banco.`;
    } else if (/CX-?930/i.test(loc ?? "")) {
      text = lang === "en"
        ? `${confirm}I see a refund of 120 euros for the cancellation, and invoice F-2026-001820 is still for 240. Shall I issue a corrective invoice for minus 120 euros?`
        : `${confirm}Veo una devolución de 120 euros por la cancelación y la factura F-2026-001820 sigue por 240. ¿Emito una rectificativa de menos 120 euros?`;
    } else if (/OCT-?552/i.test(loc ?? "")) {
      const t = runTool("create_ticket", { priority: "normal", category: "invoice_issue", summary: "Rectificativa sobre factura de periodo cerrado (octubre)", booking_id: "RES-09877", handoff_to_human: false });
      tools.push({ name: "create_ticket", input: {}, result: t.result });
      escalated = true;
      ticketId = t.ticketId;
      text = lang === "en"
        ? `${confirm}That invoice belongs to October, which is already closed, so accounting has to approve the correction. I've opened ticket ${ticketId}; you'll get an answer by email within one business day.`
        : `${confirm}Esa factura es de octubre, un periodo ya cerrado, así que la rectificativa la aprueba administración. He abierto el ticket ${ticketId} y te responderán por email en un día laborable.`;
    } else if (/DQ-?420/i.test(loc ?? "")) {
      const rec = runTool("check_reconciliation", { booking_id: "DQ-420" });
      tools.push({ name: "check_reconciliation", input: { booking_id: "DQ-420" }, result: rec.result });
      const t = runTool("create_ticket", { priority: "high", category: "reconciliation", summary: "Descuadre pasarela vs factura", booking_id: "RES-10402", gateway_amount: 420, invoice_amount: 395, handoff_to_human: true });
      tools.push({ name: "create_ticket", input: {}, result: t.result });
      escalated = true;
      ticketId = t.ticketId;
      text = lang === "en"
        ? `The gateway charged 420 euros and the invoice is 395, a 25 euro gap: a late check-out was charged at the terminal after the folio closed. I won't force the closure; I've opened high-priority ticket ${ticketId} with both amounts for support.`
        : `La pasarela cobró 420 euros y la factura es de 395, una diferencia de 25: hay un late check-out cobrado en el TPV después de cerrar el folio. No fuerzo el cierre; he abierto el ticket ${ticketId} de prioridad alta con ambos importes para soporte.`;
    } else if (inv.delivery === "bounced") {
      text = lang === "en"
        ? `${confirm}Invoice ${inv.invoice_id} was sent this morning but the email bounced. Shall I resend it to ${r.email_hint} or to another address?`
        : `${confirm}La factura ${inv.invoice_id} se envió esta mañana pero el correo rebotó. ¿La reenvío a ${r.email_hint} o a otra dirección?`;
    } else {
      text = lang === "en"
        ? `${confirm}Invoice ${inv.invoice_id} for ${inv.total_eur} euros is ${inv.status}. What would you like to do with it?`
        : `${confirm}La factura ${inv.invoice_id} de ${inv.total_eur} euros está ${inv.status === "sent" ? "enviada" : "emitida"}. ¿Qué quieres hacer con ella?`;
    }
  } else {
    text = (R[intent] ?? R.other)[lang];
  }

  // Simula streaming palabra a palabra para que voz y UI se comporten igual que con Claude.
  let ttft: number | null = null;
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    await new Promise((r) => setTimeout(r, 18));
    if (ttft === null) ttft = Date.now() - started;
    yield { type: "text", delta: (i ? " " : "") + words[i] };
  }
  yield { type: "done", text, mode: "demo", model: "demo-script", ttftMs: ttft, totalMs: Date.now() - started, tools, escalated, ticketId, priority: escalated ? "high" : undefined };
}
