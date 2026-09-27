import { requirePage } from "@/lib/auth/guard";
import { TIPOS_IMPORTACION } from "@/lib/importacion/service";
import { fechaHora } from "@/lib/format";
import { Importer } from "@/components/app/importer";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { aplicarImportacionAction } from "./actions";

export const metadata = { title: "Importar desde Excel" };

export default async function ImportarPage() {
  const ctx = await requirePage("conjunto.importar");
  const historial = await ctx.db.importacionApertura.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  const tipos = Object.entries(TIPOS_IMPORTACION).map(([value, d]) => ({ value, label: d.titulo, plantilla: d.plantilla }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section titulo="Importación masiva">
        <Importer tipos={tipos} aplicar={aplicarImportacionAction} />
      </Section>
      <Section titulo="Historial de cargas">
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {historial.length === 0 && <li className="p-4 text-muted-foreground">Sin cargas todavía.</li>}
          {historial.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{TIPOS_IMPORTACION[h.tipo as keyof typeof TIPOS_IMPORTACION]?.titulo ?? h.tipo}</p>
                <p className="text-xs text-muted-foreground">
                  {h.archivoNombre} · {fechaHora(h.createdAt)} · {h.filasOk}/{h.totalFilas} válidas
                </p>
                {h.filasError > 0 && (
                  <a className="text-xs text-primary" href={`/api/importar/${h.id}/errores`}>
                    Reporte de errores
                  </a>
                )}
              </div>
              <StatusBadge value={h.estado} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
