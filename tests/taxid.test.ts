import { describe, expect, it } from "vitest";
import { validateTaxId, groupForSpeech } from "../lib/taxid";

describe("validateTaxId", () => {
  it("valida un DNI correcto", () => expect(validateTaxId("12345678Z").valid).toBe(true));
  it("rechaza letra de DNI incorrecta", () => expect(validateTaxId("12345678A").valid).toBe(false));
  it("valida NIE", () => expect(validateTaxId("X1234567L").valid).toBe(true));
  it("valida CIF con separadores", () => {
    const r = validateTaxId("B-87452108");
    expect(r.kind).toBe("CIF");
    expect(r.valid).toBe(true);
  });
  it("detecta el dígito de control erróneo del CIF B-87452109", () => {
    const r = validateTaxId("B-87452109");
    expect(r.valid).toBe(false);
  });
  it("acepta VAT UE por formato", () => expect(validateTaxId("FR40303265045", "FR").valid).toBe(true));
  it("agrupa para voz", () => expect(groupForSpeech("B87452109")).toBe("B, 87, 45, 21, 09"));
});
