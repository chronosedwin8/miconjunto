"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MedioSelector } from "@/components/pagos/medio-selector";
import { iniciarPagoAction } from "../actions";

export type CuotaForm = {
  id: string;
  descripcion: string;
  vence: string;
  saldo: number;
  valorHoy: number;
  descuento: number;
  diasMora: number;
  prontoPago: string | null;
};

const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Math.round(v));
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });

/** Flujo de pago en ≤ 3 toques: cuotas (preseleccionadas) → medio (PSE por defecto) → Pagar. */
export function PagarForm({
  unidadId,
  cuotas,
  preseleccion,
  permitirAbonos,
  pasarela,
  origen,
}: {
  unidadId: string;
  cuotas: CuotaForm[];
  preseleccion: string[];
  permitirAbonos: boolean;
  pasarela: string;
  origen: string | null;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(preseleccion));
  const [modo, setModo] = useState<"CUOTAS" | "ABONO">("CUOTAS");
  const [abono, setAbono] = useState("");
  const [medio, setMedio] = useState("PSE");
  const [pending, start] = useTransition();

  const totalCuotas = useMemo(() => cuotas.filter((c) => sel.has(c.id)).reduce((a, c) => a + c.valorHoy, 0), [cuotas, sel]);
  const ahorro = useMemo(() => cuotas.filter((c) => sel.has(c.id)).reduce((a, c) => a + c.descuento, 0), [cuotas, sel]);
  const totalDeuda = cuotas.reduce((a, c) => a + c.valorHoy, 0);
  const valorAbono = Number(abono.replace(/[^\d]/g, "")) || 0;
  const total = modo === "ABONO" ? Math.min(valorAbono, totalDeuda) : totalCuotas;
  const todas = sel.size === cuotas.length;

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pagar = () =>
    start(async () => {
      const r = await iniciarPagoAction({
        unidadId,
        modo,
        cuotaIds: [...sel],
        valor: modo === "ABONO" ? String(valorAbono) : "",
        medio: medio as "PSE",
        origen: origen ?? "",
      });
      if (!r.ok) return void toast.error(r.error);
      window.location.assign(r.data.url);
    });

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">¿Qué quieres pagar?</h2>
          {modo === "CUOTAS" && cuotas.length > 1 && (
            <button
              type="button"
              className="min-h-11 px-2 text-sm font-medium text-primary"
              onClick={() => setSel(todas ? new Set() : new Set(cuotas.map((c) => c.id)))}
            >
              {todas ? "Quitar todas" : "Pagar todo"}
            </button>
          )}
        </div>
        {modo === "CUOTAS" ? (
          <ul className="divide-y rounded-xl border bg-card">
            {cuotas.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-16 cursor-pointer items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={sel.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-5 shrink-0 accent-[var(--brand)]"
                    aria-label={c.descripcion}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.descripcion}</span>
                    <span className="block text-xs text-muted-foreground">
                      Vence {fecha(c.vence)}
                      {c.diasMora > 0 && <span className="text-destructive"> · vencida hace {c.diasMora} días</span>}
                    </span>
                    {c.descuento > 0 && c.prontoPago && (
                      <span className="block text-xs font-medium text-success">
                        Descuento pronto pago hasta {fecha(c.prontoPago)}: −{cop(c.descuento)}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{cop(c.valorHoy)}</span>
                    {c.descuento > 0 && <span className="block text-xs text-muted-foreground line-through">{cop(c.saldo)}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border bg-card p-4">
            <label htmlFor="abono" className="text-sm font-medium">
              Valor a abonar
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="abono"
                inputMode="numeric"
                autoFocus
                value={abono}
                onChange={(e) => {
                  const d = e.target.value.replace(/[^\d]/g, "");
                  setAbono(d ? Number(d).toLocaleString("es-CO") : "");
                }}
                className="h-12 pl-7 text-lg tabular-nums"
                placeholder="0"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tu saldo es {cop(totalDeuda)}. El abono se aplica primero a intereses y a las cuotas más antiguas.
            </p>
          </div>
        )}
        {permitirAbonos && (
          <button type="button" className="mt-2 min-h-11 text-sm font-medium text-primary" onClick={() => setModo(modo === "CUOTAS" ? "ABONO" : "CUOTAS")}>
            {modo === "CUOTAS" ? "Prefiero abonar otro valor" : "Volver a elegir cuotas"}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Medio de pago</h2>
        <MedioSelector value={medio} onChange={setMedio} />
      </section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total a pagar</p>
            <p className="text-xl font-bold tabular-nums">{cop(total)}</p>
            {modo === "CUOTAS" && ahorro > 0 && <p className="truncate text-xs font-medium text-success">Ahorras {cop(ahorro)}</p>}
          </div>
          <Button size="lg" className="h-12 shrink-0 px-6 text-base font-semibold" disabled={pending || total <= 0} onClick={pagar}>
            {pending ? <Loader2 className="animate-spin" /> : <Lock className="size-5" />} Pagar
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Pago seguro con {pasarela}. Te llevaremos a su página para terminar.</p>
    </div>
  );
}
