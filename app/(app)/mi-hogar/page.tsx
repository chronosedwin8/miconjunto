import Link from "next/link";
import { Car, Check, ChevronRight, House, Info, Warehouse } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { num } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { PASOS_MI_HOGAR } from "@/lib/residentes/calculos";
import { estadoPanel } from "@/lib/residentes/panel";
import { esPropietarioDe, fichaFisica } from "@/lib/residentes/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InvitarDialog } from "../residentes/_components/invitar-dialog";
import { invitarAction } from "./actions";
import { elegirUnidad, hrefPaso, unidadesDelUsuario } from "./_components/comun";

export const metadata = { title: "Mi hogar" };

export default async function MiHogarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("residentes.ver");
  const sp = await searchParams;
  const unidadId = elegirUnidad(ctx, spGet(sp, "u"));
  if (!unidadId) {
    return (
      <>
        <PageHeader titulo="Mi hogar" />
        <EmptyState
          icon={House}
          titulo="Aún no tienes una unidad vinculada"
          descripcion="Cuando la administración apruebe tu vínculo con una unidad podrás registrar a tu familia, vehículos y mascotas aquí."
          accion={can(ctx, "residentes.ver_todos") ? <Button render={<Link href="/residentes" />}>Ir a residentes</Button> : undefined}
        />
      </>
    );
  }
  const [unidades, u, panel, misVinculos] = await Promise.all([
    unidadesDelUsuario(ctx),
    fichaFisica(ctx, unidadId),
    estadoPanel(ctx, unidadId),
    ctx.db.vinculoUnidad.findMany({ where: { unidadId, estado: "ACTIVO", persona: { usuarioId: ctx.userId } }, select: { tipo: true } }),
  ]);
  const propietario = esPropietarioDe(ctx, unidadId);
  const med = (u.medidores ?? {}) as Record<string, string>;
  const siguiente = PASOS_MI_HOGAR.find((p) => !panel.completados.includes(p.n));
  const tiposInvitacion = options(propietario ? ["FAMILIAR", "ARRENDATARIO", "COPROPIETARIO", "RESIDENTE"] : ["FAMILIAR", "RESIDENTE"]);

  return (
    <>
      <PageHeader
        titulo="Mi hogar"
        descripcion={`${u.codigo}${u.torre ? ` · ${u.torre.nombre}` : ""} · ${misVinculos.map((v) => label(v.tipo)).join(", ") || "Residente"}`}
        acciones={
          can(ctx, "residentes.invitar") ? (
            <InvitarDialog action={invitarAction} unidades={[{ value: unidadId, label: u.codigo }]} defaults={{ unidadId }} tipos={tiposInvitacion} triggerLabel="Invitar a mi hogar" />
          ) : undefined
        }
      />

      {unidades.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar" role="tablist" aria-label="Mis unidades">
          {unidades.map((x) => (
            <Link
              key={x.id}
              href={`/mi-hogar?u=${x.id}`}
              role="tab"
              aria-selected={x.id === unidadId}
              className={cn("inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium", x.id === unidadId ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
            >
              {x.codigo}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-semibold">Información de tu hogar</p>
          <span className="text-sm font-semibold tabular-nums text-primary">{panel.porcentaje} %</span>
        </div>
        <Progress value={panel.porcentaje} aria-label="Avance del registro" />
        <p className="mt-2 text-sm text-muted-foreground">
          {siguiente ? `Te faltan ${PASOS_MI_HOGAR.length - panel.completados.length} pasos. Cada paso se guarda por separado.` : "¡Todo al día! Revisa la información cuando algo cambie."}
        </p>
        {siguiente && (
          <Button className="mt-3 w-full sm:w-auto" render={<Link href={hrefPaso(siguiente.n, unidadId)} />}>
            {panel.completados.length ? "Continuar" : "Empezar"}: {siguiente.titulo} <ChevronRight />
          </Button>
        )}
      </div>

      <Section titulo="Pasos">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PASOS_MI_HOGAR.map((p) => {
            const hecho = panel.completados.includes(p.n);
            return (
              <li key={p.n}>
                <Link href={hrefPaso(p.n, unidadId)} className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/60">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", hecho ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
                    {hecho ? <Check className="size-4" /> : p.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.titulo}</span>
                    {panel.resumen[p.n] && <span className="block truncate text-xs text-muted-foreground">{panel.resumen[p.n]}</span>}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section titulo="Ficha de la unidad">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Tipo</dt>
            <dd className="font-medium">{label(u.tipo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Piso</dt>
            <dd className="font-medium">{u.piso ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Área privada</dt>
            <dd className="font-medium">{u.areaPrivada ? `${num(u.areaPrivada)} m²` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Área construida</dt>
            <dd className="font-medium">{u.areaConstruida ? `${num(u.areaConstruida)} m²` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Coeficiente</dt>
            <dd className="font-medium">{num(u.coeficiente, 6)} %</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Habitaciones / baños</dt>
            <dd className="font-medium">
              {u.habitaciones ?? "—"} / {u.banos ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ocupación</dt>
            <dd>
              <StatusBadge value={u.estadoOcupacion} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Matrícula</dt>
            <dd className="font-medium">{u.matriculaInmobiliaria ?? "—"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-xs text-muted-foreground">Medidores</dt>
            <dd className="font-medium">{[med.agua && `Agua ${med.agua}`, med.luz && `Energía ${med.luz}`, med.gas && `Gas ${med.gas}`].filter(Boolean).join(" · ") || "Sin registrar"}</dd>
          </div>
        </dl>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
            <Car className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Parqueaderos</p>
              <p className="text-muted-foreground">{u.parqueaderos.length ? u.parqueaderos.map((p) => `${p.codigo} (${label(p.tipo).toLowerCase()}${p.ubicacion ? `, ${p.ubicacion}` : ""})`).join(" · ") : "Sin parqueadero asignado"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
            <Warehouse className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Bodega o depósito</p>
              <p className="text-muted-foreground">{u.bodegas.length ? u.bodegas.map((b) => `${b.codigo}${b.ubicacion ? ` (${b.ubicacion})` : ""}`).join(" · ") : "Sin bodega asignada"}</p>
            </div>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" /> ¿Algún dato de la ficha está mal? Repórtalo a la administración desde PQRS.
        </p>
      </Section>
    </>
  );
}
