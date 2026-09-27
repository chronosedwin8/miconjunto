import { TabsNav } from "@/components/app/tabs-nav";

/** Pestañas de la mesa de ayuda para administración. */
export function TabsGestion() {
  return (
    <TabsNav
      exact
      tabs={[
        { href: "/tickets", label: "Tablero" },
        { href: "/tickets/indicadores", label: "Indicadores" },
        { href: "/tickets/plantillas", label: "Plantillas de respuesta" },
      ]}
    />
  );
}
