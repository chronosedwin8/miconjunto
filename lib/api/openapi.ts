import fs from "node:fs";
import path from "node:path";

/**
 * Genera la especificación OpenAPI 3.1 recorriendo app/api/v1/** /route.ts. Toma el método exportado
 * (GET/POST/PATCH/PUT/DELETE), el permiso de `apiHandler({ perm })` y el comentario JSDoc previo.
 */
type Op = { method: string; path: string; summary: string; perm?: string };

function walk(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

export function escanearRutas(root = process.cwd()): Op[] {
  const base = path.join(root, "app", "api", "v1");
  const ops: Op[] = [];
  for (const file of walk(base)) {
    const rel = path.relative(base, path.dirname(file)).split(path.sep).filter(Boolean);
    const apiPath = "/api/v1/" + rel.map((s) => s.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}")).join("/");
    const src = fs.readFileSync(file, "utf8");
    const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export\s+(?:const|async function)\s+(GET|POST|PUT|PATCH|DELETE)\b([\s\S]*?)(?=\n(?:\/\*\*|export\s)|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const doc = (m[1] ?? "").replace(/^\s*\*\s?/gm, "").trim().split("\n")[0] ?? "";
      const perm = /perm:\s*(\[[^\]]*\]|"[^"]+")/.exec(m[3])?.[1]?.replace(/["[\]]/g, "");
      ops.push({ method: m[2].toLowerCase(), path: apiPath, summary: doc || `${m[2]} ${apiPath}`, perm });
    }
  }
  return ops.sort((a, b) => a.path.localeCompare(b.path));
}

export function openApiSpec() {
  const ops = escanearRutas();
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of ops) {
    const params = [...o.path.matchAll(/\{(\w+)\}/g)].map((x) => ({ name: x[1], in: "path", required: true, schema: { type: "string" } }));
    const tag = o.path.split("/")[3] ?? "general";
    paths[o.path] ??= {};
    paths[o.path][o.method] = {
      tags: [tag],
      summary: o.summary,
      description: o.perm ? `Permiso requerido: \`${o.perm}\`` : undefined,
      parameters: params.length ? params : undefined,
      ...(o.method !== "get" && o.method !== "delete" ? { requestBody: { content: { "application/json": { schema: { type: "object" } } } } } : {}),
      responses: {
        "200": { description: "OK — `{ data: ... }`" },
        "401": { description: "No autenticado" },
        "403": { description: "Sin permiso" },
        "422": { description: "Datos inválidos — `{ error, fieldErrors }`" },
      },
      security: [{ bearer: [] }, { session: [] }],
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "API de MiConjunto", version: "1.0.0", description: "API REST por conjunto. Autenticación con `Authorization: Bearer <token>` (Configuración → API y webhooks) o sesión del navegador. Todas las respuestas: `{ data }` o `{ error }`." },
    servers: [{ url: process.env.APP_URL ?? "http://localhost:3000" }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Token de API del conjunto (mc_...)" },
        session: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
      },
    },
    paths,
  };
}
