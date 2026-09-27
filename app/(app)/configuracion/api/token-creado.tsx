"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/app/form-dialog";
import { TextField } from "@/components/form/fields";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { crearTokenApiAction } from "../actions";

/** Crea un token y lo muestra una sola vez. */
export function TokenCreado({ permisos }: { permisos: string[] }) {
  const [token, setToken] = useState<string | null>(null);
  const action = async (input: unknown) => {
    const r = await crearTokenApiAction(input as never);
    if (r.ok) setToken(r.data.token);
    return r;
  };
  return (
    <>
      <FormDialog titulo="Nuevo token de API" action={action} triggerLabel="Crear token" triggerSize="sm" successMessage="Token creado">
        <TextField name="nombre" label="Nombre (para identificarlo)" placeholder="Integración contable" required />
        <fieldset className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
          <legend className="text-sm font-medium">Permisos (solo lectura sugeridos)</legend>
          {permisos.map((p) => (
            <label key={p} className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="permisos[]" value={p} className="size-4" /> {p}
            </label>
          ))}
        </fieldset>
      </FormDialog>
      <Dialog open={!!token} onOpenChange={(o) => !o && setToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copia tu token ahora</DialogTitle>
            <DialogDescription>Por seguridad no lo volveremos a mostrar.</DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-lg bg-muted p-3 text-sm">{token}</code>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(token ?? "");
              toast.success("Copiado");
            }}
          >
            <Copy /> Copiar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
