import Link from "next/link";
import { Accessibility, Users } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { edad, nombreCompleto } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { torreOptions } from "@/lib/conjunto/options";
import { listarPersonas } from "@/lib/residentes/service";
import { esAdultoMayor, esMenorDeEdad } from "@/lib/residentes/calculos";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Residentes" };

const TIPOS = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"];

export default async function ResidentesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("residentes.ver_todos");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const filtros = { q: spGet(sp, "q"), torre: spGet(sp, "torre"), tipo: spGet(sp, "tipo"), estado: spGet(sp, "estado"), grupo: spGet(sp, "grupo") };
  const [{ rows, total }, torres] = await Promise.all([listarPersonas(ctx, filtros, { skip, take }), torreOptions(ctx)]);
  const verTel = can(ctx, "campos.persona_telefono");
  const verSalud = can(ctx, "campos.persona_salud");
  const hayFiltros = Object.values(filtros).some(Boolean);
  return (
    <>
      <ListToolbar
        placeholder="Buscar por nombre, documento, unidad o celular…"
        exportRecurso={can(ctx, "residentes.exportar") ? "residentes" : undefined}
        filters={[
          { name: "torre", label: "Torre", options: [...torres, { value: "casas", label: "Casas" }] },
          { name: "tipo", label: "Vínculo", options: options(TIPOS) },
          { name: "estado", label: "Estado", options: options(["ACTIVO", "PENDIENTE_APROBACION", "INACTIVO", "RECHAZADO"]) },
          {
            name: "grupo",
            label: "Grupo",
            options: [
              { value: "MENORES", label: "Menores de edad" },
              { value: "MAYORES", label: "Adultos mayores (60+)" },
              ...(verSalud ? [{ value: "MOVILIDAD", label: "Movilidad reducida" }] : []),
              { value: "CON_CUENTA", label: "Con cuenta en la app" },
            ],
          },
        ]}
      />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/residentes/${r.id}`}
        empty={
          <EmptyState
            icon={Users}
            titulo={hayFiltros ? "Nadie coincide con la búsqueda" : "Aún no hay residentes registrados"}
            descripcion={hayFiltros ? "Prueba con otro nombre o quita los filtros." : "Registra propietarios y ocupantes, o invita a los propietarios para que completen su información."}
            accion={
              can(ctx, "residentes.crear") ? (
                <Button render={<Link href="/residentes/nueva" />}>Registrar persona</Button>
              ) : undefined
            }
          />
        }
        columns={[
          {
            key: "nombre",
            header: "Nombre",
            primary: true,
            cell: (r) => (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {nombreCompleto(r)}
                {esMenorDeEdad(r.fechaNacimiento) && <Badge variant="info">Menor</Badge>}
                {esAdultoMayor(r.fechaNacimiento) && <Badge variant="secondary">60+</Badge>}
                {verSalud && (r.movilidadReducida || r.requiereAsistenciaEvacuacion) && <Accessibility className="size-4 text-warning" aria-label="Movilidad reducida" />}
              </span>
            ),
          },
          { key: "unidad", header: "Unidad", cell: (r) => r.vinculos.map((v) => v.unidad.codigo).filter((c, i, a) => a.indexOf(c) === i).join(", ") || "—" },
          { key: "vinculo", header: "Vínculo", cell: (r) => [...new Set(r.vinculos.map((v) => label(v.tipo)))].join(", ") || "—" },
          { key: "edad", header: "Edad", align: "right", hideOnMobile: true, cell: (r) => edad(r.fechaNacimiento) ?? "—" },
          ...(verTel ? [{ key: "tel", header: "Celular", hideOnMobile: true, cell: (r: (typeof rows)[number]) => r.telefono ?? "—" }] : []),
          { key: "cuenta", header: "App", hideOnMobile: true, cell: (r) => (r.usuarioId ? "Sí" : "No") },
          {
            key: "estado",
            header: "Estado",
            cell: (r) => {
              const pend = r.vinculos.some((v) => v.estado === "PENDIENTE_APROBACION");
              return <StatusBadge value={pend ? "PENDIENTE_APROBACION" : r.vinculos.length ? "ACTIVO" : "INACTIVO"} />;
            },
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/residentes" />
    </>
  );
}
