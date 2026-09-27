import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { MODULOS } from "@/lib/permisos";
import { ActionForm, ActionButton } from "@/components/form/action-form";
import { eliminarRolAction, guardarPermisosRolAction } from "../../actions";

export const metadata = { title: "Permisos del rol" };

export default async function RolPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("configuracion.roles");
  const { id } = await params;
  const rol = await ctx.db.rol.findUnique({ where: { id }, include: { permisos: true } });
  if (!rol) notFound();
  const activos = new Set(rol.permisos.map((p) => p.permisoClave));
  const modulos = Object.entries(MODULOS).filter(([, m]) => !("tipo" in m));
  return (
    <>
      <Link href="/configuracion/roles" className="text-sm text-muted-foreground">
        ← Roles
      </Link>
      <h2 className="mb-1 text-xl font-bold">{rol.nombre}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {rol.descripcion ?? "Marca las acciones que este rol puede realizar."} Los campos visibles y los indicadores se configuran en <Link className="text-primary" href="/configuracion/visibilidad">Visibilidad</Link>.
      </p>
      <ActionForm action={guardarPermisosRolAction} extra={{ rolId: rol.id, alcance: "ACCION" }} successMessage="Permisos actualizados" submitLabel="Guardar permisos" submitClassName="sticky bottom-20 w-full shadow-lg lg:bottom-4">
        <input type="hidden" name="permisos[]" value="" />
        <div className="grid gap-3 md:grid-cols-2">
          {modulos.map(([mod, def]) => (
            <fieldset key={mod} className="rounded-xl border bg-card p-3">
              <legend className="px-1 text-sm font-semibold">{def.label}</legend>
              <div className="space-y-1">
                {Object.entries(def.acciones).map(([acc, desc]) => {
                  const clave = `${mod}.${acc}`;
                  return (
                    <label key={clave} className="flex min-h-10 items-center gap-3 rounded-md px-1 text-sm hover:bg-muted/50">
                      <input type="checkbox" name="permisos[]" value={clave} defaultChecked={activos.has(clave)} className="size-5 accent-[var(--brand)]" />
                      <span className="flex-1">{desc as string}</span>
                      <code className="hidden text-[10px] text-muted-foreground sm:inline">{clave}</code>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </ActionForm>
      {!rol.base && (
        <div className="mt-6">
          <ActionButton action={eliminarRolAction} input={{ id: rol.id }} variant="destructive" confirm="¿Eliminar este rol personalizado?" redirectTo="/configuracion/roles" successMessage="Rol eliminado">
            Eliminar rol
          </ActionButton>
        </div>
      )}
    </>
  );
}
