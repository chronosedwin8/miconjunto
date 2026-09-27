/** Limitador de tasa en memoria (ventana deslizante simple). Suficiente para un nodo; en clúster usar la BD. */
const g = globalThis as unknown as { __mcRate?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__mcRate ??= new Map<string, number[]>());

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfterMs: windowMs - (now - arr[0]) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 50_000) buckets.clear();
  return { ok: true, retryAfterMs: 0 };
}

export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
