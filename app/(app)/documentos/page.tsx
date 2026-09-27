import Link from "next/link";
import { BookCheck, FileText, TriangleAlert } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { CATEGORIAS_DOCUMENTO, esGestorDocumentos, listarDocumentos, whereCarpetaVisible } from "@/lib/documentos/service";
import { PageHeader } from "@/components/app/page-header";
import { ListToolbar } from "@/components/app/list-toolbar";
import { DataList, Pager } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CamposDocumento, RolesVisibles } from "./_components/campos";
import { guardarCarpetaAction, guardarDocumentoAction } from "./actions";

export const metadata = { title: "Documentos" };

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("documentos.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const carpetaId = spGet(sp, "carpeta");
  const pendientes = spGet(sp, "pendientes") === "1";
  const gestor = esGestorDocumentos(ctx);
  const [res, carpetas, roles, porLeer] = await Promise.all([
    listarDocumentos(ctx, { q: spGet(sp, "q"), carpetaId, categoria: spGet(sp, "categoria"), pendientes, skip: pendientes ? 0 : skip, take: pendientes ? 200 : take }),
    ctx.db.carpetaDocumento.findMany({ where: whereCarpetaVisible(ctx), orderBy: { nombre: "asc" }, include: { _count: { select: { documentos: { where: { deletedAt: null } } } } } }),
    gestor ? ctx.db.rol.findMany({ orderBy: { nombre: "asc" }, select: { clave: true, nombre: true } }) : [],
    listarDocumentos(ctx, { pendientes: true, take: 200 }).then((r) => r.items.length),
  ]);
  const rolOpts = roles.map((r) => ({ value: r.clave, label: r.nombre }));
  const carpetaOpts = carpetas.map((c) => ({ value: c.id, label: c.nombre }));
  const hoy = Date.now();
  const chip = (href: string, text: string, on: boolean) => (
    <Link key={href + text} href={href} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
      {text}
    </Link>
  );

  return (
    <>
      <PageHeader
        titulo="Documentos"
        descripcion="Reglamento, manual de convivencia, actas, presupuestos, pólizas y circulares"
        acciones={
          can(ctx, "documentos.crear") ? (
            <>
              <FormDialog titulo="Nueva carpeta" action={guardarCarpetaAction} triggerLabel="Carpeta" triggerVariant="outline" successMessage="Carpeta creada">
                <TextField name="nombre" label="Nombre" required maxLength={80} placeholder="Ej.: Actas de asamblea" />
                <RolesVisibles roles={rolOpts} />
              </FormDialog>
              <FormDialog titulo="Subir documento" action={guardarDocumentoAction} triggerLabel="Subir documento" successMessage="Documento publicado" redirectTo="/documentos/{id}" wide>
                <CamposDocumento carpetas={carpetaOpts} roles={rolOpts} />
              </FormDialog>
            </>
          ) : null
        }
      />
      {porLeer > 0 && !pendientes && (
        <Link href="/documentos?pendientes=1" className="mb-3 flex min-h-12 items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 text-sm font-medium">
          <BookCheck className="size-5 text-warning" /> Tienes {porLeer} documento{porLeer > 1 ? "s" : ""} por confirmar lectura
        </Link>
      )}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0" aria-label="Carpetas">
        {chip("/documentos", "Todos", !carpetaId && !pendientes)}
        {pendientes && chip("/documentos?pendientes=1", "Por confirmar", true)}
        {carpetas.map((c) => chip(`/documentos?carpeta=${c.id}`, `${c.nombre} (${c._count.documentos})`, carpetaId === c.id))}
      </div>
      <ListToolbar
        placeholder="Buscar por título o contenido…"
        exportRecurso={gestor ? "documentos" : undefined}
        filters={[{ name: "categoria", label: "Categoría", options: CATEGORIAS_DOCUMENTO.map((c) => ({ value: c, label: label(c) })) }]}
      />
      <DataList
        rows={res.items}
        rowKey={(d) => d.id}
        rowHref={(d) => `/documentos/${d.id}`}
        empty={<EmptyState icon={FileText} titulo={pendientes ? "¡Estás al día!" : "No hay documentos"} descripcion={pendientes ? "Confirmaste la lectura de todos los documentos." : "Cuando la administración publique documentos, aparecerán aquí."} />}
        columns={[
          {
            key: "titulo",
            header: "Documento",
            primary: true,
            cell: (d) => (
              <span className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {d.titulo}
                  {d.requiereAcuse && !d.acusado && (
                    <Badge variant="warning" className="ml-2">
                      Por confirmar
                    </Badge>
                  )}
                  {!d.publicado && (
                    <Badge variant="secondary" className="ml-2">
                      Borrador
                    </Badge>
                  )}
                </span>
              </span>
            ),
          },
          { key: "cat", header: "Categoría", cell: (d) => label(d.categoria) },
          { key: "carpeta", header: "Carpeta", hideOnMobile: true, cell: (d) => d.carpeta?.nombre ?? "—" },
          { key: "ver", header: "Versión", cell: (d) => `v${d.versionActual} · ${fecha(d.ultima?.createdAt ?? d.updatedAt)}` },
          {
            key: "vence",
            header: "Vence",
            cell: (d) =>
              d.vence ? (
                <span className={cn(d.vence.getTime() < hoy ? "text-destructive" : d.vence.getTime() < hoy + 30 * 86_400_000 ? "text-warning" : "")}>
                  {d.vence.getTime() < hoy + 30 * 86_400_000 && <TriangleAlert className="mr-1 inline size-3.5" />}
                  {fecha(d.vence)}
                </span>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {!pendientes && <Pager page={page} pageSize={pageSize} total={res.total} searchParams={spFlat(sp)} basePath="/documentos" />}
    </>
  );
}
