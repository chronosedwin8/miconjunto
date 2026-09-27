"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aceptarInvitacionAction } from "./actions";

export function InvitacionForm({
  token,
  email,
  nombre,
  usuarioExiste,
  conUnidad,
  politica,
}: {
  token: string;
  email: string;
  nombre: string;
  usuarioExiste: boolean;
  conUnidad: boolean;
  politica: { responsable: string; finalidad: string; version: string };
}) {
  const [state, action, pending] = useActionState(aceptarInvitacionAction.bind(null, token), null);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Correo</Label>
        <Input value={email} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre completo</Label>
        <Input id="nombre" name="nombre" defaultValue={nombre} required autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefono">Celular</Label>
        <Input id="telefono" name="telefono" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" />
      </div>
      {conUnidad && (
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="tipoDocumento">Documento</Label>
            <select id="tipoDocumento" name="tipoDocumento" className="h-11 w-full rounded-lg border bg-background px-2">
              {["CC", "CE", "PA", "PPT", "TI", "NIT"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numeroDocumento">Número</Label>
            <Input id="numeroDocumento" name="numeroDocumento" inputMode="numeric" />
          </div>
        </div>
      )}
      {!usuarioExiste && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Crea una contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, con mayúsculas, minúsculas y números.</p>
        </div>
      )}
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">Tratamiento de datos personales (Ley 1581 de 2012)</p>
        <p>
          Responsable: {politica.responsable}. Finalidad: {politica.finalidad} Puedes consultar, actualizar, rectificar o suprimir tus datos desde tu perfil.{" "}
          <a href="/politica-datos" target="_blank" className="underline">
            Ver política completa
          </a>
          .
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="aceptaPolitica" value="true" required className="mt-0.5 size-5" />
        <span>Autorizo el tratamiento de mis datos personales según la política (versión {politica.version}).</span>
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      <Button size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} {usuarioExiste ? "Unirme al conjunto" : "Crear mi cuenta"}
      </Button>
    </form>
  );
}
