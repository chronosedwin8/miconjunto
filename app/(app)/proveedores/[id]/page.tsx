import Link from "next/link";
import { FileText, Mail, Phone, Star, Trash2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fichaProveedor, TIPOS_DOC_PROVEEDOR, usuariosProveedorOptions } from "@/lib/proveedores/service";
import { estadoContrato } from "@/lib/proveedores/calculos";
import { semaforoVencimiento } from "@/lib/mantenimiento/calculos";
import { cop, fecha, num, pct, startOfDayBogota, toNumber } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FileField, SelectField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProveedorFields } from "../proveedor-fields";
import { ContratoFields } from "../contrato-fields";
import { eliminarDocumentoAction, eliminarProveedorAction, guardarContratoAction, guardarDocumentoAction, guardarProveedorAction, terminarContratoAction } from "../actions";

export const metadata = { title: "Proveedor" };

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("proveedores.ver");
  const { id } = await params;
  const p = await fichaProveedor(ctx, id);
  const edita = can(ctx, "proveedores.editar");
  const usuarios = edita ? await usuariosProveedorOptions(ctx) : [];
  const hoy = startOfDayBogota();
  const verGasto = can(ctx, "presupuesto.ver");
  return (
    <>
      <Link href="/proveedores" className="mb-1 inline-flex min-h-8 items-center text-sm text-muted-foreground">
        ← Proveedores
      </Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">{p.razonSocial}</h2>
          <p className="text-sm text-muted-foreground">
            NIT {p.nit} · {p.categoria}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!p.activo && <Badge variant="secondary">Inactivo</Badge>}
            {p.directorioComunitario && <Badge variant="info">En el directorio comunitario</Badge>}
            {p.usuarioAcceso && <Badge variant="outline">Acceso: {p.usuarioAcceso.email}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.telefono && (
            <Button variant="outline" render={<a href={`tel:${p.telefono}`} />}>
              <Phone /> Llamar
            </Button>
          )}
          {p.email && (
            <Button variant="outline" render={<a href={`mailto:${p.email}`} />}>
              <Mail /> Correo
            </Button>
          )}
          {edita && (
            <FormDialog titulo="Editar proveedor" action={guardarProveedorAction} extra={{ id: p.id }} triggerLabel="Editar" triggerVariant="outline" wide successMessage="Proveedor actualizado">
              <ProveedorFields p={p} usuarios={usuarios} />
            </FormDialog>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Calificación de residentes" value={toNumber(p.calificacionPromedio) ? `${num(p.calificacionPromedio, 1)} ★` : "—"} hint={`${p.calificaciones.length} opiniones`} />
        <StatCard label="Órdenes" value={`${p.desempeno.completadas}/${p.desempeno.total}`} hint="completadas / asignadas" />
        <StatCard label="A tiempo" value={pct(p.desempeno.pctATiempo)} tone={p.desempeno.total ? (p.desempeno.pctATiempo >= 80 ? "success" : "warning") : "default"} />
        {verGasto ? <StatCard label="Total pagado / aprobado" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(p.totalGastado)}</span>} hint={`${p.numGastos} gastos`} /> : <StatCard label="Contratos" value={p.contratos.length} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          titulo="Documentos"
          acciones={
            edita ? (
              <FormDialog titulo="Agregar documento" action={guardarDocumentoAction} extra={{ proveedorId: p.id }} triggerLabel="Agregar" triggerSize="sm" successMessage="Documento guardado">
                <SelectField name="tipo" label="Tipo" options={options(TIPOS_DOC_PROVEEDOR)} defaultValue="POLIZA" placeholder={false} />
                <TextField name="vence" label="Vence" type="date" />
                <FileField name="archivoUrl" label="Archivo" accept="application/pdf,image/*" capture={false} folder="proveedores" />
              </FormDialog>
            ) : undefined
          }
        >
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {p.documentos.length === 0 && <li className="p-4 text-muted-foreground">Sin documentos. Pide RUT, cámara de comercio, pólizas y seguridad social.</li>}
            {p.documentos.map((d) => {
              const s = semaforoVencimiento(d.vence, hoy, 30);
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{label(d.tipo)}</p>
                    <p className="text-xs text-muted-foreground">{d.vence ? `Vence ${fecha(d.vence)}` : "Sin vencimiento"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {s && <StatusBadge value={s} />}
                    {d.archivoUrl && (
                      <Button variant="ghost" size="icon-sm" aria-label="Ver documento" render={<a href={d.archivoUrl} target="_blank" rel="noopener" />}>
                        <FileText />
                      </Button>
                    )}
                    {edita && (
                      <ActionButton action={eliminarDocumentoAction} input={{ id: d.id }} variant="ghost" size="icon-sm" confirm="¿Eliminar el documento?" successMessage="Documento eliminado">
                        <Trash2 />
                      </ActionButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          titulo="Contratos"
          acciones={
            can(ctx, ["proveedores.crear", "proveedores.editar"]) ? (
              <FormDialog titulo="Nuevo contrato" action={guardarContratoAction} extra={{ proveedorId: p.id }} triggerLabel="Nuevo" triggerSize="sm" successMessage="Contrato guardado">
                <ContratoFields />
              </FormDialog>
            ) : undefined
          }
        >
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {p.contratos.length === 0 && <li className="p-4 text-muted-foreground">Sin contratos registrados.</li>}
            {p.contratos.map((c) => {
              const e = estadoContrato(c, hoy);
              return (
                <li key={c.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{c.objeto}</p>
                    <StatusBadge value={e} className="shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cop(c.valor)} · {fecha(c.inicio)} a {fecha(c.fin)}
                    {c.renovacionAutomatica && " · renovación automática"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.documentoUrl && (
                      <Button size="sm" variant="ghost" render={<a href={c.documentoUrl} target="_blank" rel="noopener" />}>
                        <FileText /> Documento
                      </Button>
                    )}
                    {edita && e !== "TERMINADO" && (
                      <>
                        <FormDialog titulo="Editar contrato" action={guardarContratoAction} extra={{ id: c.id, proveedorId: p.id }} trigger={<Button size="sm" variant="ghost">Editar</Button>} successMessage="Contrato actualizado">
                          <ContratoFields c={c} />
                        </FormDialog>
                        <FormDialog titulo="Terminar contrato" action={terminarContratoAction} extra={{ id: c.id }} trigger={<Button size="sm" variant="ghost" className="text-destructive">Terminar</Button>} submitLabel="Terminar contrato" confirm="¿Terminar este contrato? No se renovará.">
                          <TextField name="motivo" label="Motivo" required />
                        </FormDialog>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section titulo="Tarifas y beneficio">
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p className="whitespace-pre-line">{p.tarifas || "Sin tarifas publicadas."}</p>
            {p.beneficioComunidad && <p className="rounded-lg bg-primary/5 p-2 text-primary">🎁 {p.beneficioComunidad}</p>}
            {p.contactoNombre && <p className="text-muted-foreground">Contacto: {p.contactoNombre}</p>}
            {p.direccion && <p className="text-muted-foreground">{p.direccion}</p>}
          </div>
        </Section>

        <Section titulo={`Opiniones de residentes (${p.calificaciones.length})`}>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {p.calificaciones.length === 0 && <li className="p-4 text-muted-foreground">Aún no hay calificaciones.</li>}
            {p.calificaciones.slice(0, 8).map((c) => (
              <li key={c.id} className="p-3">
                <p className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={`size-3.5 ${i < c.puntaje ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} aria-hidden />
                  ))}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {c.usuarioNombre ?? "Residente"} · {fecha(c.createdAt)}
                  </span>
                </p>
                {c.comentario && <p className="mt-1">{c.comentario}</p>}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section titulo="Órdenes de trabajo">
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {p.ordenes.length === 0 && <li className="p-4 text-muted-foreground">Sin órdenes asignadas.</li>}
          {p.ordenes.slice(0, 15).map((o) => (
            <li key={o.id}>
              <Link href={`/mantenimiento/ordenes/${o.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    #{o.numero} {o.titulo}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {o.activo?.nombre ?? "—"} · {fecha(o.fechaProgramada)}
                    {o.costo && verGasto ? ` · ${cop(o.costo)}` : ""}
                  </span>
                </span>
                <StatusBadge value={o.estado} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {can(ctx, "proveedores.eliminar") && (
        <ActionButton action={eliminarProveedorAction} input={{ id: p.id }} variant="destructive" confirm={`¿Retirar a ${p.razonSocial}?`} successMessage="Proveedor retirado" redirectTo="/proveedores">
          Retirar proveedor
        </ActionButton>
      )}
    </>
  );
}
