import { KeyRound, Pencil, Radio, Undo2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fechaHora, tiempoRelativo } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { inventarioElementos } from "@/lib/porteria/turnos";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { CheckboxField, FormGrid, SearchSelect, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { devolverElementoAction, guardarElementoAction, prestarElementoAction } from "../actions";
import { KSection, KTitle } from "../_components/kiosk";

export const metadata = { title: "Llaves y elementos" };

const TIPOS = ["LLAVE", "CONTROL", "TARJETA", "RADIO", "OTRO"] as const;

export default async function LlavesPage() {
  const ctx = await requirePage("porteria.llaves");
  const [{ elementos, historial }, unidades] = await Promise.all([inventarioElementos(ctx), unidadOptions(ctx)]);
  const campos = (e?: (typeof elementos)[number]) => (
    <>
      <TextField name="nombre" label="Nombre" defaultValue={e?.nombre} required placeholder="Llave salón social" />
      <FormGrid>
        <SelectField name="tipo" label="Tipo" options={options(TIPOS)} defaultValue={e?.tipo ?? "LLAVE"} placeholder={false} />
        <TextField name="codigo" label="Código / número" defaultValue={e?.codigo ?? ""} />
      </FormGrid>
      <TextField name="ubicacion" label="Ubicación en portería" defaultValue={e?.ubicacion ?? ""} placeholder="Tablero, gancho 4" />
      <TextField name="notas" label="Notas" defaultValue={e?.notas ?? ""} />
      {e && <SelectField name="estado" label="Estado" options={options(["DISPONIBLE", "PRESTADO", "PERDIDO"] as const)} defaultValue={e.estado} placeholder={false} />}
    </>
  );
  return (
    <>
      <KTitle
        acciones={
          <FormDialog titulo="Nuevo elemento" action={guardarElementoAction} triggerLabel="Nuevo elemento">
            {campos()}
          </FormDialog>
        }
      >
        Llaves y elementos
      </KTitle>
      <ul className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {elementos.map((e) => {
          const p = e.prestamos[0];
          return (
            <li key={e.id} className="flex flex-col gap-2 rounded-2xl border-2 bg-card p-3">
              <div className="flex items-start gap-3">
                {e.tipo === "RADIO" ? <Radio className="size-8 shrink-0" /> : <KeyRound className="size-8 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight">{e.nombre}</p>
                  <p className="text-sm text-foreground/75">
                    {label(e.tipo)}
                    {e.codigo && ` · ${e.codigo}`}
                    {e.ubicacion && ` · ${e.ubicacion}`}
                  </p>
                  {p && (
                    <p className="text-sm font-semibold">
                      Prestado a {p.prestadoA} · {tiempoRelativo(p.prestadoEn)}
                    </p>
                  )}
                </div>
                <StatusBadge value={e.estado} />
              </div>
              <div className="flex gap-2">
                {e.estado === "DISPONIBLE" && (
                  <FormDialog titulo={`Prestar: ${e.nombre}`} action={prestarElementoAction} extra={{ elementoId: e.id }} submitLabel="Registrar préstamo" successMessage="Préstamo registrado" trigger={<Button className="h-12 flex-1 text-base font-bold">Prestar</Button>}>
                    <TextField name="prestadoA" label="¿A quién?" required placeholder="Nombre de quien recibe" />
                    <SearchSelect name="unidadId" label="Unidad (si es residente)" options={unidades} />
                    <TextField name="observaciones" label="Observaciones" />
                  </FormDialog>
                )}
                {p && (
                  <FormDialog titulo={`Devolución: ${e.nombre}`} action={devolverElementoAction} extra={{ prestamoId: p.id }} submitLabel="Registrar devolución" successMessage="Devolución registrada" trigger={<Button variant="outline" className="h-12 flex-1 text-base font-bold"><Undo2 /> Devolver</Button>}>
                    <TextField name="observaciones" label="Observaciones" />
                    <CheckboxField name="perdido" label="No lo devolvieron / se perdió" />
                  </FormDialog>
                )}
                <FormDialog titulo={`Editar: ${e.nombre}`} action={guardarElementoAction} extra={{ id: e.id }} trigger={<Button variant="ghost" size="icon-lg" aria-label="Editar"><Pencil /></Button>}>
                  {campos(e)}
                </FormDialog>
              </div>
            </li>
          );
        })}
        {!elementos.length && <li className="text-muted-foreground">Agrega las llaves, controles, tarjetas y radios que maneja portería.</li>}
      </ul>
      <KSection titulo="Últimos préstamos">
        <ul className="divide-y rounded-2xl border-2 text-base">
          {historial.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span>
                <b>{h.elemento.nombre}</b> → {h.prestadoA}
              </span>
              <span className="text-sm text-muted-foreground">
                {fechaHora(h.prestadoEn)} · {h.devueltoEn ? `devuelto ${fechaHora(h.devueltoEn)}` : "sin devolver"}
              </span>
            </li>
          ))}
        </ul>
      </KSection>
    </>
  );
}
