import Link from "next/link";
import { KeyRound, Plus, UserCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { fechaHora, hora, tiempoRelativo } from "@/lib/format";
import { label } from "@/lib/labels";
import { historialVisitas, misAutorizaciones } from "@/lib/porteria/autorizaciones";
import { solicitudesResidente } from "@/lib/porteria/solicitudes";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SolicitudesLive } from "./_components/solicitudes-live";

export const metadata = { title: "Visitantes" };

const TABS = [
  { key: "activas", label: "Activas" },
  { key: "pasadas", label: "Vencidas y usadas" },
  { key: "historial", label: "Visitas recibidas" },
];

export default async function VisitantesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("visitantes.autorizar");
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "activas";
  const [solicitudes, auts, historial] = await Promise.all([solicitudesResidente(ctx), misAutorizaciones(ctx), tab === "historial" ? historialVisitas(ctx) : Promise.resolve([])]);
  const lista = tab === "pasadas" ? auts.pasadas : auts.activas;
  return (
    <>
      <PageHeader
        titulo="Visitantes"
        descripcion="Autoriza visitas con un código o QR que compartes por WhatsApp."
        acciones={
          <Button size="lg" render={<Link href="/visitantes/nuevo" />}>
            <Plus /> Autorizar visitante
          </Button>
        }
      />
      <SolicitudesLive
        unidadIds={ctx.unidadIds}
        solicitudes={solicitudes.map((s) => ({ id: s.id, unidad: s.unidad, visitanteNombre: s.visitanteNombre, tipoLabel: label(s.tipo), placa: s.placa, fotoUrl: s.fotoUrl, hace: tiempoRelativo(s.creada) }))}
      />
      <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 no-scrollbar lg:mx-0 lg:px-0" aria-label="Secciones">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/visitantes?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
          >
            {t.label}
            {t.key === "activas" && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px]">{auts.activas.length}</span>}
          </Link>
        ))}
      </nav>
      {tab === "historial" ? (
        historial.length === 0 ? (
          <EmptyState icon={UserCheck} titulo="Aún no has recibido visitas" descripcion="Aquí verás quién ingresó a tu unidad y a qué hora." />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {historial.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{h.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {label(h.sujeto)} · {label(h.medio)} {h.placa && `· ${h.placa}`}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p>Entró {fechaHora(h.hora)}</p>
                  <p className="text-muted-foreground">{h.salida ? `Salió ${hora(h.salida)}` : "Sin salida registrada"}</p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : lista.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          titulo={tab === "activas" ? "No tienes autorizaciones activas" : "Sin autorizaciones anteriores"}
          descripcion="Crea una autorización y comparte el código por WhatsApp: tu visitante solo lo muestra en portería."
          accion={
            <Button render={<Link href="/visitantes/nuevo" />}>
              <Plus /> Autorizar visitante
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id}>
              <Link href={`/visitantes/${a.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 active:opacity-80">
                <span className="grid h-12 min-w-20 place-items-center rounded-lg bg-muted font-mono text-lg font-bold tracking-wider">{a.codigo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.nombreVisitante}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {label(a.tipo)} · {a.vigencia}
                    {ctx.unidadIds.length > 1 && ` · ${a.unidad.codigo}`}
                  </span>
                </span>
                <StatusBadge value={a.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
