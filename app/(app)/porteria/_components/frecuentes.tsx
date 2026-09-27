"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FileField, FormGrid, TextField } from "@/components/form/fields";
import { cn } from "@/lib/utils";
import { conRespaldoOffline } from "@/lib/porteria/offline";
import { crearSolicitudAction, ingresoFrecuenteAction } from "../actions";
import { Alerta, Foto, bigBtn } from "./kiosk";

export type FrecuenteVista = { vinculoId: string; nombre: string; tipoLabel: string; fotoUrl: string | null; horario: string; permitido: boolean; alertas: string[]; estado: string };

/** Frecuentes de la unidad: ingreso con UN toque; alerta si está fuera de horario o inactivo (requiere confirmar). */
export function FrecuentesLista({ items }: { items: FrecuenteVista[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmar, setConfirmar] = useState<FrecuenteVista | null>(null);
  const [hecho, setHecho] = useState<Set<string>>(new Set());
  const ingresar = (f: FrecuenteVista, forzar = false) =>
    start(async () => {
      const r = await conRespaldoOffline({ tipo: "INGRESO_FRECUENTE", payload: { vinculoId: f.vinculoId, forzar }, descripcion: `Ingreso de ${f.nombre}` }, (p) => ingresoFrecuenteAction(p as never));
      setConfirmar(null);
      if ("offline" in r && r.offline) {
        toast.warning(`Sin conexión: ingreso de ${f.nombre} guardado para sincronizar.`);
        setHecho((s) => new Set(s).add(f.vinculoId));
        return;
      }
      if (r.ok) {
        toast.success(`Ingreso de ${f.nombre} registrado`);
        setHecho((s) => new Set(s).add(f.vinculoId));
        router.refresh();
      } else toast.error(r.error);
    });
  if (!items.length) return <p className="rounded-2xl border-2 border-dashed p-4 text-base text-muted-foreground">La unidad no tiene empleados, cuidadores ni visitantes frecuentes registrados.</p>;
  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((f) => (
          <li key={f.vinculoId}>
            <button
              type="button"
              disabled={pending || hecho.has(f.vinculoId)}
              onClick={() => (f.permitido ? ingresar(f) : setConfirmar(f))}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition active:scale-[0.99] disabled:opacity-60",
                f.permitido ? "border-green-700/60 bg-card hover:bg-green-50 dark:hover:bg-green-950/30" : "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
              )}
            >
              <Foto src={f.fotoUrl} alt={f.nombre} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{f.nombre}</span>
                <span className="block text-sm font-medium text-foreground/75">
                  {f.tipoLabel} · {f.horario}
                </span>
                {!f.permitido && (
                  <span className="mt-0.5 flex items-start gap-1 text-sm font-bold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {f.alertas[0]}
                  </span>
                )}
              </span>
              <span className={cn("grid size-14 shrink-0 place-items-center rounded-xl", hecho.has(f.vinculoId) ? "bg-green-700 text-white" : f.permitido ? "bg-primary text-primary-foreground" : "bg-amber-500 text-amber-950")}>
                {hecho.has(f.vinculoId) ? <CheckCircle2 className="size-7" /> : pending ? <Loader2 className="size-6 animate-spin" /> : <LogIn className="size-7" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">¿Permitir el ingreso?</DialogTitle>
            <DialogDescription className="text-base">{confirmar?.nombre}</DialogDescription>
          </DialogHeader>
          {confirmar?.alertas.map((a) => (
            <Alerta key={a} tono="amber">
              ⚠️ {a}
            </Alerta>
          ))}
          <p className="text-base">Si el residente lo autorizó por otro medio, puedes registrar el ingreso; quedará anotado en la bitácora.</p>
          <div className="grid gap-2">
            <Button className={cn(bigBtn, "bg-amber-500 text-amber-950 hover:bg-amber-400")} disabled={pending} onClick={() => confirmar && ingresar(confirmar, true)}>
              Sí, registrar con la alerta
            </Button>
            <Button className={bigBtn} variant="outline" onClick={() => setConfirmar(null)}>
              No permitir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Notificar al residente": crea la solicitud y envía push con Autorizar/Rechazar. */
export function NotificarResidente({ unidadId, unidad }: { unidadId: string; unidad: string }) {
  const router = useRouter();
  return (
    <ActionForm
      action={crearSolicitudAction}
      extra={{ unidadId }}
      submitLabel={`Notificar al residente de ${unidad}`}
      submitClassName={`${bigBtn} w-full`}
      onDone={(d) => {
        const n = (d as { destinatarios: number }).destinatarios;
        if (n === 0) toast.warning("La unidad no tiene usuarios con la aplicación: llama al residente y registra la decisión.");
        else toast.success(`Notificamos a ${n} persona(s). La respuesta llegará aquí en tiempo real.`, { icon: <BellRing className="size-4" /> });
        router.push("/porteria");
      }}
      refresh={false}
    >
      <ChoiceCards
        name="tipo"
        columns={3}
        defaultValue="VISITA"
        options={[
          { value: "VISITA", label: "Visita" },
          { value: "DOMICILIO", label: "Domicilio" },
          { value: "TECNICO", label: "Técnico" },
        ]}
      />
      <FormGrid>
        <TextField name="visitanteNombre" label="Nombre del visitante" required className="[&_input]:h-14 [&_input]:text-lg" />
        <TextField name="visitanteDocumento" label="Documento" inputMode="numeric" className="[&_input]:h-14 [&_input]:text-lg" />
      </FormGrid>
      <FormGrid>
        <TextField name="placa" label="Placa (si viene en vehículo)" className="[&_input]:h-14 [&_input]:font-mono [&_input]:text-lg [&_input]:uppercase" />
        <FileField name="fotoUrl" label="Foto (opcional)" folder="porteria" />
      </FormGrid>
    </ActionForm>
  );
}
