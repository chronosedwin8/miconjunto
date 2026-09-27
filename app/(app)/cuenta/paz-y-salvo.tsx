"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { solicitarPazYSalvoAction } from "./actions";

type Cert = { id: string; codigo: string; fecha: string; vigenteHasta: string };
type Resultado = { emitido: true; certificadoId: string } | { emitido: false; saldo: number; mensaje: string };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

/** Solicitud de paz y salvo: si la unidad está al día se emite y descarga; si no, muestra el saldo y el botón Pagar. */
export function PazYSalvoCard({ unidadId, certificados, puedePagar }: { unidadId: string; certificados: Cert[]; puedePagar: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Resultado | null>(null);
  const router = useRouter();
  const vigente = certificados[0];

  if (vigente) {
    return (
      <Button variant="outline" className="h-12 justify-start" render={<a href={`/cuenta/paz-y-salvo/${vigente.id}`} />}>
        <BadgeCheck className="text-success" /> Paz y salvo vigente hasta {fmt(vigente.vigenteHasta)}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-12 justify-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await solicitarPazYSalvoAction({ unidadId });
            if (!r.ok) return void toast.error(r.error);
            setRes(r.data as Resultado);
            if ((r.data as Resultado).emitido) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Solicitar paz y salvo
      </Button>
      <Dialog open={!!res} onOpenChange={(o) => !o && setRes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{res?.emitido ? "Paz y salvo emitido" : "Aún no podemos emitir tu paz y salvo"}</DialogTitle>
            <DialogDescription>
              {res?.emitido ? "Tu unidad está al día. Descarga el certificado con su código de verificación." : res?.mensaje}
            </DialogDescription>
          </DialogHeader>
          {res?.emitido ? (
            <Button className="h-12" render={<a href={`/cuenta/paz-y-salvo/${res.certificadoId}`} />}>
              <FileDown /> Descargar paz y salvo
            </Button>
          ) : res && res.saldo > 0 ? (
            <div className="space-y-3">
              <p className="text-sm">
                Saldo pendiente: <b className="tabular-nums">{cop(res.saldo)}</b>
              </p>
              {puedePagar && (
                <Button className="h-12 w-full" render={<Link href={`/cuenta/pagar?unidad=${unidadId}`} />}>
                  Pagar ahora
                </Button>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
