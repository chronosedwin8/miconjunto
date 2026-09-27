import { openApiSpec } from "@/lib/api/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Documentación legible de la API (HTML autocontenido, sin scripts externos por la CSP). */
export function GET() {
  const spec = openApiSpec();
  const grupos = new Map<string, string[]>();
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(methods as Record<string, { tags: string[]; summary: string; description?: string }>)) {
      const tag = op.tags[0];
      const color = { get: "#2a78d6", post: "#1baf7a", patch: "#eda100", put: "#eda100", delete: "#e34948" }[m] ?? "#666";
      const html = `<li><span class="m" style="background:${color}">${m.toUpperCase()}</span><code>${esc(p)}</code><p>${esc(op.summary)}${op.description ? `<br><small>${esc(op.description).replace(/`([^`]+)`/g, "<code>$1</code>")}</small>` : ""}</p></li>`;
      grupos.set(tag, [...(grupos.get(tag) ?? []), html]);
    }
  }
  const body = [...grupos.entries()].map(([t, items]) => `<h2>${esc(t)}</h2><ul>${items.join("")}</ul>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API de MiConjunto</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:900px;margin:0 auto;padding:24px 16px;color:#18181b;background:#fcfcfb}h1{margin:0 0 4px}h2{margin-top:28px;border-bottom:1px solid #e4e4e7;padding-bottom:4px;text-transform:capitalize}ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #f1f1f1}code{font-size:14px}.m{display:inline-block;min-width:64px;text-align:center;color:#fff;border-radius:6px;font-size:12px;font-weight:700;padding:2px 6px;margin-right:8px}p{margin:4px 0 0;color:#52514e}small{color:#898781}@media(prefers-color-scheme:dark){body{background:#1a1a19;color:#fff}p{color:#c3c2b7}li{border-color:#2c2c2a}h2{border-color:#383835}}</style></head>
<body><h1>API REST de MiConjunto</h1><p>${esc(spec.info.description)}</p><p>Especificación OpenAPI 3.1: <a href="/api/docs/openapi.json">/api/docs/openapi.json</a></p>${body || "<p>Sin endpoints.</p>"}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
