import { describe, expect, it } from "vitest";
import { runTool } from "../lib/agent/tools";
import { assessTurn } from "../lib/agent/quality";
import { classifyIntent } from "../lib/agent/intents";
import { sanitizeHistory } from "../lib/agent/core";

describe("herramientas del hotel de demostración", () => {
  it("la conciliación de DQ-420 detecta 25 € y no marca conciliado", () => {
    const r = runTool("check_reconciliation", { booking_id: "DQ-420" }).result as { difference_eur: number; matched: boolean };
    expect(r.difference_eur).toBe(25);
    expect(r.matched).toBe(false);
  });
  it("no inventa reservas", () => {
    const r = runTool("lookup_booking", { locator: "ZZ-1" }).result as { found: boolean };
    expect(r.found).toBe(false);
  });
  it("no reenvía sin confirmación del usuario", () => {
    expect(runTool("resend_invoice", { invoice_id: "F-2026-001842", email: "a@b.com", confirmed_by_user: false }).isError).toBe(true);
  });
  it("rechaza rectificativa con CIF inválido", () => {
    const o = runTool("issue_corrective_invoice", { invoice_id: "F-2026-001799", company_name: "X", tax_id: "B87452109", fiscal_address: "C/ Mayor 1", confirmed_by_user: true });
    expect(o.isError).toBe(true);
  });
  it("emite rectificativa con datos válidos y confirmados", () => {
    const o = runTool("issue_corrective_invoice", { invoice_id: "F-2026-001799", company_name: "Nordic Consulting S.L.", tax_id: "B87452108", fiscal_address: "C/ Mayor 1, Madrid", confirmed_by_user: true });
    expect((o.result as { status: string }).status).toBe("issued");
  });
  it("el ticket calcula la diferencia en servidor y marca escalado", () => {
    const o = runTool("create_ticket", { priority: "high", category: "reconciliation", summary: "x", gateway_amount: 420, invoice_amount: 395, handoff_to_human: true });
    expect(o.escalated).toBe(true);
    expect((o.result as { difference_eur: number }).difference_eur).toBe(25);
  });
  it("la habitación 304 devuelve el error de NIF", () => {
    const r = runTool("lookup_booking", { room: "304" }).result as { invoices: Array<{ error?: string }> };
    expect(r.invoices[0].error).toMatch(/TAX_ID_INVALID/);
  });
});

describe("calidad de turno", () => {
  it("premia turnos cortos", () => expect(assessTurn("Vamos a localizarla. ¿Me dices el localizador?").score).toBe(100));
  it("penaliza markdown y listas", () => {
    const q = assessTurn("**Pasos:**\n- uno\n- dos\n- tres\n- cuatro");
    expect(q.flags).toContain("markdown_in_voice");
    expect(q.flags).toContain("long_list");
  });
});

describe("intenciones", () => {
  it("clasifica descuadres", () => expect(classifyIntent("cobró 420 y la factura 395")).toBe("reconciliation"));
  it("clasifica fuera de alcance", () => expect(classifyIntent("hazme la declaración trimestral del IVA")).toBe("out_of_scope"));
});

describe("historial", () => {
  it("empieza por usuario y une mensajes consecutivos", () => {
    const h = sanitizeHistory([
      { role: "assistant", content: "hola" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(h).toEqual([{ role: "user", content: "a\nb" }]);
  });
});
