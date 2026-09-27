import { requirePage } from "@/lib/auth/guard";
import { listarRoles } from "@/lib/roles/service";
import { MODULOS } from "@/lib/permisos";
import { ActionForm } from "@/components/form/action-form";
import { guardarVisibilidadAction } from "../actions";

export const metadata = { title: "Visibilidad" };

export default async function VisibilidadPage() {
  const ctx = await requirePage("configuracion.roles");
  const roles = (await listarRoles(ctx)).filter((r) => r.clave !== "ADMINISTRADOR");
  const permisos = await ctx.db.rolPermiso.findMany({ where: { permisoClave: { startsWith: "campos." } } });
  const permisos2 = await ctx.db.rolPermiso.findMany({ where: { permisoClave: { startsWith: "secciones." } } });
  const activos = new Set([...permisos, ...permisos2].map((p) => `${p.rolId}:${p.permisoClave}`));
  const filas = [
    ...Object.entries(MODULOS.campos.acciones).map(([k, d]) => ({ clave: `campos.${k}`, desc: d, grupo: "Campos visibles" })),
    ...Object.entries(MODULOS.secciones.acciones).map(([k, d]) => ({ clave: `secciones.${k}`, desc: d, grupo: "Indicadores agregados" })),
  ];
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Define qué campos y qué indicadores ve cada rol. Ejemplos: que portería no vea teléfonos personales, que todos vean el % de mora del conjunto pero nunca nombres de morosos. El
        administrador siempre ve todo.
      </p>
      <ActionForm action={guardarVisibilidadAction} successMessage="Visibilidad actualizada" submitLabel="Guardar visibilidad">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="sticky left-0 bg-muted/50 p-2 text-left">Permiso</th>
                {roles.map((r) => (
                  <th key={r.id} className="min-w-20 p-2 text-center font-medium">
                    {r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.clave} className="border-t">
                  <td className="sticky left-0 bg-card p-2">
                    {(i === 0 || filas[i - 1].grupo !== f.grupo) && <p className="text-[10px] font-semibold uppercase text-muted-foreground">{f.grupo}</p>}
                    {f.desc}
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className="p-2 text-center">
                      <input
                        type="checkbox"
                        name={`matriz.${r.id}[]`}
                        value={f.clave}
                        defaultChecked={activos.has(`${r.id}:${f.clave}`)}
                        aria-label={`${f.desc} — ${r.nombre}`}
                        className="size-5 accent-[var(--brand)]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ActionForm>
    </>
  );
}
