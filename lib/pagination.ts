export type SP = Record<string, string | string[] | undefined>;

export function spGet(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

export function spFlat(sp: SP): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of Object.keys(sp)) out[k] = spGet(sp, k);
  return out;
}

export function pageParams(sp: SP, pageSize = 25) {
  const page = Math.max(1, Number(spGet(sp, "page") ?? 1) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const });
