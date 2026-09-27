"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnyAction } from "@/components/form/action-form";

type Opt = { value: string; label: string; group?: string };
type Def = {
  torres?: string[];
  incluirSinTorre?: boolean;
  pisoMin?: number | null;
  pisoMax?: number | null;
  numeroDesde?: number | null;
  numeroHasta?: number | null;
  unidades?: string[];
  roles?: string[];
  vinculos?: string[];
  cartera?: "AL_DIA" | "EN_MORA" | null;
  ocupacion?: string[];
  conMascotas?: boolean;
  conVehiculos?: boolean;
  conMenores?: boolean;
  adultosMayores?: boolean;
  movilidadReducida?: boolean;
};
type Conteo = { unidades: number | null; usuarios: number; correos: number };

const VINCULOS: Opt[] = [
  { value: "PROPIETARIO", label: "Propietarios" },
  { value: "COPROPIETARIO", label: "Copropietarios" },
  { value: "ARRENDATARIO", label: "Arrendatarios" },
  { value: "RESIDENTE", label: "Residentes" },
  { value: "FAMILIAR", label: "Familiares" },
];
const OCUPACION: Opt[] = [
  { value: "PROPIETARIO_OCUPA", label: "Ocupada por propietario" },
  { value: "ARRENDADA", label: "Arrendada" },
  { value: "AIRBNB_O_SIMILAR", label: "Renta corta" },
  { value: "DESOCUPADA", label: "Desocupada" },
  { value: "EN_VENTA", label: "En venta" },
];
const BANDERAS: { key: keyof Def; label: string }[] = [
  { key: "conMascotas", label: "Con mascotas" },
  { key: "conVehiculos", label: "Con vehículos" },
  { key: "conMenores", label: "Con menores de edad" },
  { key: "adultosMayores", label: "Con adultos mayores (60+)" },
  { key: "movilidadReducida", label: "Con movilidad reducida" },
];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("h-9 shrink-0 rounded-full border px-3 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
    >
      {children}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-muted-foreground">{titulo}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));

function limpiar(d: Def): Def {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out as Def;
}

/**
 * Constructor de segmentos con chips y selects + conteo de destinatarios en vivo.
 * Envía `name` (JSON de la definición) y, si se usa un segmento guardado, `segmentoName`.
 */
export function SegmentoBuilder({
  name = "definicion",
  segmentoName,
  segmentos = [],
  opciones,
  contar,
  defaultDef,
  defaultSegmentoId,
  permitirTodos = true,
  etiquetaTodos = "Todo el conjunto",
}: {
  name?: string;
  segmentoName?: string;
  segmentos?: { value: string; label: string }[];
  opciones: { torres: Opt[]; unidades: Opt[]; roles: Opt[] };
  contar: AnyAction;
  defaultDef?: Def | null;
  defaultSegmentoId?: string | null;
  permitirTodos?: boolean;
  etiquetaTodos?: string;
}) {
  const inicialDef = limpiar(defaultDef ?? {});
  const [modo, setModo] = useState<"todos" | "guardado" | "personalizado">(
    defaultSegmentoId && segmentoName ? "guardado" : Object.keys(inicialDef).length || !permitirTodos ? "personalizado" : "todos",
  );
  const [segId, setSegId] = useState(defaultSegmentoId ?? "");
  const [def, setDef] = useState<Def>(inicialDef);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [cargando, setCargando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const efectiva = useMemo(() => (modo === "personalizado" ? limpiar(def) : {}), [modo, def]);
  const segmentoEfectivo = modo === "guardado" ? segId : "";

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (modo === "guardado" && !segId) {
      setConteo(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setCargando(true);
      const r = await contar(segmentoEfectivo ? { segmentoId: segmentoEfectivo } : { definicion: JSON.stringify(efectiva) });
      setCargando(false);
      if (r.ok) setConteo(r.data as Conteo);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [efectiva, segmentoEfectivo, modo, segId, contar]);

  const toggle = (k: "torres" | "roles" | "vinculos" | "ocupacion" | "unidades", v: string) =>
    setDef((d) => {
      const cur = new Set((d[k] as string[] | undefined) ?? []);
      if (cur.has(v)) cur.delete(v);
      else cur.add(v);
      return { ...d, [k]: [...cur] };
    });
  const unidadLabel = new Map(opciones.unidades.map((u) => [u.value, u.label]));

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(efectiva)} />
      {segmentoName && <input type="hidden" name={segmentoName} value={segmentoEfectivo} />}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="Destinatarios">
        {permitirTodos && (
          <Chip on={modo === "todos"} onClick={() => setModo("todos")}>
            {etiquetaTodos}
          </Chip>
        )}
        {segmentoName && segmentos.length > 0 && (
          <Chip on={modo === "guardado"} onClick={() => setModo("guardado")}>
            Segmento guardado
          </Chip>
        )}
        <Chip on={modo === "personalizado"} onClick={() => setModo("personalizado")}>
          Personalizado
        </Chip>
      </div>

      {modo === "guardado" && (
        <select value={segId} onChange={(e) => setSegId(e.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-base md:text-sm" aria-label="Segmento guardado">
          <option value="">Selecciona un segmento…</option>
          {segmentos.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      {modo === "personalizado" && (
        <div className="space-y-4 rounded-xl border bg-muted/30 p-3">
          {opciones.torres.length > 0 && (
            <Grupo titulo="Torres">
              {opciones.torres.map((t) => (
                <Chip key={t.value} on={!!def.torres?.includes(t.value)} onClick={() => toggle("torres", t.value)}>
                  {t.label}
                </Chip>
              ))}
              {!!def.torres?.length && (
                <Chip on={!!def.incluirSinTorre} onClick={() => setDef((d) => ({ ...d, incluirSinTorre: !d.incluirSinTorre }))}>
                  + Casas
                </Chip>
              )}
            </Grupo>
          )}
          <div className="grid grid-cols-2 gap-3">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">Pisos</legend>
              <div className="flex items-center gap-1.5">
                <input aria-label="Desde el piso" inputMode="numeric" placeholder="Desde" value={def.pisoMin ?? ""} onChange={(e) => setDef((d) => ({ ...d, pisoMin: numOrNull(e.target.value) }))} className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm" />
                <span className="text-muted-foreground">a</span>
                <input aria-label="Hasta el piso" inputMode="numeric" placeholder="Hasta" value={def.pisoMax ?? ""} onChange={(e) => setDef((d) => ({ ...d, pisoMax: numOrNull(e.target.value) }))} className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm" />
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">Número de unidad</legend>
              <div className="flex items-center gap-1.5">
                <input aria-label="Desde la unidad número" inputMode="numeric" placeholder="101" value={def.numeroDesde ?? ""} onChange={(e) => setDef((d) => ({ ...d, numeroDesde: numOrNull(e.target.value) }))} className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm" />
                <span className="text-muted-foreground">a</span>
                <input aria-label="Hasta la unidad número" inputMode="numeric" placeholder="404" value={def.numeroHasta ?? ""} onChange={(e) => setDef((d) => ({ ...d, numeroHasta: numOrNull(e.target.value) }))} className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm" />
              </div>
            </fieldset>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Unidades específicas</legend>
            <select
              aria-label="Agregar unidad"
              value=""
              onChange={(e) => e.target.value && toggle("unidades", e.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-base md:text-sm"
            >
              <option value="">Agregar unidad…</option>
              {[...new Set(opciones.unidades.map((u) => u.group ?? ""))].map((g) => (
                <optgroup key={g} label={g}>
                  {opciones.unidades
                    .filter((u) => (u.group ?? "") === g && !def.unidades?.includes(u.value))
                    .map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {!!def.unidades?.length && (
              <div className="flex flex-wrap gap-1.5">
                {def.unidades.map((u) => (
                  <button key={u} type="button" onClick={() => toggle("unidades", u)} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/10 px-3 text-sm text-primary" aria-label={`Quitar ${unidadLabel.get(u)}`}>
                    {unidadLabel.get(u) ?? "Unidad"} <X className="size-3.5" />
                  </button>
                ))}
              </div>
            )}
          </fieldset>
          <Grupo titulo="Tipo de vínculo (quién recibe)">
            {VINCULOS.map((v) => (
              <Chip key={v.value} on={!!def.vinculos?.includes(v.value)} onClick={() => toggle("vinculos", v.value)}>
                {v.label}
              </Chip>
            ))}
          </Grupo>
          <Grupo titulo="Estado de cartera">
            <Chip on={!def.cartera} onClick={() => setDef((d) => ({ ...d, cartera: null }))}>
              Todos
            </Chip>
            <Chip on={def.cartera === "AL_DIA"} onClick={() => setDef((d) => ({ ...d, cartera: "AL_DIA" }))}>
              Al día
            </Chip>
            <Chip on={def.cartera === "EN_MORA"} onClick={() => setDef((d) => ({ ...d, cartera: "EN_MORA" }))}>
              En mora
            </Chip>
          </Grupo>
          <Grupo titulo="Ocupación de la unidad">
            {OCUPACION.map((o) => (
              <Chip key={o.value} on={!!def.ocupacion?.includes(o.value)} onClick={() => toggle("ocupacion", o.value)}>
                {o.label}
              </Chip>
            ))}
          </Grupo>
          <Grupo titulo="Características del hogar">
            {BANDERAS.map((b) => (
              <Chip key={b.key} on={!!def[b.key]} onClick={() => setDef((d) => ({ ...d, [b.key]: !d[b.key] }))}>
                {b.label}
              </Chip>
            ))}
          </Grupo>
          {opciones.roles.length > 0 && (
            <Grupo titulo="Rol en la aplicación">
              {opciones.roles.map((r) => (
                <Chip key={r.value} on={!!def.roles?.includes(r.value)} onClick={() => toggle("roles", r.value)}>
                  {r.label}
                </Chip>
              ))}
            </Grupo>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm backdrop-blur" aria-live="polite">
        {cargando ? <Loader2 className="size-4 animate-spin text-primary" /> : <Users className="size-4 text-primary" />}
        {conteo ? (
          <span>
            <b className="tabular-nums">{conteo.usuarios}</b> usuarios · <b className="tabular-nums">{conteo.correos}</b> correos
            {conteo.unidades !== null && (
              <>
                {" "}
                · <b className="tabular-nums">{conteo.unidades}</b> unidades
              </>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{modo === "guardado" && !segId ? "Elige un segmento" : "Calculando destinatarios…"}</span>
        )}
      </div>
    </div>
  );
}
