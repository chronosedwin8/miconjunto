import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MODULOS_SAAS } from "@/lib/superadmin/service";
import { ActionForm } from "@/components/form/action-form";
import { FormGrid, SelectField } from "@/components/form/fields";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { fechaHora } from "@/lib/format";
import { actualizarConjuntoSaasAction, entrarConjuntoAction, impersonarAction } from "../../actions";

export const metadata = { title: "Conjunto" };

export default async function ConjuntoSaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.conjunto.findUnique({
    where: { id },
    include: {
      plan: true,
      membresias: { where: { deletedAt: null }, include: { usuario: true, rol: true }, orderBy: { rol: { nombre: "asc" } }, take: 60 },
      _count: { select: { unidades: true, personas: true } },
    },
  });
  if (!c) notFound();
  const planes = await prisma.planSuscripcion.findMany({ where: { deletedAt: null } });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{c.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {c.ciudad} · NIT {c.nit ?? "—"} · {c._count.unidades} unidades · {c._count.personas} personas · creado {fechaHora(c.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={entrarConjuntoAction.bind(null, c.id, "/apertura")}>
            <Button>Continuar asistente de apertura</Button>
          </form>
          <form action={entrarConjuntoAction.bind(null, c.id, "/inicio")}>
            <Button variant="outline">Entrar como soporte</Button>
          </form>
        </div>
      </div>
      <Section titulo="Plan, estado y módulos">
        <ActionForm action={actualizarConjuntoSaasAction} extra={{ id: c.id }} successMessage="Conjunto actualizado">
          <FormGrid>
            <SelectField name="estado" label="Estado" options={["ACTIVO", "EN_APERTURA", "SUSPENDIDO", "INACTIVO"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }))} defaultValue={c.estado} placeholder={false} />
            <SelectField name="planId" label="Plan" options={planes.map((p) => ({ value: p.id, label: p.nombre }))} defaultValue={c.planId} />
          </FormGrid>
          <input type="hidden" name="modulosActivos[]" value="" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODULOS_SAAS.map((m) => (
              <label key={m.value} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <input type="checkbox" name="modulosActivos[]" value={m.value} defaultChecked={c.modulosActivos.includes(m.value) || c.modulosActivos.includes("*")} className="size-4" />
                {m.label}
              </label>
            ))}
          </div>
        </ActionForm>
      </Section>
      <Section titulo="Usuarios (impersonar para soporte, queda auditado)">
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {c.membresias.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                {m.usuario.nombre} · <span className="text-muted-foreground">{m.usuario.email}</span> · {m.rol.nombre}
              </span>
              <form action={impersonarAction.bind(null, m.usuarioId)}>
                <Button size="sm" variant="outline">
                  Ver como este usuario
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
