import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { spGet, insensitive, pageParams, spFlat, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { unidadOptions } from "@/lib/conjunto/options";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { FormDialog } from "@/components/app/form-dialog";
import { Section } from "@/components/app/page-header";
import { SearchSelect, SelectField, TextField, FormGrid } from "@/components/form/fields";
import { SelectAction } from "@/components/form/select-action";
import { StatusBadge } from "@/components/app/status-badge";
import { options } from "@/lib/labels";
import { cambiarEstadoMiembroAction, cambiarRolMiembroAction, invitarUsuarioAction } from "../actions";

export const metadata = { title: "Usuarios" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("configuracion.roles");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const where: Prisma.MembresiaConjuntoWhereInput = {
    ...(q ? { usuario: { OR: [{ nombre: insensitive(q) }, { email: insensitive(q) }] } } : {}),
    ...(spGet(sp, "rol") ? { rolId: spGet(sp, "rol") } : {}),
  };
  const [miembros, total, roles, invitaciones, unidades] = await Promise.all([
    ctx.db.membresiaConjunto.findMany({ where, include: { usuario: true, rol: true }, orderBy: { usuario: { nombre: "asc" } }, skip, take }),
    ctx.db.membresiaConjunto.count({ where }),
    ctx.db.rol.findMany({ orderBy: { nombre: "asc" } }),
    ctx.db.invitacion.findMany({ where: { estado: "PENDIENTE", expira: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 20 }),
    unidadOptions(ctx),
  ]);
  const rolOpts = roles.map((r) => ({ value: r.id, label: r.nombre }));
  return (
    <>
      <ListToolbar placeholder="Buscar por nombre o correo…" filters={[{ name: "rol", label: "Rol", options: rolOpts }]}>
        <FormDialog titulo="Invitar usuario" descripcion="Le llegará un correo con un enlace para crear su cuenta. También puedes compartirlo por WhatsApp." action={invitarUsuarioAction} triggerLabel="Invitar" triggerSize="sm" successMessage="Invitación enviada">
          <TextField name="email" label="Correo" type="email" required />
          <FormGrid>
            <TextField name="nombre" label="Nombre" />
            <TextField name="telefono" label="Celular" inputMode="tel" />
          </FormGrid>
          <SelectField name="rolClave" label="Rol" options={roles.map((r) => ({ value: r.clave, label: r.nombre }))} required />
          <SearchSelect name="unidadId" label="Unidad (para residentes)" options={unidades} />
          <SelectField name="tipoVinculo" label="Vínculo con la unidad" options={options(["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"])} />
        </FormDialog>
      </ListToolbar>
      <DataList
        rows={miembros}
        rowKey={(m) => m.id}
        columns={[
          { key: "nombre", header: "Usuario", primary: true, cell: (m) => (<span><span className="block">{m.usuario.nombre}</span><span className="block text-xs font-normal text-muted-foreground">{m.usuario.email}</span></span>) },
          {
            key: "rol",
            header: "Rol",
            cell: (m) => <SelectAction action={cambiarRolMiembroAction} input={{ membresiaId: m.id }} field="rolId" value={m.rolId} options={rolOpts} ariaLabel={`Rol de ${m.usuario.nombre}`} />,
          },
          { key: "acceso", header: "Último acceso", cell: (m) => fechaHora(m.usuario.ultimoAcceso) },
          {
            key: "estado",
            header: "Estado",
            cell: (m) => (
              <SelectAction
                action={cambiarEstadoMiembroAction}
                input={{ membresiaId: m.id }}
                field="estado"
                value={m.estado}
                options={[
                  { value: "ACTIVA", label: "Activo" },
                  { value: "SUSPENDIDA", label: "Suspendido" },
                ]}
                ariaLabel={`Estado de ${m.usuario.nombre}`}
              />
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/configuracion/usuarios" />
      {invitaciones.length > 0 && (
        <Section titulo="Invitaciones pendientes" className="mt-6">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {invitaciones.map((i) => (
              <li key={i.id} className="flex items-center justify-between p-3">
                <span>
                  {i.email} · {i.rolClave.toLowerCase()}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  vence {fechaHora(i.expira)} <StatusBadge value={i.estado} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
