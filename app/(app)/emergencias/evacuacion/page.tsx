import Link from "next/link";
import { Accessibility, Download, FileText, Phone } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { agruparEvacuacion, listaEvacuacion } from "@/lib/emergencias/service";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Evacuación asistida" };

const exportar = (formato: string) => `/api/export/evacuacion?formato=${formato}`;

export default async function EvacuacionPage() {
  const ctx = await requirePage(["emergencias.lista_evacuacion", "campos.persona_salud"]);
  const filas = await listaEvacuacion(ctx);
  const torres = agruparEvacuacion(filas);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filas.length} persona(s) o unidad(es) requieren ayuda para evacuar. Datos sensibles: úsalos solo para atender emergencias.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href={exportar("pdf")} />}>
            <FileText /> PDF para brigadistas
          </Button>
          <Button variant="outline" size="sm" render={<a href={exportar("xlsx")} />}>
            <Download /> Excel
          </Button>
        </div>
      </div>
      {torres.length === 0 ? (
        <EmptyState icon={Accessibility} titulo="Nadie requiere asistencia registrada" descripcion="Cuando los residentes indiquen movilidad reducida en Mi hogar o en su perfil, aparecerán aquí por torre y piso." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {torres.map((t) => (
            <Section key={t.torre} titulo={`${t.torre} · ${t.total} ${t.total === 1 ? "persona" : "personas"}`}>
              <div className="overflow-hidden rounded-xl border bg-card">
                {t.pisos.map((p) => (
                  <div key={p.piso} className="flex border-b last:border-0">
                    <div className="grid w-16 shrink-0 place-items-center bg-muted text-center text-xs font-semibold">
                      {p.piso ? (
                        <span>
                          Piso
                          <span className="block text-lg">{p.piso}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                    <ul className="flex-1 divide-y">
                      {p.personas.map((f, i) => (
                        <li key={`${f.personaId}${f.unidad}${i}`} className="flex items-start justify-between gap-2 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">
                              <span className="mr-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-bold">{f.unidad}</span>
                              {f.personaId ? (
                                <Link href={`/residentes/${f.personaId}`} className="hover:underline">
                                  {f.nombre}
                                </Link>
                              ) : (
                                f.nombre
                              )}
                              {f.edad !== null && <span className="font-normal text-muted-foreground"> · {f.edad} años</span>}
                            </p>
                            {f.descripcion && <p className="text-muted-foreground">{f.descripcion}</p>}
                            {f.contactoEmergencia && <p className="text-xs text-muted-foreground">Contacto: {f.contactoEmergencia}</p>}
                          </div>
                          {f.telefono && (
                            <a href={`tel:${f.telefono}`} className="grid size-11 shrink-0 place-items-center rounded-full border" aria-label={`Llamar a ${f.nombre}`}>
                              <Phone className="size-4" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
