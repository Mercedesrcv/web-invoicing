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
  | "other";

const RULES: Array<[Intent, RegExp]> = [
  ["human_request", /\b(persona|humano|agente real|hablar con alguien|human|real person|someone)\b/i],
  ["out_of_scope", /(declaraci[oó]n|trimestral|modelo 303|presentar (el )?iva|vat return|file (my|the) (vat|tax))/i],
  ["privacy", /(no me f[ií]o|seguro dar|privacidad|dictar|por tel[eé]fono|don'?t trust|safe to (give|share)|privacy)/i],
  ["objection_pms", /(ya lo hace|ya genera|mi pms ya|nuestro pms ya|already (does|generates)|why (do|would) we need)/i],
  ["reconciliation", /(descuadre|diferencia|cobr[oó].*factura|420|395|no cuadra|mismatch|discrepan|charged .* invoice)/i],
  ["vcc_split", /\b(vcc|tarjeta virtual|virtual card|booking|expedia|ota|extras|split)\b/i],
  ["company_invoice", /(empresa|rectificativa|raz[oó]n social|company|corrective|credit note)/i],
  ["tax_id_error", /(error .*factura|habitaci[oó]n \d{3}|nif inv[aá]lido|cif inv[aá]lido|invalid (tax|vat)|room \d{3})/i],
  ["invoice_missing", /(no (me )?(ha )?lleg|no tengo (mi )?factura|no recib|didn'?t (get|receive)|never (got|received)|haven'?t (got|received)|reenv|resend)/i],
  ["pms_sync", /(pms|sincroniz|sync)/i],
  ["compliance", /(verifactu|ticketbai|sii|hacienda|normativa|compliance|e-?invoic)/i],
  ["pricing", /(precio|coste|cuesta|tarifa|price|cost|pricing)/i],
  ["configuration", /(series|configur|impuesto|iva|tax rate|set ?up)/i],
];

export function classifyIntent(text: string): Intent {
  for (const [intent, re] of RULES) if (re.test(text)) return intent;
  return "other";
}
