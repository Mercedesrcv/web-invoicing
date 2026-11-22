/**
 * Enmascarado de datos personales y fiscales antes de registrar nada.
 * Regla: en los logs nunca se guarda un NIF/CIF, email, teléfono, IBAN o
 * tarjeta completos. Se conserva lo justo para depurar (tipo + últimos dígitos).
 */

const keepEnds = (s: string, start: number, end: number) =>
  s.length <= start + end ? "*".repeat(s.length) : s.slice(0, start) + "*".repeat(s.length - start - end) + s.slice(s.length - end);

const RULES: Array<[RegExp, (m: string) => string]> = [
  // Emails
  [/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})\b/g, (m) => {
    const [user, domain] = m.split("@");
    const tld = domain.slice(domain.lastIndexOf("."));
    return `${user[0]}***@${domain[0]}***${tld}`;
  }],
  // IBAN
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, (m) => `${m.slice(0, 4)}****${m.replace(/\s/g, "").slice(-4)}`],
  // Tarjetas (13-19 dígitos con separadores opcionales)
  [/\b(?:\d[ -]?){12,18}\d\b/g, (m) => `****${m.replace(/\D/g, "").slice(-4)}`],
  // CIF / NIF / NIE con separadores opcionales (B-87452109, B 87 45 21 09, 12345678Z, X1234567L)
  [/\b(?:ES)?[A-HJ-NP-SUVWXYZ][ -]?(?:\d[ -]?){7}[0-9A-Z]\b/g, (m) => {
    const c = m.replace(/[\s-]/g, "");
    return keepEnds(c, 1, 2);
  }],
  [/\b\d{8}[ -]?[A-Za-z]\b/g, (m) => keepEnds(m.replace(/[\s-]/g, ""), 0, 2)],
  // Teléfonos (+34 600 123 456, 600123456)
  [/(?:\+\d{1,3}[ ]?)?(?:\d[ ]?){9,11}\b/g, (m) => `***${m.replace(/\D/g, "").slice(-2)}`],
];

export function maskPII(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, fn] of RULES) out = out.replace(re, fn);
  return out;
}

/** Enmascara recursivamente cualquier string dentro de un objeto. */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return maskPII(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskDeep(v);
    return out as T;
  }
  return value;
}
