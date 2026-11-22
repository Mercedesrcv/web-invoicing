import type Anthropic from "@anthropic-ai/sdk";
import { validateTaxId } from "../taxid";
import { BOOKINGS, GATEWAY_EXTRA, findBooking, maskEmailHint } from "./sandbox";

type Tool = Anthropic.Beta.BetaTool;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

/** Definiciones de herramientas (orden estable para la caché de prompt). */
export const TOOL_DEFS: Tool[] = [
  {
    name: "lookup_booking",
    description:
      "Busca una reserva del hotel de demostración por localizador, número de habitación o email del huésped. Devuelve estado de estancia, folio, facturas, estado de envío y de sincronización con el PMS. Úsala antes de afirmar cualquier estado.",
    input_schema: obj({
      locator: { type: "string", description: "Localizador o ID de reserva tal como lo confirmó el usuario" },
      room: { type: "string", description: "Número de habitación" },
      email: { type: "string", description: "Email del huésped, ya confirmado" },
    }),
  },
  {
    name: "validate_tax_id",
    description: "Valida formato y dígito de control de un NIF, NIE o CIF español, o el formato de un VAT europeo. Devuelve también la versión agrupada para confirmarlo en voz alta.",
    input_schema: obj(
      {
        tax_id: { type: "string" },
        country: { type: "string", description: "Código ISO del país fiscal, por defecto ES" },
      },
      ["tax_id"],
    ),
  },
  {
    name: "check_reconciliation",
    description: "Cruza el importe cobrado en la pasarela/VCC con el folio del PMS y la factura de una reserva. Devuelve diferencia y causas probables. No cierra ni corrige nada.",
    input_schema: obj({ booking_id: { type: "string", description: "ID de reserva (RES-...) o localizador" } }, ["booking_id"]),
  },
  {
    name: "resend_invoice",
    description: "Reenvía una factura emitida al email indicado. Requiere que el usuario haya confirmado el email.",
    input_schema: obj(
      {
        invoice_id: { type: "string" },
        email: { type: "string" },
        confirmed_by_user: { type: "boolean" },
      },
      ["invoice_id", "email", "confirmed_by_user"],
    ),
  },
  {
    name: "issue_corrective_invoice",
    description:
      "Emite una factura rectificativa (abono) de la factura original y una nueva factura a nombre de empresa. Requiere razón social, NIF/CIF válido y dirección fiscal confirmados. Si el periodo está cerrado, queda pendiente de aprobación de administración.",
    input_schema: obj(
      {
        invoice_id: { type: "string" },
        company_name: { type: "string" },
        tax_id: { type: "string" },
        fiscal_address: { type: "string" },
        confirmed_by_user: { type: "boolean" },
      },
      ["invoice_id", "company_name", "tax_id", "fiscal_address", "confirmed_by_user"],
    ),
  },
  {
    name: "send_secure_link",
    description: "Envía al usuario un enlace seguro de un solo uso para completar o corregir sus datos fiscales sin dictarlos. El destino se toma de la reserva; no hace falta que el usuario lo dicte.",
    input_schema: obj(
      {
        channel: { type: "string", enum: ["sms", "whatsapp", "email"] },
        booking_ref: { type: "string", description: "Localizador o ID de reserva, si se conoce" },
        purpose: { type: "string", enum: ["tax_data", "company_invoice", "update_email"] },
      },
      ["channel", "purpose"],
    ),
  },
  {
    name: "create_ticket",
    description:
      "Crea un ticket para el equipo humano con contexto limpio y, si handoff_to_human es true, transfiere la conversación. Úsalo ante descuadres de conciliación (prioridad high, con importes), errores de sincronización, ajustes sensibles, periodos cerrados o cuando el usuario pide una persona.",
    input_schema: obj(
      {
        priority: { type: "string", enum: ["low", "normal", "high"] },
        category: { type: "string", enum: ["reconciliation", "pms_sync", "invoice_issue", "tax_data", "account_settings", "sales", "other"] },
        summary: { type: "string", description: "Qué ocurre, en una o dos frases" },
        booking_id: { type: "string" },
        gateway_amount: { type: "number" },
        invoice_amount: { type: "number" },
        collected_data: { type: "string", description: "Datos ya recogidos, separados por punto y coma" },
        handoff_to_human: { type: "boolean" },
      },
      ["priority", "category", "summary", "handoff_to_human"],
    ),
  },
];

export interface ToolOutcome {
  result: unknown;
  isError?: boolean;
  /** Señales para monitorización. */
  escalated?: boolean;
  ticketId?: string;
  priority?: string;
}

let ticketSeq = 4100;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function publicBooking(b: (typeof BOOKINGS)[number]) {
  return {
    booking_id: b.id,
    locator: b.locator,
    room: b.room,
    guest: b.guestName,
    email_hint: maskEmailHint(b.email),
    channel: b.channel,
    payment: b.payment,
    check_in: b.checkIn,
    check_out: b.checkOut,
    stay_status: b.status,
    pms_sync: b.pmsSync,
    folio: b.folio.map((l) => ({ concept: l.concept, amount_eur: l.amount, bill_to: l.billTo })),
    invoices: b.invoices.map((i) => ({
      invoice_id: i.id,
      to: i.to,
      total_eur: i.total,
      status: i.status,
      error: i.error,
      sent_at: i.sentAt,
      delivery: i.delivery,
      accounting_period_closed: i.periodClosed ?? false,
    })),
  };
}

/**
 * Ejecuta una herramienta. Valida la entrada (con eager_input_streaming la API
 * no la valida por nosotros) y devuelve error estructurado si falta algo.
 */
export function runTool(name: string, input: Record<string, unknown>): ToolOutcome {
  const fail = (msg: string): ToolOutcome => ({ result: { error: msg }, isError: true });

  switch (name) {
    case "lookup_booking": {
      const q = { locator: str(input.locator), room: str(input.room), email: str(input.email) };
      if (!q.locator && !q.room && !q.email) return fail("Indica localizador, habitación o email.");
      const b = findBooking(q);
      if (!b) return { result: { found: false, message: "No hay ninguna reserva con ese dato en el sistema. No supongas su estado." } };
      return { result: { found: true, ...publicBooking(b) } };
    }
    case "validate_tax_id": {
      const id = str(input.tax_id);
      if (!id) return fail("Falta tax_id.");
      const r = validateTaxId(id, str(input.country) || "ES");
      return { result: { valid: r.valid, kind: r.kind, normalized: r.normalized, read_back: r.spoken, reason: r.reason } };
    }
    case "check_reconciliation": {
      const ref = str(input.booking_id);
      if (!ref) return fail("Falta booking_id.");
      const b = findBooking({ locator: ref });
      if (!b) return { result: { found: false } };
      const invoiced = b.invoices.filter((i) => i.status !== "error").reduce((s, i) => s + i.total, 0);
      const folioGuest = b.folio.filter((l) => l.billTo !== "ota").reduce((s, l) => s + l.amount, 0);
      const extra = GATEWAY_EXTRA[b.id] ?? [];
      const diff = Math.round((b.gatewayCharged - invoiced) * 100) / 100;
      const causes: string[] = [];
      if (extra.length) causes.push(...extra.map((e) => `Cargo en pasarela no presente en el folio: ${e.concept} (${e.amount} EUR)`));
      if (b.pmsSync === "delayed") causes.push("Sincronización PMS-pasarela con retraso");
      if (b.payment === "vcc") causes.push("Reserva con VCC: la estancia se cobra a la OTA y los extras al huésped por separado");
      return {
        result: {
          booking_id: b.id,
          gateway_charged_eur: b.gatewayCharged,
          invoiced_eur: invoiced,
          folio_guest_eur: folioGuest,
          difference_eur: diff,
          matched: diff === 0,
          probable_causes: causes,
          note: diff !== 0 ? "Descuadre sin resolver: no fuerces el cierre; crea ticket de prioridad alta." : undefined,
        },
      };
    }
    case "resend_invoice": {
      const inv = str(input.invoice_id);
      const email = str(input.email);
      if (!inv || !email) return fail("Faltan invoice_id o email.");
      if (input.confirmed_by_user !== true) return fail("El usuario no ha confirmado el email. Repítelo y pide confirmación.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("El email no tiene un formato válido.");
      const exists = BOOKINGS.some((b) => b.invoices.some((i) => i.id === inv && i.status !== "error"));
      if (!exists) return fail("No existe una factura emitida con ese número.");
      return { result: { status: "queued", invoice_id: inv, to: email, eta: "menos de 2 minutos" } };
    }
    case "issue_corrective_invoice": {
      const inv = str(input.invoice_id);
      const company = str(input.company_name);
      const taxId = str(input.tax_id);
      const addr = str(input.fiscal_address);
      if (!inv || !company || !taxId || !addr) return fail("Faltan datos: razón social, NIF/CIF y dirección fiscal.");
      if (input.confirmed_by_user !== true) return fail("El usuario no ha confirmado los datos de empresa.");
      const v = validateTaxId(taxId);
      if (!v.valid) return fail(`El NIF/CIF no es válido: ${v.reason}. Pide que lo revise u ofrece el enlace seguro.`);
      const booking = BOOKINGS.find((b) => b.invoices.some((i) => i.id === inv));
      const original = booking?.invoices.find((i) => i.id === inv);
      if (!original || original.status === "error") return fail("No existe una factura emitida con ese número.");
      if (original.periodClosed) {
        const t = `TCK-${++ticketSeq}`;
        return { result: { status: "pending_admin_approval", ticket_id: t, reason: "Periodo contable cerrado" }, escalated: true, ticketId: t, priority: "normal" };
      }
      const n = Number(inv.slice(-4)) + 200;
      return {
        result: {
          status: "issued",
          corrective_invoice_id: `R-2026-${String(n).padStart(6, "0")}`,
          new_invoice_id: `F-2026-${String(n + 1).padStart(6, "0")}`,
          amount_eur: original.total,
          sent_to_email_hint: booking ? maskEmailHint(booking.email) : undefined,
        },
      };
    }
    case "send_secure_link": {
      const ch = str(input.channel);
      if (!["sms", "whatsapp", "email"].includes(ch)) return fail("Canal no válido.");
      const ref = str(input.booking_ref);
      const b = ref ? findBooking({ locator: ref }) : undefined;
      return {
        result: {
          status: "sent",
          channel: ch,
          destination_hint: b ? (ch === "email" ? maskEmailHint(b.email) : "móvil registrado terminado en 47") : "contacto registrado",
          expires_in: "24 horas",
        },
      };
    }
    case "create_ticket": {
      const summary = str(input.summary);
      if (!summary) return fail("Falta summary.");
      const g = num(input.gateway_amount);
      const i = num(input.invoice_amount);
      const t = `TCK-${++ticketSeq}`;
      const difference = g !== undefined && i !== undefined ? Math.round((g - i) * 100) / 100 : undefined;
      return {
        result: {
          ticket_id: t,
          priority: str(input.priority) || "normal",
          category: str(input.category) || "other",
          difference_eur: difference,
          handoff: input.handoff_to_human === true ? "Un agente de soporte retomará la conversación con este resumen. Tiempo estimado de respuesta: 15 minutos en horario laboral." : "Ticket registrado; soporte responderá por email.",
        },
        escalated: true,
        ticketId: t,
        priority: str(input.priority) || "normal",
      };
    }
    default:
      return fail(`Herramienta desconocida: ${name}`);
  }
}
