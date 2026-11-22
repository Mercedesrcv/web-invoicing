/** Límite sencillo por IP en memoria para proteger la clave de API en despliegues públicos. */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max = Number(process.env.RATE_LIMIT_PER_MIN || 30)): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
