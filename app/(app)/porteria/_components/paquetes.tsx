"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FileField, FormGrid, SearchSelect, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { cn } from "@/lib/utils";
import { entregarPaqueteAction, recibirPaqueteAction } from "../actions";
import { offlineAction } from "./offline-action";
import { SignaturePad } from "./signature-pad";
import { Foto, bigBtn } from "./kiosk";

const recibir = offlineAction("PAQUETE", () => "Paquete recibido", recibirPaqueteAction);

const TRANSPORTADORAS = ["Servientrega", "Interrapidísimo", "Coordinadora", "Envía", "TCC", "Deprisa", "4-72", "Amazon", "Mercado Libre", "Rappi", "DiDi Food", "Otra"];

/** Recibir paquete: unidad con buscador, tipo, transportadora, fotos del paquete y de la guía. Funciona sin conexión. */
export function RecibirPaqueteForm({ unidades, unidadId }: { unidades: Option[]; unidadId?: string }) {
  const [trans, setTrans] = useState("");
  return (
    <ActionForm action={recibir} submitLabel="Recibir y notificar" successMessage="Paquete recibido: la unidad fue notificada" resetOnSuccess submitClassName={`${bigBtn} w-full`}>
      <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidadId} required placeholder="Toca para buscar la unidad…" />
      <div>
        <p className="mb-2 text-base font-semibold">Tipo</p>
        <ChoiceCards
          name="tipo"
          columns={3}
          defaultValue="CAJA"
          options={[
            { value: "CAJA", label: "📦 Caja" },
            { value: "SOBRE", label: "✉️ Sobre" },
            { value: "MERCADO", label: "🛒 Mercado" },
            { value: "DOMICILIO", label: "🛵 Domicilio" },
            { value: "OTRO", label: "Otro" },
          ]}
        />
      </div>
      <div>
        <p className="mb-2 text-base font-semibold">Transportadora</p>
        <div className="flex flex-wrap gap-2">
          {TRANSPORTADORAS.map((t) => (
            <button key={t} type="button" onClick={() => setTrans(t === "Otra" ? "" : t)} className={cn("h-11 rounded-full border-2 px-4 text-base font-medium", trans === t && "border-primary bg-primary/10 font-bold")}>
              {t}
            </button>
          ))}
        </div>
        <input name="transportadora" value={trans} onChange={(e) => setTrans(e.target.value)} placeholder="Otra transportadora" aria-label="Transportadora" className="mt-2 h-12 w-full rounded-lg border bg-background px-3 text-base" />
      </div>
      <FormGrid>
        <TextField name="destinatario" label="Destinatario (como dice la guía)" />
        <TextField name="guia" label="Número de guía" />
      </FormGrid>
      <FormGrid>
        <FileField name="fotoUrl" label="Foto del paquete" folder="paquetes" />
        <FileField name="fotoGuiaUrl" label="Foto de la guía" folder="paquetes" />
      </FormGrid>
      <TextAreaField name="observaciones" label="Observaciones" rows={2} placeholder="Ej.: caja golpeada, requiere refrigeración…" />
    </ActionForm>
  );
}

export type PaqueteEntrega = { id: string; titulo: string; detalle: string; fotoUrl: string | null };
export type AutorizadoVista = { personaId: string; nombre: string; tipoLabel: string; fotoUrl: string | null; documento: string | null };

/** Entregar: solo a personas autorizadas de la unidad (con fotos), con firma en pantalla o foto de la entrega. */
export function EntregarPaqueteForm({ paquetes, autorizados }: { paquetes: PaqueteEntrega[]; autorizados: AutorizadoVista[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(paquetes.map((p) => p.id)));
  const [persona, setPersona] = useState("");
  return (
    <ActionForm action={entregarPaqueteAction} extra={{ paqueteIds: [...sel], personaId: persona }} submitLabel={`Entregar ${sel.size} paquete(s)`} successMessage="Entrega registrada" redirectTo="/porteria/paquetes" submitClassName={`${bigBtn} w-full`}>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Paquetes</legend>
        <ul className="grid gap-2">
          {paquetes.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="checkbox"
                  className="size-7"
                  checked={sel.has(p.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(p.id);
                    else n.delete(p.id);
                    setSel(n);
                  }}
                />
                <Foto src={p.fotoUrl} alt={p.titulo} className="size-12" />
                <span>
                  <span className="block text-base font-bold">{p.titulo}</span>
                  <span className="text-sm text-foreground/75">{p.detalle}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">¿Quién recoge? (solo personas autorizadas)</legend>
        {autorizados.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed p-3 text-base text-muted-foreground">La unidad no tiene personas autorizadas registradas. Pide al residente que las agregue en Mi hogar.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {autorizados.map((a) => (
              <label key={a.personaId} className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary/30">
                <input type="radio" name="personaSel" value={a.personaId} checked={persona === a.personaId} onChange={() => setPersona(a.personaId)} className="sr-only" />
                <Foto src={a.fotoUrl} alt={a.nombre} className="size-20" />
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-tight">{a.nombre}</span>
                  <span className="block text-sm text-foreground/75">{a.tipoLabel}</span>
                  {a.documento && <span className="block text-sm">CC {a.documento}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <SignaturePad name="firma" label="Firma de quien recibe" />
      <FileField name="fotoEntregaUrl" label="…o foto de la entrega" folder="paquetes" hint="Se exige la firma o la foto." />
    </ActionForm>
  );
}
