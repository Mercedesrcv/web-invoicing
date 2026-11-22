/**
 * Clasificador de intención por palabras clave (barato, determinista).
 * Sirve para segmentar métricas en el panel: volumen, resolución y escalado
 * por tipo de consulta. Se puede sustituir por un clasificador LLM.
 */
export type Intent =
  | "invoice_missing"
  | "company_invoice"
  | "reconciliation"
  | "vcc_split"
  | "pms_sync"
  | "compliance"
  | "tax_id_error"
  | "pricing"
  | "objection_pms"
  | "privacy"
  | "out_of_scope"
  | "human_request"
  | "configuration"
  | "injection"
  | "third_party"
  | "frustration"
  | "repeat"
  | "duplicate_charge"
  | "refund"
  | "eu_company"
  | "precheckin"
  | "other";

const RULES: Array<[Intent, RegExp]> = [
  ["injection", /(ignora (tus|las|todas)|olv[ií]da(te)? de (tus|las) (reglas|instrucciones)|ignore (your|all|previous)|sin (que yo )?confirmar|without confirm)/i],
  ["human_request", /\b(persona|humano|agente real|hablar con alguien|human|real person|someone)\b/i],
  ["out_of_scope", /(declaraci[oó]n|trimestral|modelo 303|presentar (el )?iva|vat return|file (my|the) (vat|tax))/i],
  ["repeat", /^\s*¿?\s*(perdona|c[oó]mo|qu[eé]|sorry|pardon)\s*\??\s*$|no te (he )?(o[ií]do|entendido)|rep[ií]te(lo|me)?|can you repeat|didn'?t (hear|catch)/i],
  ["frustration", /(tercera vez|segunda vez que|harta|harto|verg[uü]enza|inaceptable|nadie me|third time|ridiculous|unacceptable|fed up)/i],
  ["privacy", /(no me f[ií]o|seguro dar|privacidad|dictar|por tel[eé]fono|don'?t trust|safe to (give|share)|privacy)/i],
  ["third_party", /(otra persona|otra reserva|otro hu[eé]sped|compa[nñ]er[oa] de|colleague of|de mi jefe|someone else'?s|another guest|my colleague'?s)/i],
  ["objection_pms", /(ya lo hace|ya genera|mi pms ya|nuestro pms ya|already (does|generates)|why (do|would) we need)/i],
  ["duplicate_charge", /(dos veces|duplicad|doble cobro|cobrad[oa] doble|charged twice|double charge|charged me twice)/i],
  ["refund", /(reembolso|devoluci[oó]n|devolv|cancel[eé]|cancelaci[oó]n|refund|cancel)/i],
  ["reconciliation", /(descuadre|diferencia|cobr[oó].*factura|420|395|no cuadra|mismatch|discrepan|charged .* invoice)/i],
  ["eu_company", /(frances[ao]|alem[aá]n[ao]?|italian[ao]|portugues[ao]?|extranjer[ao]|empresa europea|intracomunitari|\bVAT\b|french company|german company|foreign company|EU company)/i],
  ["vcc_split", /\b(vcc|tarjeta virtual|virtual card|booking|expedia|ota|extras|split)\b/i],
  ["company_invoice", /(empresa|rectificativa|raz[oó]n social|company|corrective|credit note)/i],
  ["tax_id_error", /(error .*factura|habitaci[oó]n \d{3}|nif inv[aá]lido|cif inv[aá]lido|invalid (tax|vat)|room \d{3})/i],
  ["invoice_missing", /(no (me )?(ha )?lleg|no tengo (mi )?factura|no recib|didn'?t (get|receive)|never (got|received)|haven'?t (got|received)|reenv|resend)/i],
  ["precheckin", /(check-?in online|pre-?check-?in|antes de llegar|online check-?in)/i],
  ["pms_sync", /(pms|sincroniz|sync)/i],
  ["compliance", /(verifactu|ticketbai|sii|hacienda|normativa|compliance|e-?invoic)/i],
  ["pricing", /(precio|coste|cuesta|tarifa|price|cost|pricing)/i],
  ["configuration", /(series|configur|impuesto|iva|tax rate|set ?up)/i],
];

export function classifyIntent(text: string): Intent {
  for (const [intent, re] of RULES) if (re.test(text)) return intent;
  return "other";
}
