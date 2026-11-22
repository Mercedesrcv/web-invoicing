/**
 * Validación de identificadores fiscales.
 * - España: NIF (DNI), NIE y CIF con dígito/letra de control.
 * - Resto UE: comprobación de formato del VAT (prefijo país + 2-12 alfanuméricos).
 * No sustituye a la verificación VIES; es la validación previa que evita
 * errores de emisión como el de la habitación 304.
 */
export type TaxIdKind = "NIF" | "NIE" | "CIF" | "EU_VAT" | "UNKNOWN";

export interface TaxIdResult {
  normalized: string;
  kind: TaxIdKind;
  valid: boolean;
  reason?: string;
  /** Versión agrupada para leerla en voz alta y confirmar. */
  spoken: string;
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_LETTERS = "JABCDEFGHI";

export function normalizeTaxId(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-._/]/g, "");
}

export function groupForSpeech(id: string): string {
  const m = id.match(/^([A-Z]*)(\d*)([A-Z]?)$/);
  if (!m) return id.split("").join(" ");
  const [, prefix, digits, suffix] = m;
  const pairs = digits.match(/.{1,2}/g) ?? [];
  return [prefix.split("").join(" "), pairs.join(", "), suffix].filter(Boolean).join(", ");
}

export function validateTaxId(raw: string, country = "ES"): TaxIdResult {
  const id = normalizeTaxId(raw);
  const base = { normalized: id, spoken: groupForSpeech(id) };
  const cc = country.toUpperCase();

  if (cc !== "ES" || /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(id) && !/^ES/.test(id) && !/^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$/.test(id) && !/^[XYZ]\d{7}[A-Z]$/.test(id)) {
    const ok = /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(id);
    return { ...base, kind: "EU_VAT", valid: ok, reason: ok ? undefined : "Formato de VAT europeo no válido" };
  }

  const es = id.startsWith("ES") ? id.slice(2) : id;

  if (/^\d{8}[A-Z]$/.test(es)) {
    const expected = DNI_LETTERS[Number(es.slice(0, 8)) % 23];
    const valid = expected === es[8];
    return { ...base, normalized: es, kind: "NIF", valid, reason: valid ? undefined : "La letra de control del NIF no coincide" };
  }

  if (/^[XYZ]\d{7}[A-Z]$/.test(es)) {
    const num = "XYZ".indexOf(es[0]) + es.slice(1, 8);
    const expected = DNI_LETTERS[Number(num) % 23];
    const valid = expected === es[8];
    return { ...base, normalized: es, kind: "NIE", valid, reason: valid ? undefined : "La letra de control del NIE no coincide" };
  }

  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(es)) {
    const digits = es.slice(1, 8);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 0) {
        const dbl = d * 2;
        sum += Math.floor(dbl / 10) + (dbl % 10);
      } else {
        sum += d;
      }
    }
    const control = (10 - (sum % 10)) % 10;
    const last = es[8];
    const letterOnly = "PQRSNW".includes(es[0]);
    const digitOnly = "ABEH".includes(es[0]);
    let valid: boolean;
    if (letterOnly) valid = last === CIF_LETTERS[control];
    else if (digitOnly) valid = last === String(control);
    else valid = last === String(control) || last === CIF_LETTERS[control];
    return { ...base, normalized: es, kind: "CIF", valid, reason: valid ? undefined : "El dígito de control del CIF no coincide" };
  }

  return { ...base, kind: "UNKNOWN", valid: false, reason: "No tiene formato de NIF, NIE ni CIF" };
}
