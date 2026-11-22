import { describe, expect, it } from "vitest";
import { maskPII, maskDeep } from "../lib/pii";

describe("maskPII", () => {
  it("enmascara CIF con guion", () => {
    const out = maskPII("Mi CIF es B-87452109");
    expect(out).not.toContain("87452109");
    expect(out).toContain("B");
  });
  it("enmascara DNI", () => expect(maskPII("DNI 12345678Z")).not.toContain("12345678"));
  it("enmascara email", () => expect(maskPII("envíalo a ana.garcia@empresa.com")).toBe("envíalo a a***@e***.com"));
  it("enmascara teléfono", () => expect(maskPII("mi móvil es +34 600 123 456")).not.toContain("600 123"));
  it("enmascara tarjeta", () => expect(maskPII("tarjeta 4111 1111 1111 1111")).toContain("****1111"));
  it("no toca importes ni habitaciones", () => {
    expect(maskPII("cobró 420 € y la factura salió por 395 €, habitación 304")).toBe("cobró 420 € y la factura salió por 395 €, habitación 304");
  });
  it("no toca localizadores cortos", () => expect(maskPII("localizador X9K4P")).toBe("localizador X9K4P"));
  it("enmascara en profundidad", () => {
    const o = maskDeep({ a: ["x@y.com"], b: { c: "12345678Z" } });
    expect(JSON.stringify(o)).not.toContain("x@y.com");
  });
});
