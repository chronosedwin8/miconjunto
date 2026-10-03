import Link from "next/link";
import { Building2, Info, MailCheck, PauseCircle, PlayCircle, Trash2, Users, X } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { gestionaAccesos, miAccesoDerivado, panelAccesos, unidadesComoTitular, type MiembroAcceso } from "@/lib/hogar/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/form/action-form";
import { cn } from "@/lib/utils";
import { Avatar } from "../_components/comun";
import { CapChips } from "./_components/cap-chips";
import { EditarAccesoDialog, InvitarAccesoDialog, ReenviarInvitacionButton } from "./_components/acceso-forms";
import { TuAcceso } from "./_components/tu-acceso";
import {
  cancelarInvitacionAccesoAction,
  editarAccesoAction,
  invitarAccesoAction,
  pausarAccesoAction,
  quitarAccesoAction,
  reenviarInvitacionAccesoAction,
} from "./actions";

export const metadata = { title: "Accesos de mi hogar" };

const DESCRIPCION = "Da acceso a la app a quienes viven o trabajan en tu hogar, solo con lo que necesitan.";

export default async function AccesosHogarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const pedida = spGet(sp, "u");
  const gestor = gestionaAccesos(ctx);
  const mias = await unidadesComoTitular(ctx);
  const unidadId = (gestor && pedida) || mias.find((x) => x.id === pedida)?.id || mias[0]?.id;

  if (!unidadId) {
    const mi = await miAccesoDerivado(ctx);
    return (
      <>
        <PageHeader titulo="Accesos de mi hogar" volver="/mi-hogar" />
        {mi.length ? (
          <TuAcceso accesos={mi} />
        ) : (
          <EmptyState
            icon={gestor ? Building2 : Users}
            titulo={gestor ? "Elige una unidad" : "Solo el titular gestiona los accesos"}
            descripcion={
              gestor
                ? "Abre la ficha de una unidad en Conjunto → Unidades y entra a “Accesos a la app”."
                : "El propietario o el arrendatario de la unidad decide quién más entra a la app y qué puede hacer."
            }
            accion={gestor ? <Button render={<Link href="/conjunto/unidades" />}>Ir a unidades</Button> : undefined}
          />
        )}
      </>
    );
  }

  const p = await panelAccesos(ctx, unidadId);
  const propia = mias.some((m) => m.id === unidadId);
  const invitar = p.otorgantes.length ? (
    <InvitarAccesoDialog action={invitarAccesoAction} unidadId={unidadId} otorgantes={p.otorgantes} porDefecto={p.porDefecto} className="w-full sm:w-auto" />
  ) : null;
  const activos = p.miembros.filter((m) => m.derivado);
  const sinLimites = p.miembros.filter((m) => !m.derivado);

  return (
    <>
      <PageHeader
        titulo={propia ? "Accesos de mi hogar" : `Accesos de ${p.unidad.codigo}`}
        descripcion={propia ? `${p.unidad.codigo} · ${DESCRIPCION}` : "Personas que entran a la app por esta unidad y lo que pueden hacer."}
        volver={propia ? `/mi-hogar?u=${unidadId}` : `/conjunto/unidades/${unidadId}`}
        acciones={invitar}
      />

      {propia && mias.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar" role="tablist" aria-label="Mis unidades">
          {mias.map((x) => (
            <Link
              key={x.id}
              href={`/mi-hogar/accesos?u=${x.id}`}
              role="tab"
              aria-selected={x.id === unidadId}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
                x.id === unidadId ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {x.codigo}
            </Link>
          ))}
        </div>
      )}

      <p className="mb-5 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>Cada persona entra con su propia cuenta. Si el titular que dio el acceso deja la unidad, sus accesos terminan solos.</span>
      </p>

      <Section titulo="Titulares">
        <ul className="divide-y rounded-xl border bg-card">
          {p.titulares.map((t) => (
            <li key={t.id} className="flex min-h-14 items-center gap-3 p-3">
              <Avatar nombre={t.nombre} fotoUrl={t.fotoUrl} size="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {t.nombre}
                  {t.esYo && <span className="font-normal text-muted-foreground"> (tú)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {label(t.tipo)}
                  {t.principal && " · principal"}
                  {!t.conCuenta && " · sin cuenta en la app"}
                </p>
              </div>
              <Badge variant="secondary">Acceso completo</Badge>
            </li>
          ))}
          {!p.titulares.length && <li className="p-4 text-sm text-muted-foreground">La unidad no tiene titular activo.</li>}
        </ul>
      </Section>

      {activos.length + sinLimites.length + p.invitaciones.length === 0 ? (
        <EmptyState
          icon={Users}
          titulo="Aún no has dado acceso a nadie"
          descripcion="Invita a tu familia, a la empleada o al cuidador: podrán autorizar visitas o ver sus paquetes sin usar tu cuenta."
          accion={invitar}
        />
      ) : null}

      {activos.length > 0 && (
        <Section titulo={`Personas con acceso (${activos.length})`}>
          <ul className="space-y-2">
            {activos.map((m) => (
              <MiembroCard key={m.id} m={m} />
            ))}
          </ul>
        </Section>
      )}

      {p.invitaciones.length > 0 && (
        <Section titulo={`Invitaciones pendientes (${p.invitaciones.length})`}>
          <ul className="space-y-2">
            {p.invitaciones.map((i) => (
              <li key={i.id} className="rounded-xl border border-dashed bg-card p-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <MailCheck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.nombre || i.email}</p>
                    {i.nombre && <p className="truncate text-xs text-muted-foreground">{i.email}</p>}
                    <p className="text-xs text-muted-foreground">{label(i.tipo)}</p>
                  </div>
                  <Badge variant={i.vencida ? "destructive" : "warning"}>{i.vencida ? "Vencida" : "Sin aceptar"}</Badge>
                </div>
                <CapChips caps={i.capacidades} apagado className="mt-3" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {i.vencida ? `Venció el ${fecha(i.expira)}.` : `El enlace vence el ${fecha(i.expira)}.`}
                  {i.otorgadoPor && ` Otorgada por ${i.otorgadoPor}.`}
                </p>
                {i.puedeGestionar && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ReenviarInvitacionButton action={reenviarInvitacionAccesoAction} invitacionId={i.id} />
                    <ActionButton
                      action={cancelarInvitacionAccesoAction}
                      input={{ invitacionId: i.id }}
                      variant="ghost"
                      className="w-full text-destructive"
                      confirm={`¿Cancelar la invitación de ${i.nombre || i.email}? El enlace dejará de funcionar.`}
                      successMessage="Invitación cancelada"
                    >
                      <X /> Cancelar
                    </ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sinLimites.length > 0 && (
        <Section titulo={`Con todos los permisos de su rol (${sinLimites.length})`}>
          <p className="mb-2 text-sm text-muted-foreground">
            Entraron antes de que existieran los accesos del hogar. Ajusta sus permisos para que solo puedan hacer lo necesario.
          </p>
          <ul className="space-y-2">
            {sinLimites.map((m) => (
              <MiembroCard key={m.id} m={m} />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function EstadoBadge({ m }: { m: MiembroAcceso }) {
  if (m.estado === "PENDIENTE_APROBACION") return <Badge variant="warning">Por aprobar</Badge>;
  if (m.pausado) return <Badge variant="secondary">En pausa</Badge>;
  if (!m.derivado) return <Badge variant="outline">Sin límites</Badge>;
  return <Badge variant="success">Activo</Badge>;
}

function MiembroCard({ m }: { m: MiembroAcceso }) {
  const primerNombre = m.nombre.split(" ")[0];
  return (
    <li className={cn("rounded-xl border bg-card p-3", m.pausado && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <Avatar nombre={m.nombre} fotoUrl={m.fotoUrl} size="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{m.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {label(m.tipo)}
            {m.menor && " · menor de edad"}
            {m.esTitular && " · titular de su hogar"}
          </p>
          {m.otorgadoPor && <p className="text-xs text-muted-foreground">Otorgado por {m.otorgadoPor}</p>}
        </div>
        <EstadoBadge m={m} />
      </div>
      {m.derivado ? (
        <CapChips caps={m.capacidades} apagado={m.pausado} className="mt-3" />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Puede usar todo lo que su rol permite en la unidad.</p>
      )}
      {m.ultimoAcceso && <p className="mt-2 text-xs text-muted-foreground">Último ingreso: {fecha(m.ultimoAcceso)}</p>}
      {m.puedeGestionar && (
        <div className={cn("mt-3 grid gap-2", m.derivado ? "grid-cols-3" : "grid-cols-2")}>
          <EditarAccesoDialog
            action={editarAccesoAction}
            vinculoId={m.id}
            nombre={m.nombre}
            tipo={m.tipo}
            menor={m.menor}
            capacidades={m.capacidades}
            otorgables={m.otorgables}
            derivado={m.derivado}
          />
          {m.derivado && (
            <ActionButton
              action={pausarAccesoAction}
              input={{ vinculoId: m.id, pausar: !m.pausado }}
              variant="outline"
              className="w-full"
              successMessage={m.pausado ? "Acceso reanudado" : "Acceso en pausa"}
            >
              {m.pausado ? <PlayCircle /> : <PauseCircle />} {m.pausado ? "Reanudar" : "Pausar"}
            </ActionButton>
          )}
          <ActionButton
            action={quitarAccesoAction}
            input={{ vinculoId: m.id }}
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10"
            confirm={`¿Quitarle el acceso a ${primerNombre}? Ya no podrá entrar a la app por esta unidad${m.esTitular ? " y terminarán los accesos que haya dado a su hogar" : ""}.`}
            successMessage="Acceso retirado"
          >
            <Trash2 /> Quitar
          </ActionButton>
        </div>
      )}
    </li>
  );
}
