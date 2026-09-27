import Link from "next/link";
import { Gavel, Handshake, Mail } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { cop, fecha, nombreCompleto } from "@/lib/format";
import { options } from "@/lib/labels";
import { esGestor, whereIncidentes, whereLlamados, whereMultas } from "@/lib/convivencia/service";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page-header";
import { NuevoLlamado } from "./formularios";

export const metadata = { title: "Convivencia" };

export default async function ConvivenciaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  const sp = await searchParams;

  if (!esGestor(ctx)) {
    const [llamados, multas, incidentes] = await Promise.all([
      ctx.db.llamadoAtencion.findMany({ where: whereLlamados(ctx), include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" } }),
      ctx.db.multa.findMany({ where: whereMultas(ctx), include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" } }),
      ctx.db.incidenteConvivencia.findMany({ where: whereIncidentes(ctx), orderBy: { fecha: "desc" } }),
    ]);
    if (!llamados.length && !multas.length && !incidentes.length) {
      return <EmptyState icon={Handshake} titulo="Todo en orden" descripcion="No tienes llamados de atención ni multas. ¡Gracias por aportar a una buena convivencia!" />;
    }
    return (
      <>
        {multas.length > 0 && (
          <Section titulo="Multas">
            <ul className="space-y-2">
              {multas.map((m) => (
                <li key={m.id}>
                  <Link href={`/convivencia/multas/${m.id}`} className="flex items-start gap-3 rounded-xl border bg-card p-3 active:opacity-80">
                    <Gavel className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium">{m.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.unidad.codigo} · {cop(m.valor)} · {fecha(m.fecha)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusBadge value={m.estado} />
                        {m.estado === "NOTIFICADA" && m.plazoDescargos && <StatusBadge value="PENDIENTE" text={`Descargos hasta ${fecha(m.plazoDescargos)}`} />}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {llamados.length > 0 && (
          <Section titulo="Llamados de atención">
            <ul className="space-y-2">
              {llamados.map((l) => (
                <li key={l.id}>
                  <Link href={`/convivencia/llamados/${l.id}`} className="flex items-start gap-3 rounded-xl border bg-card p-3 active:opacity-80">
                    <Mail className={`mt-0.5 size-5 shrink-0 ${l.estado === "ENVIADO" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`line-clamp-2 ${l.estado === "ENVIADO" ? "font-semibold" : "font-medium"}`}>{l.motivo}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.unidad.codigo} · {fecha(l.fecha)}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <StatusBadge value={l.estado === "ENVIADO" ? "PENDIENTE" : l.estado} text={l.estado === "ENVIADO" ? "Sin leer" : undefined} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {incidentes.length > 0 && (
          <Section titulo="Incidentes de convivencia">
            <ul className="space-y-2">
              {incidentes.map((i) => (
                <li key={i.id}>
                  <Link href={`/convivencia/incidentes/${i.id}`} className="block rounded-xl border bg-card p-3">
                    <p className="font-medium">{i.titulo}</p>
                    <p className="text-xs text-muted-foreground">{fecha(i.fecha)}</p>
                    <StatusBadge value={i.estado} className="mt-1.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </>
    );
  }

  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const q = spGet(sp, "q");
  const where = {
    AND: [
      whereLlamados(ctx),
      spGet(sp, "estado") ? { estado: spGet(sp, "estado") as never } : {},
      spGet(sp, "gravedad") ? { gravedad: spGet(sp, "gravedad") as never } : {},
      q ? { OR: [{ motivo: insensitive(q) }, { unidad: { codigo: insensitive(q) } }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    ctx.db.llamadoAtencion.findMany({ where, include: { unidad: { select: { id: true, codigo: true } }, persona: { select: { nombres: true, apellidos: true } } }, orderBy: { fecha: "desc" }, skip, take }),
    ctx.db.llamadoAtencion.count({ where }),
  ]);
  return (
    <>
      <ListToolbar
        placeholder="Buscar por motivo o unidad…"
        exportRecurso="llamados"
        filters={[
          { name: "estado", label: "Estado", options: options(["ENVIADO", "LEIDO", "RESPONDIDO", "CERRADO", "ESCALADO_MULTA"]) },
          { name: "gravedad", label: "Gravedad", options: options(["LEVE", "MODERADA", "GRAVE"]) },
        ]}
      >
        {can(ctx, "convivencia.crear") && (
          <div className="ml-auto shrink-0">
            <NuevoLlamado ctx={ctx} />
          </div>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/convivencia/llamados/${r.id}`}
        empty={<EmptyState titulo="No hay llamados de atención" descripcion="Cuando envíes uno, verás aquí si el residente lo leyó y su respuesta." />}
        columns={[
          { key: "motivo", header: "Motivo", primary: true, cell: (r) => r.motivo },
          { key: "unidad", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "persona", header: "Persona", hideOnMobile: true, cell: (r) => nombreCompleto(r.persona) || "—" },
          { key: "fecha", header: "Fecha", cell: (r) => fecha(r.fecha) },
          { key: "gravedad", header: "Gravedad", cell: (r) => <StatusBadge value={r.gravedad} /> },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/convivencia" />
    </>
  );
}
