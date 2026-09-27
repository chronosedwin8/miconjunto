/**
 * FactusProvider — facturación electrónica con la API v2 de Factus (https://developers.factus.com.co).
 *
 * - OAuth2 password grant en `POST {baseUrl}/oauth/token` (form-data) → access_token (1 h) + refresh_token.
 *   El token se cachea por conjunto y se renueva con `grant_type=refresh_token` antes de vencer.
 * - `POST /v2/bills/validate` y `POST /v2/credit-notes/validate`.
 * - Descargas en base64: `GET /v2/bills/{number}/download-pdf` y `/download-xml` (con respaldo a la
 *   ruta antigua `/v2/bills/download-pdf/{number}`).
 * - Errores: reintentos con backoff exponencial (red, 429, 5xx); 401 renueva el token; 409 (documento
 *   pendiente por enviar a la DIAN) → `DELETE /v2/bills/destroy/reference/{reference_code}` y reintenta.
 */
import type { Archivo, DatosFactura, DatosNotaCredito, ElectronicInvoiceProvider, ResultadoEmision } from "./tipos";
import { construirPayloadFactus, construirPayloadNotaCreditoFactus, leerRespuestaFactus } from "./payload";

export type FactusCredenciales = {
  baseUrl?: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  numberingRangeId?: string;
};

type Token = { access: string; refresh?: string; expira: number };
const g = globalThis as unknown as { __factusTokens?: Map<string, Token> };
const tokens: Map<string, Token> = (g.__factusTokens ??= new Map());

/** Opciones de red (las pruebas pueden inyectar `fetch` y quitar las esperas). */
export type FactusOpciones = { fetch?: typeof fetch; esperaBaseMs?: number; intentos?: number };

export class FactusError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

export class FactusProvider implements ElectronicInvoiceProvider {
  readonly nombre = "FACTUS" as const;
  private base: string;
  private f: typeof fetch;
  private espera: number;
  private intentos: number;

  constructor(
    private tenantKey: string,
    private cred: FactusCredenciales,
    opts: FactusOpciones = {},
  ) {
    this.base = (cred.baseUrl || "https://api-sandbox.factus.com.co").replace(/\/+$/, "");
    this.f = opts.fetch ?? fetch;
    this.espera = opts.esperaBaseMs ?? 800;
    this.intentos = opts.intentos ?? 3;
  }

  private get cacheKey() {
    return `${this.tenantKey}:${this.cred.clientId}:${this.cred.username}`;
  }

  private async pedirToken(form: Record<string, string>) {
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) body.append(k, v);
    const r = await this.f(`${this.base}/oauth/token`, { method: "POST", headers: { Accept: "application/json" }, body, signal: AbortSignal.timeout(20000) });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string };
    if (!r.ok || !j.access_token) throw new FactusError(`Factus rechazó la autenticación (${r.status}): ${j.message ?? "credenciales inválidas"}`, r.status, j);
    const t: Token = { access: j.access_token, refresh: j.refresh_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 };
    tokens.set(this.cacheKey, t);
    return t.access;
  }

  /** Token vigente (cacheado por conjunto); renueva con refresh_token o vuelve a autenticar. */
  async token(forzar = false): Promise<string> {
    const t = tokens.get(this.cacheKey);
    if (t && !forzar && t.expira > Date.now()) return t.access;
    if (t?.refresh) {
      try {
        return await this.pedirToken({ grant_type: "refresh_token", client_id: this.cred.clientId, client_secret: this.cred.clientSecret, refresh_token: t.refresh });
      } catch {
        /* cae al password grant */
      }
    }
    return this.pedirToken({ grant_type: "password", client_id: this.cred.clientId, client_secret: this.cred.clientSecret, username: this.cred.username, password: this.cred.password });
  }

  /** Llamada autenticada con reintentos y backoff. */
  async request(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    let ultimo: unknown = null;
    let renovado = false;
    for (let intento = 0; intento < this.intentos; intento++) {
      try {
        const token = await this.token();
        const r = await this.f(`${this.base}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const json = await r.json().catch(() => ({}));
        if (r.status === 401 && !renovado) {
          renovado = true;
          tokens.delete(this.cacheKey);
          intento--;
          continue;
        }
        if (r.status === 429 || r.status >= 500) {
          ultimo = new FactusError(`Factus respondió ${r.status}`, r.status, json);
          await this.dormir(intento);
          continue;
        }
        return { status: r.status, json };
      } catch (e) {
        if (e instanceof FactusError && e.status > 0 && e.status < 500 && e.status !== 429) throw e;
        ultimo = e;
        await this.dormir(intento);
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error("No fue posible comunicarse con Factus");
  }

  private dormir(intento: number) {
    const ms = this.espera * 2 ** intento;
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  private async validar(ruta: string, destroy: string, payload: Record<string, unknown>): Promise<ResultadoEmision> {
    let res = await this.request("POST", ruta, payload);
    if (res.status === 409) {
      // Documento pendiente por enviar a la DIAN: se elimina por referencia y se vuelve a crear.
      await this.request("DELETE", `${destroy}/${encodeURIComponent(String(payload.reference_code))}`);
      res = await this.request("POST", ruta, payload);
    }
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      const j = res.json as { message?: string; data?: { errors?: unknown }; errors?: unknown };
      return {
        ok: false,
        validada: false,
        payload,
        respuesta: res.json,
        errores: j?.data?.errors ?? j?.errors ?? j?.message ?? `HTTP ${res.status}`,
        mensaje: j?.message ?? `Factus respondió ${res.status}`,
        reintentable: res.status === 409 || res.status === 429 || res.status >= 500,
      };
    }
    const d = leerRespuestaFactus(res.json);
    return { ok: d.validada, ...d, payload, respuesta: res.json, mensaje: d.validada ? "Validada por la DIAN" : "La DIAN no validó el documento" };
  }

  async emitirFactura(datos: DatosFactura) {
    return this.validar("/v2/bills/validate", "/v2/bills/destroy/reference", construirPayloadFactus(datos));
  }

  async notaCredito(datos: DatosNotaCredito) {
    return this.validar("/v2/credit-notes/validate", "/v2/credit-notes/destroy/reference", construirPayloadNotaCreditoFactus(datos));
  }

  private async descargar(numero: string, tipo: "FACTURA" | "NOTA_CREDITO", formato: "pdf" | "xml"): Promise<Archivo | null> {
    const recurso = tipo === "FACTURA" ? "bills" : "credit-notes";
    const rutas = [`/v2/${recurso}/${encodeURIComponent(numero)}/download-${formato}`, `/v2/${recurso}/download-${formato}/${encodeURIComponent(numero)}`];
    for (const ruta of rutas) {
      const r = await this.request("GET", ruta);
      if (r.status >= 400) continue;
      const data = ((r.json as { data?: Record<string, string> })?.data ?? {}) as Record<string, string>;
      const b64 = data[`${formato}_base_64_encoded`] ?? data[`${formato}_base64_encoded`] ?? data.file ?? data.content;
      if (!b64) continue;
      const nombre = `${data.file_name ?? numero}.${formato}`;
      return { nombre, contenido: Buffer.from(b64, "base64"), mime: formato === "pdf" ? "application/pdf" : "application/xml" };
    }
    return null;
  }

  descargarPdf(numero: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    return this.descargar(numero, tipo, "pdf");
  }

  descargarXml(numero: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    return this.descargar(numero, tipo, "xml");
  }

  async eliminarPendiente(referenceCode: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    const r = await this.request("DELETE", `/v2/${tipo === "FACTURA" ? "bills" : "credit-notes"}/destroy/reference/${encodeURIComponent(referenceCode)}`);
    return r.status >= 200 && r.status < 300;
  }
}

/** Limpia la caché de tokens (pruebas). */
export function _limpiarTokensFactus() {
  tokens.clear();
}
