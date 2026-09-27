import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { listarRoles } from "@/lib/roles/service";
import { ROLES_BASE, ROL_LABEL } from "@/lib/permisos";
import { FormDialog } from "@/components/app/form-dialog";
import { SelectField, TextField, TextAreaField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { crearRolAction } from "../actions";

export const metadata = { title: "Roles y permisos" };

export default async function RolesPage() {
  const ctx = await requirePage("configuracion.roles");
  const roles = await listarRoles(ctx);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Activa o desactiva cada permiso por rol. Los roles personalizados copian los permisos de un rol base, que define su alcance.</p>
        <FormDialog titulo="Nuevo rol personalizado" action={crearRolAction} triggerLabel="Crear rol" redirectTo="/configuracion/roles/{id}">
          <TextField name="nombre" label="Nombre del rol" placeholder="Ej: Supervisor de seguridad" required />
          <SelectField name="basadoEnClave" label="Copiar permisos de" options={ROLES_BASE.map((r) => ({ value: r, label: ROL_LABEL[r] }))} required />
          <TextAreaField name="descripcion" label="Descripción" />
        </FormDialog>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {roles.map((r) => (
          <li key={r.id}>
            <Link href={`/configuracion/roles/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.nombre} {r.base ? <Badge variant="secondary">Base</Badge> : <Badge variant="info">Personalizado · {ROL_LABEL[r.basadoEnClave as keyof typeof ROL_LABEL] ?? r.basadoEnClave}</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r._count.membresias} usuario(s) · {r._count.permisos} permisos
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
