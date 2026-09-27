"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FileField, FormGrid, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";

type C = { nombre: string; documento: string; seguridadSocialUrl?: string | null; vence?: string | null };

/** Lista editable de contratistas con soporte de seguridad social (PDF o foto) y vencimiento. */
export function ContratistasEditor({ inicial = [] }: { inicial?: C[] }) {
  const [filas, setFilas] = useState<{ k: number; c: C }[]>(() => (inicial.length ? inicial : [{ nombre: "", documento: "" }]).map((c, i) => ({ k: i, c })));
  const [sig, setSig] = useState(inicial.length + 1);
  return (
    <fieldset className="space-y-3 rounded-xl border p-3">
      <legend className="px-1 text-sm font-semibold">Contratistas autorizados</legend>
      <p className="text-xs text-muted-foreground">Portería solo permitirá el ingreso de estas personas. Adjunta la planilla de seguridad social (PILA) vigente de cada una.</p>
      {filas.map(({ k, c }, i) => (
        <div key={k} className="space-y-3 rounded-lg bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Contratista {i + 1}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar contratista" onClick={() => setFilas((f) => f.filter((x) => x.k !== k))}>
              <Trash2 />
            </Button>
          </div>
          <FormGrid>
            <TextField name={`contratistas.${i}.nombre`} label="Nombre completo" defaultValue={c.nombre} />
            <TextField name={`contratistas.${i}.documento`} label="Documento" inputMode="numeric" defaultValue={c.documento} />
          </FormGrid>
          <FormGrid>
            <FileField name={`contratistas.${i}.seguridadSocialUrl`} label="Seguridad social" accept="application/pdf,image/*" capture={false} folder="obras" defaultValue={c.seguridadSocialUrl ?? null} />
            <TextField name={`contratistas.${i}.vence`} label="Vigente hasta" type="date" defaultValue={c.vence ?? ""} />
          </FormGrid>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setFilas((f) => [...f, { k: sig, c: { nombre: "", documento: "" } }]);
          setSig((s) => s + 1);
        }}
      >
        <Plus /> Agregar contratista
      </Button>
    </fieldset>
  );
}
