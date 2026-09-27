"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MapPin, QrCode, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registrarAsistenciaPropiaAction } from "../actions";

type Unidad = { unidadId: string; codigo: string; coeficiente: number; poderId: string | null; otorgante: string | null; registrada: boolean; tipo: string | null };

/** Registro de asistencia del propio usuario: presencial (código del QR de la sala) o virtual. */
export function AsistenciaPropia({ asambleaId, modalidad, unidades, codigoInicial, habilitado, motivo }: { asambleaId: string; modalidad: string; unidades: Unidad[]; codigoInicial?: string | null; habilitado: boolean; motivo?: string | null }) {
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const todas = unidades.length > 0 && unidades.every((u) => u.registrada);
  const registrar = (tipo: "PRESENCIAL" | "VIRTUAL") =>
    start(async () => {
      const r = await registrarAsistenciaPropiaAction({ asambleaId, tipo, codigo: tipo === "PRESENCIAL" ? codigo : "" });
      if (r.ok) {
        toast.success(`Asistencia registrada: ${r.data.unidades.join(", ")}`);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="font-semibold">Mi asistencia</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {unidades.map((u) => (
          <li key={u.unidadId} className="flex items-center justify-between gap-2">
            <span>
              <b>{u.codigo}</b> · coef. {u.coeficiente.toLocaleString("es-CO", { maximumFractionDigits: 4 })} %{u.poderId ? ` · poder de ${u.otorgante}` : ""}
            </span>
            {u.registrada ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-4" /> {u.tipo === "VIRTUAL" ? "Virtual" : u.tipo === "PODER" ? "Representada" : "Presente"}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin registrar</span>
            )}
          </li>
        ))}
      </ul>
      {todas ? (
        <p className="mt-3 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">Tu asistencia está registrada. Ya puedes votar cuando se abra cada punto.</p>
      ) : !habilitado ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{motivo}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {modalidad !== "VIRTUAL" && (
            <div className="space-y-2">
              <label htmlFor="codigo-asistencia" className="flex items-center gap-1.5 text-sm font-medium">
                <QrCode className="size-4" /> En la sala: escanea el QR o escribe el código
              </label>
              <div className="flex gap-2">
                <Input id="codigo-asistencia" value={codigo} onChange={(e) => setCodigo(e.target.value.trim())} placeholder="Código de asistencia" autoComplete="off" />
                <Button type="button" onClick={() => registrar("PRESENCIAL")} disabled={pending || !codigo}>
                  {pending ? <Loader2 className="animate-spin" /> : <MapPin />} Estoy aquí
                </Button>
              </div>
            </div>
          )}
          {modalidad !== "PRESENCIAL" && (
            <Button type="button" size="lg" variant={modalidad === "VIRTUAL" ? "default" : "outline"} className="w-full" onClick={() => registrar("VIRTUAL")} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Video />} Registrar asistencia virtual
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
