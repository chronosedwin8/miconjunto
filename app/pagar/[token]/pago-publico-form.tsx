"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MedioSelector } from "@/components/pagos/medio-selector";
import { iniciarPagoPublicoAction } from "./actions";

const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Math.round(v));

export function PagoPublicoForm({ token, total, permitirAbonos }: { token: string; total: number; permitirAbonos: boolean }) {
  const [medio, setMedio] = useState("PSE");
  const [abonar, setAbonar] = useState(false);
  const [abono, setAbono] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const valorAbono = Number(abono.replace(/[^\d]/g, "")) || 0;
  const valor = abonar ? Math.min(valorAbono, total) : total;

  const pagar = () =>
    start(async () => {
      const r = await iniciarPagoPublicoAction({
        token,
        medio: medio as "PSE",
        modo: abonar ? "ABONO" : "TOTAL",
        valor: abonar ? String(valorAbono) : "",
        pagadorNombre: nombre,
        pagadorEmail: email,
      });
      if (!r.ok) return void toast.error(r.error);
      window.location.assign(r.data.url);
    });

  return (
    <div className="space-y-5">
      {permitirAbonos && (
        <div>
          <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={() => setAbonar(!abonar)}>
            {abonar ? "Pagar el saldo completo" : "Prefiero abonar otro valor"}
          </button>
          {abonar && (
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                inputMode="numeric"
                aria-label="Valor a abonar"
                value={abono}
                onChange={(e) => {
                  const d = e.target.value.replace(/[^\d]/g, "");
                  setAbono(d ? Number(d).toLocaleString("es-CO") : "");
                }}
                className="h-12 pl-7 text-lg tabular-nums"
                placeholder="0"
              />
            </div>
          )}
        </div>
      )}
      <section>
        <h2 className="mb-2 text-base font-semibold">Medio de pago</h2>
        <MedioSelector value={medio} onChange={setMedio} />
      </section>
      <details className="rounded-xl border bg-card p-3 text-sm">
        <summary className="min-h-8 cursor-pointer font-medium">Datos de quien paga (opcional)</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pn">Nombre</Label>
            <Input id="pn" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe">Correo para el recibo</Label>
            <Input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </div>
        </div>
      </details>
      <Button size="lg" className="h-14 w-full text-lg font-semibold" disabled={pending || valor <= 0} onClick={pagar}>
        {pending ? <Loader2 className="animate-spin" /> : <Lock className="size-5" />} Pagar {cop(valor)}
      </Button>
    </div>
  );
}
