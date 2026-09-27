"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, ChevronLeft } from "lucide-react";
import type { TipoTicket } from "@prisma/client";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FileField, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { TIPO_INFO, esDano } from "@/lib/tickets/reglas";
import { cn } from "@/lib/utils";
import { TIPO_ICONO } from "../ui";
import { crearTicketAction } from "../actions";

const GRUPOS: { titulo: string; tipos: TipoTicket[] }[] = [
  { titulo: "Daños y seguridad", tipos: ["DANO_ZONA_COMUN", "DANO_UNIDAD", "SEGURIDAD"] },
  { titulo: "Peticiones, quejas y reclamos", tipos: ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA", "FELICITACION"] },
  { titulo: "Convivencia", tipos: ["RUIDO", "MASCOTAS", "OTRO"] },
];

type Resultado = { id: string; radicado: string; fechaLimite: string };

/** Radicar en 3 pasos: tipo → descripción y fotos → radicado. */
export function NuevoTicket({
  unidades,
  zonas,
  tipoInicial,
  zonaInicial,
  activo,
  gestion,
}: {
  unidades: Option[];
  zonas: Option[];
  tipoInicial?: TipoTicket;
  zonaInicial?: string;
  activo?: { id: string; nombre: string } | null;
  gestion: boolean;
}) {
  const [tipo, setTipo] = useState<TipoTicket | null>(tipoInicial ?? null);
  const [paso, setPaso] = useState<1 | 2 | 3>(tipoInicial ? 2 : 1);
  const [res, setRes] = useState<Resultado | null>(null);
  const info = tipo ? TIPO_INFO[tipo] : null;
  const Icono = tipo ? TIPO_ICONO[tipo] : null;

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-5 grid grid-cols-3 gap-2 text-xs" aria-label="Pasos">
        {["Tipo", "Detalles", "Radicado"].map((p, i) => (
          <li key={p} className="space-y-1">
            <div className={cn("h-1.5 rounded-full", paso > i ? "bg-primary" : "bg-muted")} />
            <span className={cn(paso === i + 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {i + 1}. {p}
            </span>
          </li>
        ))}
      </ol>

      {paso === 3 && res ? (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <CircleCheck className="mx-auto size-14 text-success" />
          <h2 className="mt-3 text-xl font-bold">¡Recibimos tu reporte!</h2>
          <p className="mt-1 text-sm text-muted-foreground">Guarda tu número de radicado para hacerle seguimiento.</p>
          <p className="mt-4 font-mono text-3xl font-bold tracking-wider text-primary">{res.radicado}</p>
          <p className="mt-2 text-sm">
            Te responderemos a más tardar el <strong>{new Date(res.fechaLimite).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long" })}</strong>.
          </p>
          <div className="mt-6 grid gap-2">
            <Button size="lg" render={<Link href={`/tickets/${res.id}`} />}>
              Ver seguimiento
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/tickets" />}>
              Volver a mis solicitudes
            </Button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={crearTicketAction}
          refresh={false}
          hideSubmit={paso === 1}
          submitLabel="Enviar reporte"
          submitClassName="w-full h-12 text-base"
          extra={activo ? { activoId: activo.id } : undefined}
          onDone={(d) => {
            setRes(d as Resultado);
            setPaso(3);
            window.scrollTo({ top: 0 });
          }}
        >
          <div className={cn("space-y-5", paso !== 1 && "hidden")}>
            <h2 className="text-lg font-semibold">¿Qué quieres reportar?</h2>
            {GRUPOS.map((g) => (
              <section key={g.titulo} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h3>
                <ChoiceCards
                  name="tipo"
                  defaultValue={tipoInicial}
                  columns={2}
                  onChange={(v) => {
                    setTipo(v as TipoTicket);
                    setPaso(2);
                  }}
                  options={g.tipos.map((t) => {
                    const I = TIPO_ICONO[t];
                    return { value: t, label: TIPO_INFO[t].titulo, description: TIPO_INFO[t].descripcion, icon: <I className="size-6 text-primary" /> };
                  })}
                />
              </section>
            ))}
          </div>

          {info && Icono && (
            <div className={cn("space-y-4", paso !== 2 && "hidden")}>
              <div className="flex items-center gap-3 rounded-xl border bg-primary/5 p-3">
                <span className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
                  <Icono className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{info.titulo}</p>
                  <p className="text-xs text-muted-foreground">{activo ? `Activo: ${activo.nombre}` : info.descripcion}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPaso(1)}>
                  <ChevronLeft /> Cambiar
                </Button>
              </div>
              <TextAreaField
                name="descripcion"
                label={info.grupo === "daño" ? "¿Qué está dañado y dónde?" : "Cuéntanos tu solicitud"}
                placeholder={info.grupo === "daño" ? "Ej.: La luz del pasillo del piso 3 de la Torre 2 no enciende desde anoche." : "Describe con detalle lo que necesitas o lo que sucedió."}
                required
                autoFocus
                rows={5}
              />
              <FileField name="adjuntos" label="Fotos o video (opcional)" multiple accept="image/*,video/mp4,video/quicktime" folder="tickets" hint="Puedes tomarlas con la cámara." />
              {tipo === "DANO_ZONA_COMUN" && !activo && (
                <>
                  <SelectField name="zonaId" label="Zona común (opcional)" options={zonas} defaultValue={zonaInicial} placeholder="Otra / no aplica" />
                  <TextField name="ubicacion" label="Ubicación exacta (opcional)" placeholder="Torre 2, piso 3, junto al ascensor" />
                </>
              )}
              {tipo !== "DANO_ZONA_COMUN" && unidades.length > 1 && !gestion && <SelectField name="unidadId" label="Unidad" options={unidades} defaultValue={unidades[0]?.value} placeholder={false} />}
              {gestion && <SearchSelect name="unidadId" label="Unidad relacionada (opcional)" options={unidades} />}
              {tipo && (esDano(tipo) || tipo === "SEGURIDAD") && (
                <CheckboxField name="urgente" label="Es urgente" hint="Hay riesgo para las personas o el daño empeora (fuga de agua, cortocircuito, puerta de acceso abierta)." />
              )}
            </div>
          )}
        </ActionForm>
      )}
    </div>
  );
}
