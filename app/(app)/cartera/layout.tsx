import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function CarteraLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["cartera.ver_todos", "pagos.ver_todos", "paz_y_salvo.ver_todos"]);
  const verCartera = can(ctx, "cartera.ver_todos");
  const tabs = [
    ...(verCartera ? [{ href: "/cartera", label: "Tablero" }, { href: "/cartera/cuotas", label: "Cuotas" }] : []),
    ...(can(ctx, "pagos.ver_todos") ? [{ href: "/cartera/pagos", label: "Pagos" }] : []),
    ...(can(ctx, "cartera.generar") ? [{ href: "/cartera/generar", label: "Generar mes" }] : []),
    ...(verCartera ? [{ href: "/cartera/extraordinarias", label: "Extraordinarias" }, { href: "/cartera/acuerdos", label: "Acuerdos" }, { href: "/cartera/gestiones", label: "Gestiones" }] : []),
    ...(can(ctx, "cartera.gestionar_cobro") ? [{ href: "/cartera/cartas", label: "Cartas" }, { href: "/cartera/campanas-cobro", label: "Campañas" }] : []),
    ...(can(ctx, ["paz_y_salvo.ver_todos", "paz_y_salvo.emitir"]) ? [{ href: "/cartera/paz-y-salvo", label: "Paz y salvo" }] : []),
    ...(can(ctx, "pagos.conciliar") ? [{ href: "/cartera/conciliacion", label: "Conciliación" }] : []),
    ...(verCartera ? [{ href: "/cartera/conceptos", label: "Conceptos" }, { href: "/cartera/tasa-mora", label: "Tasa de mora" }] : []),
    ...(can(ctx, ["cartera.exportar", "pagos.exportar"]) ? [{ href: "/cartera/exportar-contable", label: "Exportación contable" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Cartera y recaudo" descripcion={ctx.conjunto.nombre} className="mb-3" />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
