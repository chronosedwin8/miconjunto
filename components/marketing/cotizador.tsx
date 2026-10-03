"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { BadgePercent, Building2, CheckCircle2, ChevronDown, Download, Loader2, Minus, Plus, Send } from "lucide-react";
import {
  cop,
  cotizar,
  DESCUENTO_MULTI,
  MAX_CONJUNTOS_COTIZADOR,
  PLAN_LABEL,
  PRECIO_MULTI_POR_CONJUNTO,
  PRECIO_UNICO,
  UMBRAL_DESCUENTO,
} from "@/lib/comercial/precios";
import { solicitarCotizacionAction, type ResultadoCotizacion } from "@/app/(marketing)/precios/actions";
import { cn } from "@/lib/utils";

type Fila = { nombre: string; ciudad: string; unidades: string };
const MAX_FILAS_DETALLE = 50;
const RAPIDOS = [1, 2, 3, 4, 6, 10];

const input =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive md:text-sm";

/** Cotizador en vivo + solicitud de cotización formal. El precio final lo recalcula el servidor. */
export function Cotizador({ inicial = 1 }: { inicial?: number }) {
  const [n, setN] = useState(() => cotizar(inicial).cantidad);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [verDetalle, setVerDetalle] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Extract<ResultadoCotizacion, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const c = useMemo(() => cotizar(n), [n]);
  const id = useId();

  // ?conjuntos=N (enlaces desde los planes) fija la cantidad inicial sin volver dinámica la página.
  useEffect(() => {
    const q = Number(new URLSearchParams(window.location.search).get("conjuntos"));
    if (q > 0) setN(cotizar(q).cantidad);
  }, []);

  const fijar = (v: number) => setN(cotizar(v).cantidad);
  const filasVisibles = Array.from({ length: Math.min(n, MAX_FILAS_DETALLE) }, (_, i) => filas[i] ?? { nombre: "", ciudad: "", unidades: "" });
  const editarFila = (i: number, patch: Partial<Fila>) =>
    setFilas((fs) => {
      const a = [...fs];
      while (a.length <= i) a.push({ nombre: "", ciudad: "", unidades: "" });
      a[i] = { ...a[i], ...patch };
      return a;
    });

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "");
    setError(null);
    start(async () => {
      const r = await solicitarCotizacionAction({
        cantidad: n,
        conjuntos: filasVisibles.map((f) => ({ nombre: f.nombre || null, ciudad: f.ciudad || null, unidades: f.unidades ? Number(f.unidades) : null })),
        nombre: s("nombre"),
        cargo: s("cargo") || null,
        empresa: s("empresa") || null,
        nit: s("nit") || null,
        email: s("email"),
        telefono: s("telefono"),
        ciudad: s("ciudad") || null,
        mensaje: s("mensaje") || null,
        aceptaPolitica: fd.get("aceptaPolitica") === "on",
        sitioWeb: s("sitioWeb"),
      });
      if (r.ok) {
        setRes(r);
        setErrores({});
        document.getElementById("cotizador")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setError(r.error);
        setErrores(r.campos ?? {});
      }
    });
  };

  if (res) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border bg-card p-6 text-center shadow-xl sm:p-10" role="status">
        <CheckCircle2 className="mx-auto size-14 text-primary" aria-hidden />
        <h3 className="mt-4 text-2xl font-bold">¡Cotización {res.numero} enviada!</h3>
        <p className="mt-2 text-muted-foreground">
          Te enviamos el detalle por correo. Total anual: <strong className="text-foreground">{cop(res.total)}</strong>. Un asesor te contactará en menos de un
          día hábil.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={res.pdf}
            target="_blank"
            rel="noopener"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="size-4" aria-hidden /> Descargar PDF
          </a>
          <button
            type="button"
            onClick={() => setRes(null)}
            className="inline-flex h-12 items-center justify-center rounded-xl border px-5 font-semibold hover:bg-muted"
          >
            Hacer otra cotización
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <form onSubmit={enviar} className="space-y-6 rounded-3xl border bg-card p-5 shadow-sm sm:p-8" noValidate aria-describedby={`${id}-ayuda`}>
        {/* Paso 1: cantidad */}
        <fieldset className="min-w-0 space-y-4">
          <legend className="text-lg font-semibold">1. ¿Cuántos conjuntos quieres administrar?</legend>
          <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
            Con 1 conjunto aplica el plan Conjunto único. Desde 2 conjuntos, Multiconjunto a {cop(PRECIO_MULTI_POR_CONJUNTO)} cada uno, y con más de{" "}
            {UMBRAL_DESCUENTO}, {Math.round(DESCUENTO_MULTI * 100)} % de descuento.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border bg-background">
              <button
                type="button"
                onClick={() => fijar(n - 1)}
                disabled={n <= 1}
                className="grid size-12 place-items-center rounded-l-xl hover:bg-muted disabled:opacity-40"
                aria-label="Quitar un conjunto"
              >
                <Minus className="size-5" />
              </button>
              <label htmlFor={`${id}-n`} className="sr-only">
                Cantidad de conjuntos
              </label>
              <input
                id={`${id}-n`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CONJUNTOS_COTIZADOR}
                value={n}
                onChange={(e) => fijar(Number(e.target.value))}
                className="h-12 w-20 border-x bg-transparent text-center text-xl font-bold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => fijar(n + 1)}
                disabled={n >= MAX_CONJUNTOS_COTIZADOR}
                className="grid size-12 place-items-center rounded-r-xl hover:bg-muted disabled:opacity-40"
                aria-label="Agregar un conjunto"
              >
                <Plus className="size-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Cantidades rápidas">
              {RAPIDOS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => fijar(v)}
                  aria-pressed={n === v}
                  className={cn(
                    "h-10 min-w-10 rounded-full border px-3 text-sm font-medium tabular-nums",
                    n === v ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setVerDetalle((v) => !v)}
            aria-expanded={verDetalle}
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            <ChevronDown className={cn("size-4 transition-transform", verDetalle && "rotate-180")} aria-hidden />
            Detallar mis conjuntos (opcional)
          </button>
          {verDetalle && (
            <div className="space-y-2">
              <div className="hidden grid-cols-[2rem_1fr_10rem_7rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>#</span>
                <span>Nombre del conjunto</span>
                <span>Ciudad</span>
                <span>Unidades</span>
              </div>
              {filasVisibles.map((f, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr] gap-2 rounded-xl border p-2 sm:grid-cols-[2rem_1fr_10rem_7rem] sm:border-0 sm:p-0">
                  <span className="grid h-11 place-items-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  <input
                    className={input}
                    value={f.nombre}
                    onChange={(e) => editarFila(i, { nombre: e.target.value })}
                    placeholder="Conjunto Residencial…"
                    aria-label={`Nombre del conjunto ${i + 1}`}
                    maxLength={120}
                  />
                  <input
                    className={cn(input, "col-start-2 sm:col-start-auto")}
                    value={f.ciudad}
                    onChange={(e) => editarFila(i, { ciudad: e.target.value })}
                    placeholder="Ciudad"
                    aria-label={`Ciudad del conjunto ${i + 1}`}
                    maxLength={80}
                  />
                  <input
                    className={cn(input, "col-start-2 sm:col-start-auto")}
                    value={f.unidades}
                    onChange={(e) => editarFila(i, { unidades: e.target.value.replace(/\D/g, "") })}
                    inputMode="numeric"
                    placeholder="Unidades"
                    aria-label={`Unidades del conjunto ${i + 1}`}
                  />
                </div>
              ))}
              {n > MAX_FILAS_DETALLE && (
                <p className="text-xs text-muted-foreground">Mostramos los primeros {MAX_FILAS_DETALLE}; cuéntanos el resto en el mensaje.</p>
              )}
            </div>
          )}
        </fieldset>

        {/* Resumen en vivo: en el celular va justo después de elegir la cantidad */}
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.04] p-5 lg:hidden" aria-live="polite" aria-label="Resumen de la cotización">
          <Resumen c={c} fijar={fijar} />
        </div>

        {/* Paso 2: datos de contacto */}
        <fieldset className="min-w-0 space-y-4 border-t pt-6">
          <legend className="text-lg font-semibold">2. ¿A quién le enviamos la cotización?</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre completo *" name="nombre" error={errores.nombre} autoComplete="name" />
            <Campo label="Cargo" name="cargo" placeholder="Administrador(a), gerente…" autoComplete="organization-title" />
            <Campo label="Correo electrónico *" name="email" type="email" error={errores.email} autoComplete="email" />
            <Campo label="Celular *" name="telefono" type="tel" error={errores.telefono} autoComplete="tel" placeholder="300 123 4567" />
            <Campo label="Empresa o administración" name="empresa" autoComplete="organization" />
            <Campo label="NIT" name="nit" />
            <Campo label="Ciudad" name="ciudad" autoComplete="address-level2" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-mensaje`} className="text-sm font-medium">
              Mensaje (opcional)
            </label>
            <textarea
              id={`${id}-mensaje`}
              name="mensaje"
              rows={3}
              maxLength={1500}
              className={cn(input, "h-auto py-2")}
              placeholder="Cuéntanos qué necesitas o cuándo quieres empezar."
            />
          </div>
          {/* Campo trampa anti-bots */}
          <div className="hidden" aria-hidden>
            <label>
              Sitio web <input name="sitioWeb" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="aceptaPolitica" className="mt-0.5 size-5 shrink-0" aria-invalid={!!errores.aceptaPolitica} />
            <span>
              Acepto la{" "}
              <Link href="/politica-datos" className="font-medium text-primary underline underline-offset-2" target="_blank">
                política de tratamiento de datos
              </Link>{" "}
              y que me contacten sobre esta cotización.
              {errores.aceptaPolitica && <span className="block text-destructive">{errores.aceptaPolitica}</span>}
            </span>
          </label>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-70 sm:w-auto"
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />} Solicitar cotización formal
          </button>
        </fieldset>
      </form>

      {/* Resumen en vivo: panel fijo en escritorio */}
      <aside
        className="hidden rounded-3xl border-2 border-primary/30 bg-primary/[0.04] p-6 lg:sticky lg:top-24 lg:block"
        aria-live="polite"
        aria-label="Resumen de la cotización"
      >
        <Resumen c={c} fijar={fijar} />
      </aside>
    </div>
  );
}

function Resumen({ c, fijar }: { c: ReturnType<typeof cotizar>; fijar: (v: number) => void }) {
  return (
    <>
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Building2 className="size-4" aria-hidden /> Plan {PLAN_LABEL[c.plan]}
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {c.cantidad} {c.cantidad === 1 ? "conjunto" : "conjuntos"} × {cop(c.precioUnitario)}
          </dt>
          <dd className="font-medium tabular-nums">{cop(c.subtotal)}</dd>
        </div>
        {c.descuento > 0 && (
          <div className="flex justify-between gap-3 text-primary">
            <dt className="flex items-center gap-1.5">
              <BadgePercent className="size-4" aria-hidden /> Descuento {Math.round(c.descuentoPct * 100)} %
            </dt>
            <dd className="font-semibold tabular-nums">− {cop(c.descuento)}</dd>
          </div>
        )}
        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">Total anual</dt>
          <dd className="text-3xl font-extrabold tracking-tight tabular-nums">{cop(c.total)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-right text-xs text-muted-foreground">{cop(Math.round(c.total / c.cantidad))} por conjunto al año</p>
      {c.ahorroVsUnico > 0 && (
        <p className="mt-4 rounded-xl bg-background px-3 py-2 text-sm">
          Ahorras <strong className="text-primary">{cop(c.ahorroVsUnico)}</strong> frente a contratar cada conjunto por separado ({cop(PRECIO_UNICO)} c/u).
        </p>
      )}
      {c.plan === "UNICO" && (
        <p className="mt-4 rounded-xl bg-background px-3 py-2 text-sm">
          Con 2 o más conjuntos pasas a Multiconjunto y cada uno queda en {cop(PRECIO_MULTI_POR_CONJUNTO)}.
        </p>
      )}
      {c.plan === "MULTI" && c.faltanParaDescuento > 0 && (
        <button
          type="button"
          onClick={() => fijar(UMBRAL_DESCUENTO + 1)}
          className="mt-4 w-full rounded-xl border border-dashed border-primary/50 bg-background px-3 py-2 text-left text-sm hover:bg-primary/5"
        >
          Agrega {c.faltanParaDescuento} {c.faltanParaDescuento === 1 ? "conjunto" : "conjuntos"} más y obtén {Math.round(DESCUENTO_MULTI * 100)} % de descuento
          en toda la factura.
        </button>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Pago anual anticipado. Valores en pesos colombianos.</p>
    </>
  );
}

function Campo({
  label,
  name,
  error,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-e` : undefined}
        className={input}
      />
      {error && (
        <p id={`${id}-e`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
